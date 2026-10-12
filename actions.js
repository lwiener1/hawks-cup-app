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
    state.ui.screen = (s === 'card' || s === 'setup') ? 'rounds' : 'cup';
  });
}

function openSetup(sessionId) {
  update((state) => { state.ui.setupSessionId = sessionId; state.ui.screen = 'setup'; });
}

function openCard(matchId) {
  update((state) => { state.ui.cardMatchId = matchId; state.ui.screen = 'card'; });
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
  let gross = {}, tags = [];
  if (d && d.holeN === hole.n) {
    gross = d.gross; tags = d.tags;
  } else {
    match.sideA.concat(match.sideB).forEach((id) => {
      gross[id] = (match.grossScores[id] && match.grossScores[id][hole.n]) || hole.par;
    });
    tags = (match.holeTags && match.holeTags[hole.n]) ? match.holeTags[hole.n].slice() : [];
  }
  return { holeIdx, hole, gross, tags, results };
}

function writeDraft(state, match, course, mutate) {
  const v = cardView(state, match, course);
  const d = { holeIdx: v.holeIdx, holeN: v.hole.n, gross: Object.assign({}, v.gross), tags: v.tags.slice() };
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
      const i = d.tags.indexOf(tag);
      if (i > -1) d.tags.splice(i, 1); else d.tags.push(tag);
    });
  });
}

function setViewedHole(state, matchId, idx) {
  state.ui.drafts = state.ui.drafts || {};
  state.ui.drafts[matchId] = { holeIdx: idx, holeN: null, gross: {}, tags: [] };
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

const TAG_AMOUNTS = { Skin: 20, Greenie: 10, CTP: 40 };

function postHoleAndAdvance(matchId) {
  update((state) => {
    const match = matchById(matchId);
    const session = sessionForMatch(matchId);
    const course = courseFor(session);
    const v = cardView(state, match, course);
    const hole = v.hole;

    const ids = match.sideA.concat(match.sideB);
    const strokes = handicapAllocation(ids, session);
    ids.forEach((id) => {
      match.grossScores[id] = match.grossScores[id] || {};
      match.grossScores[id][hole.n] = v.gross[id];
    });
    match.holeTags = match.holeTags || {};
    match.holeTags[hole.n] = v.tags.slice();

    state.sideGameEvents = state.sideGameEvents.filter((e) => !(e.matchId === matchId && e.holeN === hole.n));
    state.ledger = state.ledger.filter((e) => !(e.matchId === matchId && e.holeN === hole.n));
    let bestId = ids[0], bestNet = Infinity, tie = false;
    ids.forEach((id) => {
      const net = netScore(v.gross[id], strokes[id], hole.si);
      if (net < bestNet) { bestNet = net; bestId = id; tie = false; }
      else if (net === bestNet) tie = true;
    });
    v.tags.forEach((tag) => {
      if (TAG_AMOUNTS[tag] && !tie) {
        const detail = `${tag} ${ordinal(hole.n)}`;
        const ts = Date.now();
        state.sideGameEvents.push({ id: uid('sge'), matchId, sessionId: session.id, holeN: hole.n, type: tag, playerId: bestId, amount: TAG_AMOUNTS[tag], detail, ts });
        state.ledger.push({ id: uid('ldg'), matchId, holeN: hole.n, playerId: bestId, amount: TAG_AMOUNTS[tag], detail, ts });
      }
    });

    const results = computeHoleResults(match, course.holes);
    const nickA = sideShortLabel(state, session, match.sideA), nickB = sideShortLabel(state, session, match.sideB);
    const label = matchStateLabel(results, course.holes.length, nickA, nickB, maxPerHole(match.format));
    const shortA = playerNames(match.sideA), shortB = playerNames(match.sideB);
    const nassau = label.segments.map((s) => `${s.label} ${s.text}`).join(' · ');
    let text;
    if (label.done) {
      text = `${shortA} vs ${shortB} is final — ${nassau}.`;
    } else if (label.text === 'All square') {
      text = `${shortA} and ${shortB} are all square through ${results.length}.`;
    } else {
      text = `${shortA} vs ${shortB}, through ${results.length}: ${nassau}.`;
    }
    state.feed.unshift({ id: uid('fd'), author: 'Hawks Cup', isSystem: true, text, ts: Date.now() });

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
    state.ledger.push({ id: uid('ldg'), playerId, amount: -Math.abs(amount), detail: fineType, ts: Date.now() });
    state.ui.finesOpen = false;
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

function resetTrip(kind) {
  update((state) => {
    const base = kind === 'sample' ? seedState(state.ui) : freshState(state.ui);
    state.sessions = base.sessions;
    state.ledger = base.ledger;
    state.sideGameEvents = base.sideGameEvents;
    state.feed = base.feed;
    state.ui.drafts = {};
    state.ui.cardMatchId = base.ui.cardMatchId;
    state.ui.screen = 'cup';
  });
}

function inviteLink() {
  const code = getState().ui.tripCode;
  return location.origin + location.pathname + (code ? '#trip=' + code : '');
}
