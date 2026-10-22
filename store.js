// State: load/seed/persist. A single global STATE object, mutated only
// through update(), which persists locally, pushes changes to the shared
// trip (if sync is on), and re-renders.
//
// STATE.ui is per-device (who I am, which screen, score-entry drafts) and is
// never synced. Everything else is shared trip data.

const STORAGE_KEY = 'hawks-cup-state-v2';

function uid(prefix) { return prefix + '_' + Math.random().toString(36).slice(2, 9); }

function defaultUi() {
  return {
    screen: 'cup', moneyTab: 'games', setupSessionId: 's3', cardMatchId: null,
    joinMode: 'live', moneyModal: null, sideId: null, sideDraft: null, scoreConflict: null, drafts: {}, me: null, tripCode: null, hcpEditPlayer: null,
    verifySessionId: null, viewPhotoId: null, photoZoom: 1, cardFrom: 'rounds',
  };
}

// Overlays the trip's edited handicaps onto the player list. Called on every
// state change, so engine code can keep reading PLAYERS_BY_ID[id].hcp.
function applyHandicaps(state) {
  // Team names live in data.js, so renaming a team there reaches trips that
  // were already saved or synced under the old name.
  state.teamOneName = TEAM_ONE_NAME;
  state.teamTwoName = TEAM_TWO_NAME;
  PLAYERS.forEach((p) => {
    const v = state.handicaps && state.handicaps[p.id];
    p.hcp = typeof v === 'number' ? v : BASE_HCP[p.id];
  });
  state.sessions.forEach(linkSession);
}

// A match needs to know its session (course + tee) to work out handicap
// strokes. The link is non-enumerable so it never gets saved or synced.
function linkSession(session) {
  session.matches.forEach((m) => {
    Object.defineProperty(m, '_session', { value: session, enumerable: false, configurable: true, writable: true });
  });
}

function makeMatch(sideA, sideB, id, format) {
  return { id: id || uid('match'), sideA, sideB, format: format || 'fourball', grossScores: {}, scorer: sideA[0], holeTags: {}, holeHammer: {} };
}

// Bakes a fixed sequence of hole results (-1/0/1) into a match's gross
// scores, so computeHoleResults() reproduces exactly that sequence. Used
// only to build the sample trip.
function seedResultsIntoMatch(match, session, results) {
  const course = COURSES_BY_ID[session.courseId];
  const ids = match.sideA.concat(match.sideB);
  const strokes = handicapAllocation(ids, session);
  match.grossScores = {};
  ids.forEach((id) => { match.grossScores[id] = {}; });
  // How many of a side's players beat par net on this hole to produce a
  // result of |r|: fourball/singles only ever need the first player; in low
  // ball / high ball a result of 2 needs both (low and high ball both won)
  // and 1 needs just the better ball.
  const betterCount = (r) => (match.format === 'lowhigh' ? Math.abs(r) : Math.sign(Math.abs(r)));
  results.forEach((r, i) => {
    const hole = course.holes[i];
    const n = betterCount(r);
    const netFor = (side, wins) => (id) => (wins && side.indexOf(id) < n ? hole.par - 1 : hole.par);
    const aNet = netFor(match.sideA, r > 0), bNet = netFor(match.sideB, r < 0);
    match.sideA.forEach((id) => { match.grossScores[id][hole.n] = aNet(id) + shotsOnHole(strokes[id], hole.si); });
    match.sideB.forEach((id) => { match.grossScores[id][hole.n] = bNet(id) + shotsOnHole(strokes[id], hole.si); });
  });
}

// Fixed ids on purpose: two phones initialising the same empty trip at the
// same moment write the same documents instead of creating duplicates.
function buildSessions() {
  const teamL = PLAYERS.filter((p) => p.team === 'L').map((p) => p.id);
  const teamT = PLAYERS.filter((p) => p.team === 'T').map((p) => p.id);
  // The 2026 trip, in playing order. Every match is a Nassau (3 points).
  // Team event = Southern Pines low/high ball (2 matches) + Mid Pines
  // fourball (2) + Pine Needles singles (4) = 8 matches x 3 = 24 points, 12.5
  // wins. Tobacco Road is played but doesn't count.
  const cfg = [
    { id: 's1', n: 1, day: 'Fri 11/6 AM', courseId: 'southern-pines', format: 'lowhigh', shape: 'team', counts: true, tee: 'Tee time TBD' },
    { id: 's2', n: 2, day: 'Fri 11/6 PM', courseId: 'mid-pines', format: 'fourball', shape: 'team', counts: true, tee: 'Tee time TBD' },
    { id: 's3', n: 3, day: 'Sat 11/7', courseId: 'pine-needles', format: 'singles', shape: 'singles', counts: true, tee: 'Tee time TBD' },
    { id: 's4', n: 4, day: 'Sun 11/8', courseId: 'tobacco-road', format: 'fourball', shape: 'team', counts: false, tee: 'Tee time TBD' },
  ];
  return cfg.map((c) => Object.assign({}, c, {
    teeId: COURSES_BY_ID[c.courseId].defaultTee,
    locked: false, matches: [], teamLOrder: teamL.slice(), teamTOrder: teamT.slice(),
  }));
}

