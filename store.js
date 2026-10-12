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
    finesOpen: false, drafts: {}, me: null, tripCode: null, hcpEditPlayer: null,
  };
}

// Overlays the trip's edited handicaps onto the player list. Called on every
// state change, so engine code can keep reading PLAYERS_BY_ID[id].hcp.
function applyHandicaps(state) {
  PLAYERS.forEach((p) => {
    const v = state.handicaps && state.handicaps[p.id];
    p.hcp = typeof v === 'number' ? v : BASE_HCP[p.id];
  });
}

function makeMatch(sideA, sideB, id) {
  return { id: id || uid('match'), sideA, sideB, grossScores: {}, scorer: sideA[0], holeTags: {} };
}

// Bakes a fixed sequence of hole results (-1/0/1) into a match's gross
// scores, so computeHoleResults() reproduces exactly that sequence. Used
// only to build the sample trip.
function seedResultsIntoMatch(match, course, results) {
  const ids = match.sideA.concat(match.sideB);
  const strokes = handicapAllocation(ids);
  match.grossScores = {};
  ids.forEach((id) => { match.grossScores[id] = {}; });
  results.forEach((r, i) => {
    const hole = course.holes[i];
    const netA = r === 1 ? hole.par - 1 : hole.par;
    const netB = r === -1 ? hole.par - 1 : hole.par;
    match.sideA.forEach((id) => { match.grossScores[id][hole.n] = netA + shotsOnHole(strokes[id], hole.si); });
    match.sideB.forEach((id) => { match.grossScores[id][hole.n] = netB + shotsOnHole(strokes[id], hole.si); });
  });
}

// Fixed ids on purpose: two phones initialising the same empty trip at the
// same moment write the same documents instead of creating duplicates.
function buildSessions() {
  const teamL = PLAYERS.filter((p) => p.team === 'L').map((p) => p.id);
  const teamT = PLAYERS.filter((p) => p.team === 'T').map((p) => p.id);
  // The 2026 trip, in playing order: the Matchbox warm-up (no cup points) on
  // Thursday, then four sessions worth 12 points (2 + 2 + 4 + 4).
  const cfg = [
    { id: 'sx', n: '+', day: 'Thu 11/5', courseId: 'the-matchbox', format: 'scramble', shape: 'team', points: 0, tee: 'Tee time TBD' },
    { id: 's1', n: 1, day: 'Fri 11/6 AM', courseId: 'southern-pines', format: 'fourball', shape: 'team', points: 2, tee: 'Tee time TBD' },
    { id: 's2', n: 2, day: 'Fri 11/6 PM', courseId: 'mid-pines', format: 'fourball', shape: 'team', points: 2, tee: 'Tee time TBD' },
    { id: 's3', n: 3, day: 'Sat 11/7', courseId: 'pine-needles', format: 'netsingles', shape: 'singles', points: 4, tee: 'Tee time TBD' },
    { id: 's4', n: 4, day: 'Sun 11/8', courseId: 'tobacco-road', format: 'singles', shape: 'singles', points: 4, tee: 'Tee time TBD' },
  ];
  return cfg.map((c) => Object.assign({}, c, {
    locked: false, matches: [], teamLOrder: teamL.slice(), teamTOrder: teamT.slice(),
  }));
}

// A clean trip: schedule configured, nothing played, no money, empty feed.
function freshState(ui) {
  return {
    teamOneName: TEAM_ONE_NAME, teamTwoName: TEAM_TWO_NAME,
    sessions: buildSessions(), ledger: [], sideGameEvents: [], feed: [], handicaps: {},
    ui: ui || defaultUi(),
  };
}

