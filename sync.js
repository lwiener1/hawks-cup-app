// Live sync via Firestore. Optional: with no Firebase config (or no trip
// code) the app runs purely on this device's localStorage.
//
// Safety rules that matter on a golf course:
//  - Never write until we've adopted what's already on the server (or the
//    server confirmed the trip is empty), so a stale phone can't overwrite
//    live scores.
//  - Writes queue offline (Firestore persistence) and flush when signal
//    returns.

const FIREBASE_VERSION = '10.12.2';
const FIREBASE_SCRIPTS = [
  `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app-compat.js`,
  `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore-compat.js`,
];

const Sync = {
  col: null, unsub: null, ready: false, lastPushed: {}, status: 'local', persistenceTried: false, runId: 0,
};

function syncAvailable() { return !!window.FIREBASE_CONFIG; }

function normalizeTripCode(code) {
  return String(code || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
}

function setSyncStatus(status) {
  if (Sync.status === status) return;
  Sync.status = status;
  if (getState()) render();
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.crossOrigin = 'anonymous';
    s.onload = resolve; s.onerror = () => reject(new Error('Could not load ' + src));
    document.head.appendChild(s);
  });
}

async function ensureFirebase() {
  if (window.firebase && window.firebase.firestore) return;
  for (const src of FIREBASE_SCRIPTS) await loadScript(src);
}

function stopSync() {
  Sync.runId++;
  if (Sync.unsub) { try { Sync.unsub(); } catch (e) { /* already closed */ } }
  Sync.unsub = null; Sync.col = null; Sync.photosCol = null; Sync.ready = false; Sync.lastPushed = {};
}

function stableMap(docs) {
  const out = {};
  Object.keys(docs).forEach((k) => { out[k] = stableStringify(docs[k]); });
  return out;
}

function sameMap(a, b) {
  const ak = Object.keys(a), bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => a[k] === b[k]);
}

async function startSync() {
  stopSync();
  const runId = Sync.runId;
  const code = normalizeTripCode(getState().ui.tripCode);
  if (!syncAvailable() || !code) { setSyncStatus('local'); return; }

  setSyncStatus('connecting');
  try { await ensureFirebase(); } catch (e) { if (runId === Sync.runId) setSyncStatus('offline'); return; }
  if (runId !== Sync.runId) return;

  try {
    if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
    const db = firebase.firestore();
    if (!Sync.persistenceTried) {
      Sync.persistenceTried = true;
      try { await db.enablePersistence({ synchronizeTabs: true }); } catch (e) { /* private mode etc: still works online */ }
    }
    if (runId !== Sync.runId) return;
    Sync.col = db.collection('trips').doc(code).collection('docs');
    Sync.photosCol = db.collection('trips').doc(code).collection('photos');
    Sync.unsub = Sync.col.onSnapshot({ includeMetadataChanges: true },
      (snap) => { if (runId === Sync.runId) onSyncSnapshot(snap); },
      () => { if (runId === Sync.runId) setSyncStatus('error'); });
  } catch (e) {
    console.warn('Sync failed to start', e);
    setSyncStatus('error');
  }
}

function onSyncSnapshot(snap) {
  const fromCache = snap.metadata.fromCache;
  setSyncStatus(fromCache ? 'offline' : 'live');

  if (snap.empty) {
    // Only a confirmed-from-server empty trip may be initialised; an empty
    // local cache just means "haven't heard from the server yet".
    if (!fromCache && !Sync.ready) {
      Sync.ready = true;
      Sync.lastPushed = {};
      syncPush();
    }
    return;
  }

  const docs = {};
  snap.docs.forEach((d) => { docs[d.id] = d.data(); });
  const incoming = stableMap(docs);
  const wasReady = Sync.ready;
  Sync.ready = true;
  if (wasReady && sameMap(incoming, Sync.lastPushed)) return;

  Sync.lastPushed = incoming;
  const state = getState();
  const next = assembleState(docs, state.ui);
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, next);
  persist();
  render();
}

// Writes only the documents that changed since we last synced.
function syncPush() {
  if (!Sync.col || !Sync.ready) return;
  const docs = flattenState(getState());
  const now = stableMap(docs);
  const ops = [];
  Object.keys(now).forEach((k) => { if (Sync.lastPushed[k] !== now[k]) ops.push({ k, doc: docs[k] }); });
  Object.keys(Sync.lastPushed).forEach((k) => { if (!(k in now)) ops.push({ k, doc: null }); });
  if (!ops.length) return;
  Sync.lastPushed = now;

  const db = firebase.firestore();
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    ops.slice(i, i + 400).forEach((op) => {
      const ref = Sync.col.doc(op.k);
      if (op.doc === null) batch.delete(ref); else batch.set(ref, op.doc);
    });
    batch.commit().catch((e) => { console.warn('Sync write failed', e); setSyncStatus('error'); });
  }
}