// A clean trip: schedule configured, nothing played, no money, empty feed.
function freshState(ui) {
  return {
    teamOneName: TEAM_ONE_NAME, teamTwoName: TEAM_TWO_NAME,
    sessions: buildSessions(), ledger: [], sideGameEvents: [], feed: [], handicaps: {}, photos: [],
    sideMatches: [], playoffWinner: null,
    ui: ui || defaultUi(),
  };
}

// The demo trip from the design handoff: two sessions of history, live
// matches, a populated ledger and feed.
function seedState(ui) {
  const state = freshState(ui);
  const s1 = state.sessions.find((s) => s.id === 's1');
  const s2 = state.sessions.find((s) => s.id === 's2');

  // Session 1 (Southern Pines, low ball / high ball): finished.
  s1.locked = true;
  s1.matches = [
    makeMatch(['david', 'lenny'], ['tom', 'ben'], 'm1a', 'lowhigh'),
    makeMatch(['alex', 'dan'], ['ryan', 'jamey'], 'm1b', 'lowhigh'),
  ];
  seedResultsIntoMatch(s1.matches[0], s1, [1, 0, 1, 0, 1, 0, -1, 0, 1, 0, 0, -1, 0, 1, 0, 0, 1, 0]); // LAWD sweep all 3 bets
  seedResultsIntoMatch(s1.matches[1], s1, [-1, 0, 0, 1, 0, 0, -1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0]); // Princes take front + total, back halved

  // Session 2 (Mid Pines, fourball): live, 12 holes in.
  s2.locked = true;
  s2.teamLOrder = ['david', 'dan', 'lenny', 'alex'];
  s2.teamTOrder = ['tom', 'jamey', 'ben', 'ryan'];
  s2.matches = [
    makeMatch(['david', 'dan'], ['tom', 'jamey'], 'm2a', 'fourball'),
    makeMatch(['lenny', 'alex'], ['ben', 'ryan'], 'm2b', 'fourball'),
  ];
  seedResultsIntoMatch(s2.matches[0], s2, [0, 1, 1, -1, 1, 0, 0, 1, 0, 0, 0, 0]); // thru 12, front won 3 up
  seedResultsIntoMatch(s2.matches[1], s2, [-1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 1, 0]); // thru 12, 1 down
  linkSession(s1); linkSession(s2);

  const now = Date.now();
  const ledgerRows = [
    ['david', 20, 'CTP 6th', 3500e3],
    ['lenny', 10, 'Greenie 12th', 3000e3], ['lenny', -30, 'Two fines', 2900e3],
    ['alex', 40, 'CTP 3rd', 2000e3], ['dan', -10, 'Whiff 4th', 1800e3],
    ['tom', 40, 'CTP 12th', 1500e3], ['ben', 10, 'Greenie 7th', 1200e3], ['ben', -40, 'Gallery rule x2', 1100e3],
    ['jamey', -70, 'Four fines', 600e3], ['jamey', -40, 'Pot contribution', 500e3],
  ];
  state.ledger = ledgerRows.map((r, i) => ({ id: 'seed' + i, playerId: r[0], amount: r[1], detail: r[2], ts: now - r[3] }));

  const feedRows = [
    ['Hawks Cup', true, 'David & Dan go 2 UP — Dan nets a 4 on the 8th with a shot.', 60e3],
    ['Tom', false, 'Closest to the pin on 13 is $15. Somebody hit it.', 240e3],
    ['Lenny', false, 'Greenie on 12 and a two-putt. Paid for lunch.', 660e3],
    ['Hawks Cup', true, 'Princes take the 10th — match 2 back to 1 UP.', 1560e3],
    ['Jamey', false, 'Fined again for the gallery rule. Ledger is a crime scene.', 2880e3],
    ['David', false, 'Tobacco Road order of play at dinner. Bring your own excuses.', 3600e3],
  ];
  state.feed = feedRows.map((r, i) => ({ id: 'seedfeed' + i, author: r[0], isSystem: r[1], text: r[2], ts: now - r[3] }));

  state.ui.cardMatchId = 'm2a';
  return state;
}

// ---- shared-trip document mapping ----------------------------------------
// One document per session / match / ledger entry / feed post / side-game
// event. Fine-grained documents mean two scorers on different matches never
// overwrite each other, and queued offline writes merge cleanly.

function stableStringify(v) {
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
  }
  return JSON.stringify(v === undefined ? null : v);
}

