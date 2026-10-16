// Scorecard photos. Each round can have photos of the paper cards so the
// scores entered in the app can be checked against them.
//
// Storage, chosen so photos never bloat the app's saved data or slow sync:
//  - state.photos holds only a tiny thumbnail + who/when (this syncs with
//    everything else as `photo_<id>` documents).
//  - the full-size image lives in this phone's IndexedDB and, when sync is on,
//    in a separate Firestore collection (`trips/<code>/photos/<id>`) that
//    phones only download when someone opens that photo.

const PhotoCache = {};   // id -> full-size data URL, this session only
const PHOTO_MAX_CHARS = 850000;   // a Firestore document must stay under 1 MiB
let photoShareProblemAt = 0;      // when sharing a photo last failed (so a success message doesn't hide the warning)

// ---- tiny IndexedDB wrapper (silently disabled where IndexedDB isn't available)
let photoDbPromise = null;
function photoDb() {
  if (!photoDbPromise) {
    photoDbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open('hawks-cup-photos', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('p');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }
  return photoDbPromise;
}
async function idbPut(id, value) {
  const db = await photoDb(); if (!db) return;
  await new Promise((resolve) => { const tx = db.transaction('p', 'readwrite'); tx.objectStore('p').put(value, id); tx.oncomplete = resolve; tx.onerror = resolve; tx.onabort = resolve; });
}
async function idbGet(id) {
  const db = await photoDb(); if (!db) return null;
  return new Promise((resolve) => { const r = db.transaction('p').objectStore('p').get(id); r.onsuccess = () => resolve(r.result || null); r.onerror = () => resolve(null); });
}
async function idbDelete(id) {
  const db = await photoDb(); if (!db) return;
  await new Promise((resolve) => { const tx = db.transaction('p', 'readwrite'); tx.objectStore('p').delete(id); tx.oncomplete = resolve; tx.onerror = resolve; tx.onabort = resolve; });
}

// ---- small on-screen message that survives re-renders
function showNotice(text) {
  let el = document.getElementById('notice');
  if (!el) {
    el = document.createElement('div');
    el.id = 'notice';
    el.style.cssText = 'position:fixed;left:12px;right:12px;bottom:84px;z-index:90;background:var(--ink);color:#fff;font-size:13px;font-weight:700;line-height:1.4;padding:12px 14px;max-width:456px;margin:0 auto';
    document.body.appendChild(el);
  }
  el.textContent = text;
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => { el.remove(); }, 7000);
}

