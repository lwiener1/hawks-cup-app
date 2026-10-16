// All state mutations. UI code only ever calls these — never touches
// STATE directly — so store.update() is the single choke point for
// persisting, syncing and re-rendering.

function ordinal(n) {
  n = Number(n);
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function myName(state) {
  return state.ui.me ? PLAYERS_BY_ID[state.ui.me].name : 'Someone';
}

// Pairings are always derived from a session's shape + its two team
// orders, so "Captains' draft" only needs to shuffle the orders.
function pairingsFromOrders(shape, teamLOrder, teamTOrder) {
  if (shape === 'singles') {
    return teamLOrder.map((id, i) => ({ sideA: [id], sideB: [teamTOrder[i]] }));
  }
  return [
    { sideA: teamLOrder.slice(0, 2), sideB: teamTOrder.slice(0, 2) },
    { sideA: teamLOrder.slice(2, 4), sideB: teamTOrder.slice(2, 4) },
  ];
}

// Who gets how many strokes in a pairing, under the match's handicap rule
// (singles: full difference; 2v2: 90% of each, strokes off the low player).
function pairingStrokesNote(sideA, sideB, session) {
  const ids = sideA.concat(sideB);
  const strokes = handicapAllocation(ids, session);
  const receivers = ids.filter((id) => strokes[id] > 0);
  if (!receivers.length) return 'Off scratch';
  if (sideA.length === 1) return `${PLAYERS_BY_ID[receivers[0]].name} gets ${strokes[receivers[0]]}`;
  const low = ids.find((id) => strokes[id] === 0);
  return `${PLAYERS_BY_ID[low].name} low · ` + receivers.map((id) => `${PLAYERS_BY_ID[id].name} +${strokes[id]}`).join(', ');
}

function goScreen(screen) {
  update((state) => { state.ui.screen = screen; });
}

function goBack() {
  update((state) => {
    const s = state.ui.screen;
    if (s === 'card' && state.ui.cardFrom === 'verify' && findSession(state.ui.verifySessionId)) state.ui.screen = 'verify';
    else state.ui.screen = (s === 'card' || s === 'setup' || s === 'verify') ? 'rounds' : 'cup';
    state.ui.cardFrom = 'rounds';
  });
}

function openSetup(sessionId) {
  update((state) => { state.ui.setupSessionId = sessionId; state.ui.screen = 'setup'; });
}

function openCard(matchId) {
  update((state) => { state.ui.cardMatchId = matchId; state.ui.cardFrom = 'rounds'; state.ui.screen = 'card'; });
}

function pickCourse(sessionId, courseId) {
  update((state) => {
    const session = findSession(sessionId);
    session.courseId = courseId;
    session.teeId = COURSES_BY_ID[courseId].defaultTee;
  });
}

function pickTee(sessionId, teeId) {
  update((state) => {
    const session = findSession(sessionId);
    if (COURSES_BY_ID[session.courseId].tees.some((t) => t.id === teeId)) session.teeId = teeId;
  });
}

function pickShape(sessionId, shape) {
  update((state) => {
    const session = findSession(sessionId);
    session.shape = shape;
    session.format = GAMES.find((g) => g.shape === shape).id;
  });
}

function pickGame(sessionId, gameId) {
  update((state) => { findSession(sessionId).format = gameId; });
}

function toggleCounts(sessionId) {
  update((state) => {
    const session = findSession(sessionId);
    session.counts = !sessionCounts(session);
  });
}

// Put `playerId` in position `slot` for their team; whoever was there swaps
// into the vacated position, so every player stays in exactly one slot.
function setSlot(sessionId, team, slot, playerId) {
  update((state) => {
    const session = findSession(sessionId);
    const key = team === 'L' ? 'teamLOrder' : 'teamTOrder';
    const order = session[key].slice();
    const from = order.indexOf(playerId);
    if (from === -1 || from === slot) return;
    order[from] = order[slot];
    order[slot] = playerId;
    session[key] = order;
  });
}

function lockInSession(sessionId) {
  update((state) => {
    const session = findSession(sessionId);
    const pairings = pairingsFromOrders(session.shape, session.teamLOrder, session.teamTOrder);
    session.matches = pairings.map((p) => makeMatch(p.sideA, p.sideB, null, session.format));
    session.locked = true;
    state.ui.screen = 'rounds';
  });
}

// ---- score entry ----------------------------------------------------------
// The hole being viewed and any unposted strokes are per-device drafts in
// ui.drafts — only "Post hole" writes to the shared match.

function cardView(state, match, course) {
  const d = state.ui.drafts && state.ui.drafts[match.id];
  const results = computeHoleResults(match, course.holes);
  const defaultIdx = Math.min(course.holes.length - 1, results.length);
  const holeIdx = d && d.holeIdx != null ? d.holeIdx : defaultIdx;
  const hole = course.holes[holeIdx];
  let gross = {}, tags = [], hammer = [], who = {};
  if (d && d.holeN === hole.n) {
    gross = d.gross; tags = d.tags; hammer = d.hammer || []; who = d.who || {};
  } else {
    const hw = match.holeWho && match.holeWho[hole.n];
    if (hw) Object.keys(hw).forEach((t) => { who[t] = hw[t].slice(); });
    match.sideA.concat(match.sideB).forEach((id) => {
      gross[id] = (match.grossScores[id] && match.grossScores[id][hole.n]) || hole.par;
    });
    tags = (match.holeTags && match.holeTags[hole.n]) ? match.holeTags[hole.n].slice() : [];
    const hh = match.holeHammer && match.holeHammer[hole.n];
    hammer = hh && hh.events ? hh.events.map((e) => Object.assign({}, e)) : [];
  }
  return { holeIdx, hole, gross, tags, hammer, who, results };
}

function writeDraft(state, match, course, mutate) {
  const v = cardView(state, match, course);
  const d = { holeIdx: v.holeIdx, holeN: v.hole.n, gross: Object.assign({}, v.gross), tags: v.tags.slice(), hammer: v.hammer.map((e) => Object.assign({}, e)), who: {} };
  Object.keys(v.who).forEach((t) => { d.who[t] = v.who[t].slice(); });
  mutate(d);
  state.ui.drafts = state.ui.drafts || {};
  state.ui.drafts[match.id] = d;
}

function stepGross(matchId, playerId, delta) {
  update((state) => {
    const match = matchById(matchId);
    const course = courseFor(sessionForMatch(matchId));
    writeDraft(state, match, course, (d) => {
      d.gross[playerId] = Math.max(1, Math.min(12, d.gross[playerId] + delta));
    });
  });
}

function toggleTag(matchId, tag) {
  update((state) => {
    const match = matchById(matchId);
    const course = courseFor(sessionForMatch(matchId));
    writeDraft(state, match, course, (d) => {
      if (!tagsForHole(course.holes.find((h) => h.n === d.holeN)).includes(tag)) return;
      const i = d.tags.indexOf(tag);
      if (i > -1) { d.tags.splice(i, 1); delete d.who[tag]; } else d.tags.push(tag);
    });
  });
}

// Name the player a Greenie / CTP pays, or the player(s) a penalty tag fines.
function toggleTagWho(matchId, tag, playerId) {
  const rule = TAG_RULES[tag];
  if (!rule) return;
  update((state) => {
    const match = matchById(matchId);
    const course = courseFor(sessionForMatch(matchId));
    writeDraft(state, match, course, (d) => {
      const cur = d.who[tag] || [];
      const has = cur.includes(playerId);
      if (rule.mode === 'pick') d.who[tag] = has ? [] : [playerId];          // one winner
      else d.who[tag] = has ? cur.filter((x) => x !== playerId) : cur.concat(playerId);   // can be several
    });
  });
}

// ---- hammer (Fourball + hammer format) ---------------------------------------
// Throws live in the per-phone draft for the hole and are committed with the
// hole when it is posted, just like the strokes.

function throwHammer(matchId, by) {
  update((state) => {
    const match = matchById(matchId);
    const course = courseFor(sessionForMatch(matchId));
    if (!canThrowHammer(cardView(state, match, course).hammer, by)) return;
    writeDraft(state, match, course, (d) => { d.hammer.push({ by, resp: null }); });
  });
}

function answerHammer(matchId, resp) {
  update((state) => {
    const match = matchById(matchId);
    const course = courseFor(sessionForMatch(matchId));
    if (!hammerOutcome(cardView(state, match, course).hammer).pending) return;
    writeDraft(state, match, course, (d) => { d.hammer[d.hammer.length - 1].resp = resp; });
  });
}

function undoHammer(matchId) {
  update((state) => {
    const match = matchById(matchId);
    const course = courseFor(sessionForMatch(matchId));
    writeDraft(state, match, course, (d) => {
      const last = d.hammer[d.hammer.length - 1];
      if (!last) return;
      if (last.resp != null) last.resp = null; else d.hammer.pop();   // un-answer first, then un-throw
    });
  });
}

function setViewedHole(state, matchId, idx) {
  state.ui.drafts = state.ui.drafts || {};
  state.ui.drafts[matchId] = { holeIdx: idx, holeN: null, gross: {}, tags: [], who: {} };
}

function goToHole(matchId, holeIdx) {
  update((state) => { setViewedHole(state, matchId, holeIdx); });
}

function stepHole(matchId, delta) {
  update((state) => {
    const match = matchById(matchId);
    const course = courseFor(sessionForMatch(matchId));
    const v = cardView(state, match, course);
    setViewedHole(state, matchId, Math.max(0, Math.min(course.holes.length - 1, v.holeIdx + delta)));
  });
}

function postHoleAndAdvance(matchId) {
  update((state) => {
    const match = matchById(matchId);
    const session = sessionForMatch(matchId);
    const course = courseFor(session);
    const v = cardView(state, match, course);
    const hole = v.hole;
    if (hammerOutcome(v.hammer).pending) {
      showNotice('The hammer is still waiting for an answer: take it or fold before posting the hole.');
      return;
    }

    const ids = match.sideA.concat(match.sideB);
    ids.forEach((id) => {
      match.grossScores[id] = match.grossScores[id] || {};
      match.grossScores[id][hole.n] = v.gross[id];
    });
    match.holeTags = match.holeTags || {};
    const allowed = tagsForHole(hole);
    v.tags = v.tags.filter((t) => allowed.includes(t));
    match.holeTags[hole.n] = v.tags.slice();
    match.holeWho = match.holeWho || {};
    const whoNow = {};
    v.tags.forEach((t) => { if (v.who[t] && v.who[t].length) whoNow[t] = v.who[t].slice(); });
    if (Object.keys(whoNow).length) match.holeWho[hole.n] = whoNow; else delete match.holeWho[hole.n];
    match.holeHammer = match.holeHammer || {};
    if (v.hammer.length) match.holeHammer[hole.n] = { events: v.hammer.map((e) => ({ by: e.by, resp: e.resp })) };
    else delete match.holeHammer[hole.n];

    state.sideGameEvents = state.sideGameEvents.filter((e) => !(e.matchId === matchId && e.holeN === hole.n));
    state.ledger = state.ledger.filter((e) => !(e.matchId === matchId && e.holeN === hole.n));
    v.tags.forEach((tag) => {
      const rule = TAG_RULES[tag];
      if (!rule) return;
      const detail = `${tag} ${ordinal(hole.n)}`;
      const ts = Date.now();
      if (rule.mode === 'pick') {
        // rule.amount is what EACH other player in the match pays the winner,
        // so in a 2v2 the winner collects three times it.
        (whoNow[tag] || []).forEach((pid) => {
          const payers = ids.filter((id) => id !== pid);
          const total = rule.amount * payers.length;
          state.sideGameEvents.push({ id: uid('sge'), matchId, sessionId: session.id, holeN: hole.n, type: tag, playerId: pid, amount: total, detail, ts });
          state.ledger.push({ id: uid('ldg'), matchId, holeN: hole.n, playerId: pid, amount: total, detail, ts });
          payers.forEach((id) => {
            state.ledger.push({ id: uid('ldg'), matchId, holeN: hole.n, playerId: id, amount: -rule.amount, detail: `${detail} (${PLAYERS_BY_ID[pid].name} won)`, ts });
          });
        });
      } else {
        (whoNow[tag] || []).forEach((pid) => {
          state.ledger.push({ id: uid('ldg'), kind: 'fine', matchId, holeN: hole.n, playerId: pid, amount: -rule.amount, detail: `${rule.fine} ${ordinal(hole.n)}`, ts });
        });
      }
    });

    const results = computeHoleResults(match, course.holes);
    const nickA = sideShortLabel(state, session, match.sideA), nickB = sideShortLabel(state, session, match.sideB);
    const label = matchStateLabel(results, course.holes.length, nickA, nickB, maxPerHole(match.format));
    const shortA = playerNames(match.sideA), shortB = playerNames(match.sideB);
    const nassau = label.segments.map((s) => `${s.label} ${s.text}`).join(' · ');
    const hh = hammerOutcome(v.hammer);
    const hammerNote = !v.hammer.length ? '' : hh.folded
      ? ` Hammer on ${hole.n}: folded, ${hh.folded === 'A' ? shortA : shortB} take the hole.`
      : hh.mult > 1 ? ` Hammer on ${hole.n}: the hole was worth ×${hh.mult}.` : '';
    let text;
    if (label.done) {
      text = `${shortA} vs ${shortB} is final — ${nassau}.`;
    } else if (label.text === 'All square') {
      text = `${shortA} and ${shortB} are all square through ${results.length}.`;
    } else {
      text = `${shortA} vs ${shortB}, through ${results.length}: ${nassau}.`;
    }
    state.feed.unshift({ id: uid('fd'), author: 'Hawks Cup', isSystem: true, text: text + hammerNote, ts: Date.now() });

    setViewedHole(state, matchId, Math.min(course.holes.length - 1, v.holeIdx + 1));
    requestScrollTop();
  });
}

// ---- money / feed ----------------------------------------------------------


function pickMoneyTab(tab) {
  update((state) => { state.ui.moneyTab = tab; });
}

function sendFeedPost(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return;
  const input = document.getElementById('feed-input');
  if (input) input.value = '';
  update((state) => {
    state.feed.unshift({ id: uid('fd'), author: myName(state), isSystem: false, text: trimmed, ts: Date.now() });
  });
}

function openFines() {
  update((state) => { state.ui.finesOpen = true; });
}
function closeFines() {
  update((state) => { state.ui.finesOpen = false; });
}
function chargeFine(playerId, fineType, amount) {
  update((state) => {
    state.ledger.push({ id: uid('ldg'), kind: 'fine', playerId, amount: -Math.abs(amount), detail: fineType, ts: Date.now() });
    state.ui.finesOpen = false;
  });
}

// ---- manual money -------------------------------------------------------------
// For anything the app doesn't work out itself (Tobacco Road stakes, side
// bets, corrections). Whole dollars only.

function openMoneyModal(kind) {
  update((state) => { state.ui.moneyModal = kind; });
}
function closeMoneyModal() {
  update((state) => { state.ui.moneyModal = null; });
}

function addMoneyEntry(playerId, direction, amount, note) {
  const amt = Math.round(Math.abs(Number(amount)));
  if (!amt) return;
  update((state) => {
    state.ledger.push({
      id: uid('ldg'), kind: 'manual', playerId, amount: direction === 'won' ? amt : -amt,
      detail: (note || '').trim() || (direction === 'won' ? 'Money won' : 'Money owed'), ts: Date.now(),
    });
    state.ui.moneyModal = null;
  });
}

// One tap for a finished 2v2 (or singles) match: every player on the winning
// side collects `perPerson`, every player on the losing side pays it.
function payoutMatch(matchId, winnerSide, perPerson) {
  const amt = Math.round(Math.abs(Number(perPerson)));
  if (!amt) return;
  update((state) => {
    const match = matchById(matchId);
    const course = courseFor(sessionForMatch(matchId));
    const winners = winnerSide === 'A' ? match.sideA : match.sideB;
    const losers = winnerSide === 'A' ? match.sideB : match.sideA;
    const group = uid('grp'), ts = Date.now();
    const detail = `${course.name}: ${playerNames(winners)} beat ${playerNames(losers)}`;
    winners.forEach((id) => state.ledger.push({ id: uid('ldg'), kind: 'manual', group, playerId: id, amount: amt, detail, ts }));
    losers.forEach((id) => state.ledger.push({ id: uid('ldg'), kind: 'manual', group, playerId: id, amount: -amt, detail, ts }));
    state.feed.unshift({ id: uid('fd'), author: 'Hawks Cup', isSystem: true, ts, text: `${detail} — $${amt} a man.` });
    state.ui.moneyModal = null;
  });
}

// Remove a fine / manual entry (or a whole match payout). Greenies and
// closest-to-pin belong to the hole they were tagged on and are undone there.
function removeLedgerEntry(entryId) {
  update((state) => {
    const e = state.ledger.find((x) => x.id === entryId);
    if (!e || e.matchId) return;
    state.ledger = e.group ? state.ledger.filter((x) => x.group !== e.group) : state.ledger.filter((x) => x.id !== entryId);
  });
}

// ---- handicaps ---------------------------------------------------------------

function anyScoresEntered(state) {
  return state.sessions.some((s) => s.matches.some((m) =>
    Object.keys(m.grossScores).some((id) => Object.keys(m.grossScores[id]).length > 0)));
}

function openHcp(playerId) {
  update((state) => { state.ui.hcpEditPlayer = playerId; });
}

function closeHcp() {
  update((state) => { state.ui.hcpEditPlayer = null; });
}

function setHandicap(playerId, value) {
  update((state) => {
    state.ui.hcpEditPlayer = null;
    const old = PLAYERS_BY_ID[playerId].hcp;
    if (value === old) return;
    state.handicaps = Object.assign({}, state.handicaps, { [playerId]: value });
    state.feed.unshift({
      id: uid('fd'), author: 'Hawks Cup', isSystem: true, ts: Date.now(),
      text: `${PLAYERS_BY_ID[playerId].name}'s handicap changed from ${old} to ${value} (by ${myName(state)}).`,
    });
  });
}

// ---- who am I / which trip -------------------------------------------------

function setMe(playerId) {
  update((state) => { state.ui.me = playerId; });
}

function forgetMe() {
  update((state) => { state.ui.me = null; });
}

// Joining a different trip code starts from a blank local slate; the real
// data then arrives from the shared trip.
function applyTripCode(rawCode) {
  const code = normalizeTripCode(rawCode);
  const state = getState();
  if (code === (state.ui.tripCode || '')) return;
  const ui = Object.assign({}, state.ui, { tripCode: code || null, drafts: {}, cardMatchId: null, screen: 'cup' });
  stopSync();
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, freshState(ui));
  persist();
  render();
  startSync();
}

// Leave this trip on this phone only: back to the welcome screen to type a
// code and pick a player. Nothing is changed for anyone else.
function changeTripCode() {
  applyTripCode('');
  update((state) => { state.ui.me = null; });
}

function resetTrip(kind) {
  const oldPhotoIds = getState().photos.map((p) => p.id);
  update((state) => {
    const base = kind === 'sample' ? seedState(state.ui) : freshState(state.ui);
    state.photos = [];
    state.ui.viewPhotoId = null;
    state.sessions = base.sessions;
    state.ledger = base.ledger;
    state.sideGameEvents = base.sideGameEvents;
    state.feed = base.feed;
    state.ui.drafts = {};
    state.ui.cardMatchId = base.ui.cardMatchId;
    state.ui.screen = 'cup';
  });
  oldPhotoIds.forEach(deletePhotoData);
}

function inviteLink() {
  const code = getState().ui.tripCode;
  return location.origin + location.pathname + (code ? '#trip=' + code : '');
}