function flattenState(state) {
  const out = {};
  out.meta = { teamOneName: state.teamOneName, teamTwoName: state.teamTwoName, clearedOn: state.clearedOn || null, playoffWinner: state.playoffWinner || null };
  (state.sideMatches || []).forEach((sm) => { out['sm_' + sm.id] = sm; });
  state.sessions.forEach((s, si) => {
    const doc = Object.assign({}, s, { order: si });
    delete doc.matches;
    out['session_' + s.id] = doc;
    s.matches.forEach((m, mi) => {
      out['match_' + m.id] = Object.assign({}, m, { sessionId: s.id, order: mi });
    });
  });
  state.ledger.forEach((e) => { out['ledger_' + e.id] = e; });
  state.feed.forEach((e) => { out['feed_' + e.id] = e; });
  state.sideGameEvents.forEach((e) => { out['sge_' + e.id] = e; });
  Object.keys(state.handicaps || {}).forEach((id) => { out['hcp_' + id] = { id, hcp: state.handicaps[id] }; });
  (state.photos || []).forEach((p) => { out['photo_' + p.id] = p; });
  return JSON.parse(JSON.stringify(out));
}

function assembleState(docs, ui) {
  const meta = docs.meta || {};
  const sessions = [];
  const matchesBySession = {};
  const ledger = [], feed = [], sideGameEvents = [], handicaps = {}, photos = [], sideMatches = [];
  Object.keys(docs).forEach((key) => {
    const d = docs[key];
    if (key.indexOf('sm_') === 0) sideMatches.push(d);
    else if (key.indexOf('photo_') === 0) photos.push(d);
    else if (key.indexOf('hcp_') === 0) handicaps[d.id] = d.hcp;
    // A round at a course the app no longer has (e.g. the removed Matchbox)
    // is dropped; the next sync then deletes it from the shared trip too.
    else if (key.indexOf('session_') === 0) { if (COURSES_BY_ID[d.courseId]) sessions.push(d); }
    else if (key.indexOf('match_') === 0) (matchesBySession[d.sessionId] = matchesBySession[d.sessionId] || []).push(d);
    else if (key.indexOf('ledger_') === 0) ledger.push(d);
    else if (key.indexOf('feed_') === 0) feed.push(d);
    else if (key.indexOf('sge_') === 0) sideGameEvents.push(d);
  });
  sessions.sort((a, b) => a.order - b.order);
  sessions.forEach((s) => {
    const ms = (matchesBySession[s.id] || []).sort((a, b) => a.order - b.order);
    ms.forEach((m) => { delete m.order; delete m.sessionId; });
    s.matches = ms;
    delete s.order;
    linkSession(s);
  });
  ledger.sort((a, b) => a.ts - b.ts);
  sideGameEvents.sort((a, b) => a.ts - b.ts);
  feed.sort((a, b) => b.ts - a.ts);
  return {
    teamOneName: TEAM_ONE_NAME,
    teamTwoName: TEAM_TWO_NAME, clearedOn: meta.clearedOn || null, playoffWinner: meta.playoffWinner || null,
    sideMatches: sideMatches.sort((a, b) => (a.ts || 0) - (b.ts || 0)),
    sessions, ledger, sideGameEvents, feed, handicaps, photos: photos.sort((a, b) => a.ts - b.ts), ui,
  };
}

// ---- store ---------------------------------------------------------------

let STATE = null;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.sessions)) return null;
    parsed.ui = Object.assign(defaultUi(), parsed.ui);
    parsed.sessions = parsed.sessions.filter((s) => COURSES_BY_ID[s.courseId]);
    parsed.handicaps = parsed.handicaps || {};
    parsed.photos = parsed.photos || [];
    parsed.sideMatches = parsed.sideMatches || [];
    parsed.playoffWinner = parsed.playoffWinner || null;
    return parsed;
  } catch (e) {
    console.warn('Could not read saved state, starting fresh.', e);
    return null;
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(STATE));
  } catch (e) {
    console.warn('Could not save state.', e);
  }
}

function getState() { return STATE; }

function initStore() {
  STATE = loadState() || seedState();
  applyHandicaps(STATE);
}

// Mutates STATE via `fn`, saves locally, pushes the diff to the shared trip,
// then re-renders. Every write to the app goes through here.
function update(fn) {
  fn(STATE);
  applyHandicaps(STATE);
  persist();
  if (typeof syncPush === 'function') syncPush();
  render();
}

function findSession(id) { return STATE.sessions.find((s) => s.id === id); }
function sessionForMatch(matchId) {
  return STATE.sessions.find((s) => s.matches.some((m) => m.id === matchId));
}
function matchById(matchId) {
  for (const s of STATE.sessions) {
    const m = s.matches.find((mm) => mm.id === matchId);
    if (m) return m;
  }
  return null;
}