// The demo trip from the design handoff: two sessions of history, live
// matches, a populated ledger and feed.
function seedState(ui) {
  const state = freshState(ui);
  const s1 = state.sessions.find((s) => s.id === 's1');
  const s2 = state.sessions.find((s) => s.id === 's2');

  s1.locked = true;
  s1.matches = [
    makeMatch(['david', 'lenny'], ['tom', 'ben'], 'm1a'),
    makeMatch(['alex', 'dan'], ['ryan', 'jamey'], 'm1b'),
  ];
  seedResultsIntoMatch(s1.matches[0], COURSES_BY_ID[s1.courseId],
    [1, 0, 1, 0, 1, 0, -1, 0, 1, 0, 0, -1, 0, 1, 0, 0]); // decided 3&2
  seedResultsIntoMatch(s1.matches[1], COURSES_BY_ID[s1.courseId],
    [1, -1, 0, 1, -1, 0, 0, 1, -1, 0, 0, 1, -1, 0, 0, 1, -1, 0]); // halved thru 18

  s2.locked = true;
  s2.matches = [
    makeMatch(['david', 'dan'], ['tom', 'jamey'], 'm2a'),
    makeMatch(['lenny', 'alex'], ['ben', 'ryan'], 'm2b'),
  ];
  seedResultsIntoMatch(s2.matches[0], COURSES_BY_ID[s2.courseId],
    [0, 1, 0, -1, 1, 0, 0, 1, 0, 0, 0, 0]); // thru 12, 2 up
  seedResultsIntoMatch(s2.matches[1], COURSES_BY_ID[s2.courseId],
    [-1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 1, 0]); // thru 12, 1 down

  const now = Date.now();
  const ledgerRows = [
    ['david', 40, 'Skin 6th', 3600e3], ['david', 20, 'CTP miss carry', 3500e3],
    ['lenny', 10, 'Greenie 12th', 3000e3], ['lenny', -30, 'Two fines', 2900e3],
    ['alex', 40, 'CTP 3rd', 2000e3], ['dan', 20, 'Skin 4th', 1900e3], ['dan', -10, '3-putt fine', 1800e3],
    ['tom', 40, 'CTP 12th', 1500e3], ['ben', 10, 'Greenie 7th', 1200e3], ['ben', -40, 'Lost ball x2 fine', 1100e3],
    ['ryan', 20, 'Skin 1st', 900e3], ['jamey', -70, 'Four fines', 600e3], ['jamey', -40, 'Pot contribution', 500e3],
  ];
  state.ledger = ledgerRows.map((r, i) => ({ id: 'seed' + i, playerId: r[0], amount: r[1], detail: r[2], ts: now - r[3] }));

  const feedRows = [
    ['Hawks Cup', true, 'David & Dan go 2 UP — Dan nets a 4 on the 8th with a shot.', 60e3],
    ['Tom', false, 'Three skins riding on 13. Somebody hole something.', 240e3],
    ['Lenny', false, 'Greenie on 12 and a two-putt. Paid for lunch.', 660e3],
    ['Hawks Cup', true, 'Turkeys take the 10th — match 2 back to 1 UP.', 1560e3],
    ['Jamey', false, 'Fined again for the lip-out sulk. Ledger is a crime scene.', 2880e3],
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
  out.meta = { teamOneName: state.teamOneName, teamTwoName: state.teamTwoName };
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
  return JSON.parse(JSON.stringify(out));
}

function assembleState(docs, ui) {
  const meta = docs.meta || {};
  const sessions = [];
  const matchesBySession = {};
  const ledger = [], feed = [], sideGameEvents = [], handicaps = {};
  Object.keys(docs).forEach((key) => {
    const d = docs[key];
    if (key.indexOf('hcp_') === 0) handicaps[d.id] = d.hcp;
    else if (key.indexOf('session_') === 0) sessions.push(d);
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
  });
  ledger.sort((a, b) => a.ts - b.ts);
  sideGameEvents.sort((a, b) => a.ts - b.ts);
  feed.sort((a, b) => b.ts - a.ts);
  return {
    teamOneName: meta.teamOneName || TEAM_ONE_NAME,
    teamTwoName: meta.teamTwoName || TEAM_TWO_NAME,
    sessions, ledger, sideGameEvents, feed, handicaps, ui,
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
    parsed.handicaps = parsed.handicaps || {};
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
