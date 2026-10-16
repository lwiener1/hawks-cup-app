// State-aware derived views: ledger totals, records, awards. Pure functions
// of `state` — call again after every update() rather than caching.

// Short label for a side's match-state text: the team's nickname for a
// team-shape session (e.g. "LAWDs 2 UP"), or the player's own name for a
// singles-shape session (e.g. "Ryan 2 UP").
function teamNickname(fullName) {
  const stripped = fullName.replace(/^The\s+/i, '').trim();
  const words = stripped.split(/\s+/);
  return words[words.length - 1];
}

function sideShortLabel(state, session, side) {
  if (session.shape === 'singles') return PLAYERS_BY_ID[side[0]].name;
  const team = PLAYERS_BY_ID[side[0]].team;
  return teamNickname(team === 'L' ? state.teamOneName : state.teamTwoName);
}

// Where the team event stands in money terms. It only settles once the result
// can no longer change: a team has banked enough points to win (counting
// finished bets only), or every point is in and it's level (a push).
function teamEventStatus(state) {
  const t = cupTotals(state.sessions);
  const base = { stake: TEAM_EVENT_STAKE, team1: t.team1, team2: t.team2, settled1: t.settled1, settled2: t.settled2, toWin: t.toWin, available: t.available };
  if (t.settled1 >= t.toWin) return Object.assign(base, { state: 'won', winner: 'L' });
  if (t.settled2 >= t.toWin) return Object.assign(base, { state: 'won', winner: 'T' });
  if (t.available > 0 && t.settled >= t.available) return Object.assign(base, { state: 'push', winner: null });
  return Object.assign(base, { state: 'open', winner: null });
}

// Money entries that are worked out from the scores rather than stored: once
// the team event is decided, each loser pays and each winner receives the stake.
function teamEventEntries(state) {
  const s = teamEventStatus(state);
  if (s.state !== 'won') return [];
  return PLAYERS.map((p) => ({
    id: 'teamevent_' + p.id, playerId: p.id, derived: true, ts: 0,
    amount: p.team === s.winner ? TEAM_EVENT_STAKE : -TEAM_EVENT_STAKE,
    detail: p.team === s.winner ? 'Team event win' : 'Team event loss',
  }));
}

function allLedger(state) { return state.ledger.concat(teamEventEntries(state)); }

function ledgerTotals(state) {
  const totals = {};
  PLAYERS.forEach((p) => { totals[p.id] = 0; });
  allLedger(state).forEach((e) => { totals[e.playerId] = (totals[e.playerId] || 0) + e.amount; });
  return totals;
}

function ledgerDetail(state, playerId) {
  const entries = allLedger(state).filter((e) => e.playerId === playerId).sort((a, b) => (b.ts || Infinity) - (a.ts || Infinity));
  if (entries.length === 0) return 'No games yet';
  return entries.slice(0, 2).map((e) => e.detail).join(' · ');
}

function allMatches(state) {
  const out = [];
  state.sessions.forEach((session) => {
    const course = courseFor(session);
    session.matches.forEach((match) => {
      const results = computeHoleResults(match, course.holes);
      const label = matchStateLabel(results, course.holes.length, 'A', 'B', maxPerHole(match.format));
      out.push({ session, course, match, results, label });
    });
  });
  return out;
}

function playerRecord(state, playerId) {
  let w = 0, l = 0, h = 0;
  allMatches(state).forEach(({ match, results, course, label }) => {
    if (!label.done) return;
    const inA = match.sideA.includes(playerId);
    const inB = match.sideB.includes(playerId);
    if (!inA && !inB) return;
    const diff = matchDiff(results);
    if (diff === 0) { h++; return; }
    const aWon = diff > 0;
    if ((inA && aWon) || (inB && !aWon)) w++; else l++;
  });
  return { w, l, h, text: `${w}–${l}–${h}` };
}