// ---- compress a phone photo (often 4-10 MB) down to a few hundred KB
async function compressImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((ok, bad) => { img.onload = ok; img.onerror = () => bad(new Error('that file is not a picture')); img.src = url; });
    const draw = (maxEdge, quality) => {
      const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
      return { dataUrl: cv.toDataURL('image/jpeg', quality), w, h };
    };
    let full = null;
    for (const [edge, q] of [[1800, 0.75], [1600, 0.68], [1400, 0.6], [1200, 0.55], [1000, 0.5]]) {
      full = draw(edge, q);
      if (full.dataUrl.length < PHOTO_MAX_CHARS) break;
    }
    if (full.dataUrl.length >= PHOTO_MAX_CHARS) throw new Error('that picture is too large to store');
    return { full: full.dataUrl, thumb: draw(240, 0.6).dataUrl, w: full.w, h: full.h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---- full-size image storage
function photosCollection() { return (typeof Sync !== 'undefined' && Sync.photosCol) || null; }

async function savePhotoData(id, dataUrl) {
  PhotoCache[id] = dataUrl;
  await idbPut(id, dataUrl);
  const col = photosCollection();
  if (!col) return;
  // Not awaited on purpose: offline, Firestore only confirms once signal returns.
  col.doc(id).set({ data: dataUrl, ts: Date.now() }).catch((e) => {
    photoShareProblemAt = Date.now();
    const denied = e && (e.code === 'permission-denied' || /permission/i.test(e.message || ''));
    showNotice(denied
      ? 'Photo saved on this phone only. To share photos, update the Firebase rules (see the setup steps).'
      : 'Photo saved on this phone; sharing it failed. It stays on this phone.');
  });
}

async function getPhotoData(id) {
  if (PhotoCache[id]) return PhotoCache[id];
  const local = await idbGet(id);
  if (local) { PhotoCache[id] = local; return local; }
  const col = photosCollection();
  if (!col) return null;
  try {
    const snap = await col.doc(id).get();
    if (snap.exists) {
      const data = snap.data().data;
      PhotoCache[id] = data;
      idbPut(id, data);
      return data;
    }
  } catch (e) { /* offline and not cached, or no permission */ }
  return null;
}

function deletePhotoData(id) {
  delete PhotoCache[id];
  idbDelete(id);
  const col = photosCollection();
  if (col) col.doc(id).delete().catch(() => {});
}

// ---- actions ---------------------------------------------------------------

function photosFor(state, sessionId) {
  return state.photos.filter((p) => p.sessionId === sessionId).sort((a, b) => a.ts - b.ts);
}

function openVerify(sessionId) {
  update((state) => { state.ui.verifySessionId = sessionId; state.ui.screen = 'verify'; });
}

async function addPhotos(sessionId, files) {
  const list = Array.from(files || []);
  if (!list.length) return;
  showNotice(`Saving ${list.length} photo${list.length > 1 ? 's' : ''}…`);
  let saved = 0, lastError = null;
  for (const file of list) {
    try {
      const c = await compressImage(file);
      const id = uid('ph');
      await savePhotoData(id, c.full);
      update((state) => {
        state.photos.push({ id, sessionId, by: myName(state), ts: Date.now(), thumb: c.thumb, w: c.w, h: c.h });
      });
      saved++;
    } catch (e) { lastError = e; }
  }
  if (saved) {
    const session = findSession(sessionId);
    update((state) => {
      state.feed.unshift({
        id: uid('fd'), author: 'Hawks Cup', isSystem: true, ts: Date.now(),
        text: `${myName(state)} added ${saved} scorecard photo${saved > 1 ? 's' : ''} for ${courseFor(session).name}.`,
      });
    });
    if (Date.now() - photoShareProblemAt > 8000) showNotice(`${saved} photo${saved > 1 ? 's' : ''} added.`);
  }
  if (lastError) showNotice(`Couldn’t add a photo: ${lastError.message}.`);
}

function viewPhoto(id) {
  update((state) => { state.ui.viewPhotoId = id; state.ui.photoZoom = 1; });
  if (!PhotoCache[id]) getPhotoData(id).then(() => render());
}

function closePhoto() {
  update((state) => { state.ui.viewPhotoId = null; });
}

function zoomPhoto(delta) {
  update((state) => { state.ui.photoZoom = Math.max(1, Math.min(4, (state.ui.photoZoom || 1) + delta)); });
}

function removePhoto(id) {
  update((state) => {
    state.photos = state.photos.filter((p) => p.id !== id);
    state.ui.viewPhotoId = null;
  });
  deletePhotoData(id);
}

// ---- verification -----------------------------------------------------------

// A fingerprint of every score entered in the round, so a "verified" stamp
// can tell when scores were changed afterwards.
function sessionScoreSig(session) {
  const text = stableStringify(session.matches.map((m) => m.grossScores));
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return String(h);
}

function verifyStatus(session) {
  if (!session.verified) return 'none';
  return session.verified.sig === sessionScoreSig(session) ? 'ok' : 'stale';
}

function markVerified(sessionId) {
  update((state) => {
    const session = findSession(sessionId);
    session.verified = { by: myName(state), ts: Date.now(), sig: sessionScoreSig(session) };
    state.feed.unshift({
      id: uid('fd'), author: 'Hawks Cup', isSystem: true, ts: Date.now(),
      text: `${myName(state)} checked the ${courseFor(session).name} scores against the scorecards — verified.`,
    });
  });
}

function clearVerified(sessionId) {
  update((state) => { findSession(sessionId).verified = null; });
}

// Jump to the scoring card on a given hole to correct it; Back returns to
// the verify screen.
function fixHole(matchId, holeIdx) {
  update((state) => {
    setViewedHole(state, matchId, holeIdx);
    state.ui.cardMatchId = matchId;
    state.ui.cardFrom = 'verify';
    state.ui.screen = 'card';
  });
}