function computeAwards(state) {
  const totals = ledgerTotals(state);

  // Player of the trip: most Nassau points won for the team (settled bets
  // only, team-event rounds only; each bet is 1 point, halves 0.5)
  const points = {};
  PLAYERS.forEach((p) => { points[p.id] = 0; });
  allMatches(state).forEach(({ session, course, match, results }) => {
    if (!sessionCounts(session)) return;
    const sh = matchPointShares(results, course.holes.length, maxPerHole(match.format));
    match.sideA.forEach((id) => { points[id] += sh.settledA; });
    match.sideB.forEach((id) => { points[id] += sh.settledB; });
  });
  const potPlayer = PLAYERS.slice().sort((a, b) => points[b.id] - points[a.id])[0];

  // The Shank: worst single gross score recorded, anywhere
  let shank = null;
  allMatches(state).forEach(({ match, course }) => {
    match.sideA.concat(match.sideB).forEach((id) => {
      const scores = match.grossScores[id] || {};
      Object.keys(scores).forEach((holeN) => {
        const g = scores[holeN];
        if (!shank || g > shank.gross) shank = { playerId: id, gross: g, hole: holeN };
      });
    });
  });

  // Deepest pockets: ledger low man
  const moneyLow = PLAYERS.slice().sort((a, b) => totals[a.id] - totals[b.id])[0];

  // Sandbagger: best net-to-par average across holes played (plays better than handicap implies)
  const netToPar = {}; const holesCounted = {};
  PLAYERS.forEach((p) => { netToPar[p.id] = 0; holesCounted[p.id] = 0; });
  state.sessions.forEach((session) => {
    const course = courseFor(session);
    session.matches.forEach((match) => {
      const ids = match.sideA.concat(match.sideB);
      const strokes = handicapAllocation(ids, session);
      ids.forEach((id) => {
        const scores = match.grossScores[id] || {};
        Object.keys(scores).forEach((holeN) => {
          const hole = course.holes.find((h) => String(h.n) === String(holeN));
          if (!hole) return;
          const net = netScore(scores[holeN], strokes[id], hole.si);
          netToPar[id] += (net - hole.par);
          holesCounted[id] += 1;
        });
      });
    });
  });
  const eligible = PLAYERS.filter((p) => holesCounted[p.id] >= 6);
  const sandbagger = (eligible.length ? eligible : PLAYERS).slice().sort(
    (a, b) => (netToPar[a.id] / (holesCounted[a.id] || 1)) - (netToPar[b.id] / (holesCounted[b.id] || 1))
  )[0];

  // Most fines: only real fines (entries made with "Charge a fine"; sample
  // data from before that had no kind, so a plain negative counts there).
  const fineCounts = {};
  PLAYERS.forEach((p) => { fineCounts[p.id] = 0; });
  state.ledger.forEach((e) => {
    const isFine = e.kind === 'fine' || (e.kind == null && e.amount < 0 && !e.matchId);
    if (isFine) fineCounts[e.playerId] = (fineCounts[e.playerId] || 0) + 1;
  });
  const mostFined = PLAYERS.slice().sort((a, b) => fineCounts[b.id] - fineCounts[a.id])[0];

  return [
    { title: 'Player of the trip', detail: 'Points won, matches played', who: `${potPlayer.name} · ${fmtPoints(points[potPlayer.id])} pts` },
    { title: 'The Shank', detail: 'Worst single hole of the week', who: shank ? `${PLAYERS_BY_ID[shank.playerId].name} · ${shank.gross} on ${shank.hole}` : 'Nobody yet' },
    { title: 'Deepest pockets', detail: 'Ledger low man', who: `${moneyLow.name} · ${fmtMoney(totals[moneyLow.id])}` },
    { title: 'Sandbagger of the year', detail: 'Net scoring vs handicap', who: sandbagger.name },
    { title: 'Most fines', detail: 'Shame board total', who: `${mostFined.name} · ${fineCounts[mostFined.id]}` },
  ];
}

function trophyProjection(state) {
  const totals = cupTotals(state.sessions);
  const cupSessions = state.sessions.filter((s) => sessionCounts(s));
  const liveSession = cupSessions.find((s) => sessionStatus(s) === 'in-play');
  const notSet = cupSessions.filter((s) => sessionStatus(s) === 'not-set');
  const remainingPts = totals.available - totals.settled;
  let note;
  if (remainingPts <= 0) {
    note = `All ${fmtPoints(totals.available)} points are on the board.`;
  } else if (liveSession) {
    note = `Based on current match states. ${courseFor(liveSession).name} still has points live — ${fmtPoints(totals.toWin)} wins the cup.`;
  } else if (notSet.length) {
    const names = notSet.map((s) => courseFor(s).name).join(' and ');
    note = `${names} ${notSet.length > 1 ? 'are' : 'is'} still to be played — ${fmtPoints(remainingPts)} of ${fmtPoints(totals.available)} points on the table, ${fmtPoints(totals.toWin)} wins the cup.`;
  } else {
    note = `${fmtPoints(remainingPts)} points still to be decided.`;
  }
  return { totals, note };
}
