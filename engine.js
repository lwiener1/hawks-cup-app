// Pure derived-state math. Nothing here touches the store or the DOM —
// gross scores + handicaps + hole results are the source of truth
// everywhere else; this module turns them into net scores, match state,
// and cup totals on every read.

// Difference-only handicap allocation: the low handicap in this set of
// players plays off scratch; everyone else gets the gap to the low man.
function handicapAllocation(playerIds) {
  const hcps = playerIds.map((id) => PLAYERS_BY_ID[id].hcp);
  const low = Math.min.apply(null, hcps);
  const out = {};
  playerIds.forEach((id) => { out[id] = PLAYERS_BY_ID[id].hcp - low; });
  return out;
}

// Strokes received on a given hole: one shot once strokes >= that hole's
// stroke index, a second shot once strokes >= si + 18.
function shotsOnHole(strokesReceived, si) {
  let shots = 0;
  if (strokesReceived >= si) shots = 1;
  if (strokesReceived >= si + 18) shots = 2;
  return shots;
}

function netScore(gross, strokesReceived, si) {
  return gross - shotsOnHole(strokesReceived, si);
}

// Best net score for a side on one hole (a side of one is just that score —
// this is what makes the same function work for singles and team matches).
function sideNetOnHole(match, side, hole, grossByPlayer) {
  const ids = side === 'A' ? match.sideA : match.sideB;
  const strokes = handicapAllocation(match.sideA.concat(match.sideB));
  return Math.min.apply(null, ids.map((id) => {
    const g = (grossByPlayer[id] && grossByPlayer[id][hole.n]) || hole.par;
    return netScore(g, strokes[id], hole.si);
  }));
}

// Recomputes the -1/0/1 result for every hole already played (grossScores
// has an entry for that hole), from raw gross scores. This is what lets us
// treat gross + handicaps as the only source of truth.
function computeHoleResults(match, holes) {
  const results = [];
  for (const hole of holes) {
    const allEntered = match.sideA.concat(match.sideB).every(
      (id) => match.grossScores[id] && match.grossScores[id][hole.n] != null
    );
    if (!allEntered) break;
    const netA = sideNetOnHole(match, 'A', hole, match.grossScores);
    const netB = sideNetOnHole(match, 'B', hole, match.grossScores);
    results.push(netA < netB ? 1 : netA > netB ? -1 : 0);
  }
  return results;
}

function matchDiff(holeResults) {
  return holeResults.reduce((a, b) => a + b, 0);
}

// Live/final state label + color for a match, given its hole results so far.
function matchStateLabel(holeResults, totalHoles, sideAShort, sideBShort) {
  const thru = holeResults.length;
  const diff = matchDiff(holeResults);
  const remaining = totalHoles - thru;
  const margin = Math.abs(diff);
  const decided = margin > remaining && remaining > 0;

  if (thru === 0) return { text: 'Not started', color: 'rgba(32,30,29,.5)', done: false };
  if (decided) {
    const leader = diff > 0 ? sideAShort : sideBShort;
    return { text: `${leader} ${margin} & ${remaining}`, color: diff > 0 ? RED : INK, done: true };
  }
  if (thru === totalHoles) {
    if (diff === 0) return { text: 'Halved', color: INK, done: true };
    const leader = diff > 0 ? sideAShort : sideBShort;
    return { text: `${leader} ${margin} UP`, color: diff > 0 ? RED : INK, done: true };
  }
  if (diff === 0) return { text: 'All square', color: INK, done: false };
  const leader = diff > 0 ? sideAShort : sideBShort;
  return { text: `${leader} ${margin} UP`, color: diff > 0 ? RED : INK, done: false };
}

// Fractional points a match currently contributes to each side: 1 share for
// a win, half each for a halve, split proportionally by team if still live
// (so the Trophy screen's "projected" total has something to show).
function matchPointShares(holeResults, totalHoles) {
  const diff = matchDiff(holeResults);
  const thru = holeResults.length;
  const remaining = totalHoles - thru;
  const margin = Math.abs(diff);
  const decided = margin > remaining && remaining > 0;
  const final = decided || thru === totalHoles;
  if (final) {
    if (diff === 0) return { a: 0.5, b: 0.5, final: true };
    return diff > 0 ? { a: 1, b: 0, final: true } : { a: 0, b: 1, final: true };
  }
  // live projection: whoever is currently up gets the full share, split on square
  if (diff === 0) return { a: 0.5, b: 0.5, final: false };
  return diff > 0 ? { a: 1, b: 0, final: false } : { a: 0, b: 1, final: false };
}

function courseFor(session) { return COURSES_BY_ID[session.courseId]; }

function sessionStatus(session) {
  if (session.courseId && COURSES_BY_ID[session.courseId].extra) return 'extra';
  if (!session.locked || session.matches.length === 0) return 'not-set';
  const course = courseFor(session);
  const allFinal = session.matches.every((m) => {
    const results = computeHoleResults(m, course.holes);
    return matchStateLabel(results, course.holes.length, 'A', 'B').done;
  });
  return allFinal ? 'final' : 'in-play';
}

// Points earned by each team from one session, split evenly across its
// matches (e.g. 2 points / 2 matches = 1 point per match).
function sessionPoints(session) {
  const course = courseFor(session);
  if (!course || course.extra || session.points === 0 || session.matches.length === 0) {
    return { team1: 0, team2: 0, final: session.matches.length > 0 };
  }
  const perMatch = session.points / session.matches.length;
  let team1 = 0, team2 = 0, allFinal = true;
  session.matches.forEach((m) => {
    const results = computeHoleResults(m, course.holes);
    const shares = matchPointShares(results, course.holes.length);
    team1 += shares.a * perMatch;
    team2 += shares.b * perMatch;
    if (!shares.final) allFinal = false;
  });
  return { team1, team2, final: allFinal };
}

function cupTotals(sessions) {
  let team1 = 0, team2 = 0, settled = 0;
  sessions.forEach((s) => {
    const pts = sessionPoints(s);
    team1 += pts.team1; team2 += pts.team2;
    if (pts.final) settled += (s.points || 0);
    else if (s.matches.length) {
      // partially played session: count only the decided matches toward "settled"
      const course = courseFor(s);
      const perMatch = s.points / s.matches.length;
      s.matches.forEach((m) => {
        const results = computeHoleResults(m, course.holes);
        if (matchPointShares(results, course.holes.length).final) settled += perMatch;
      });
    }
  });
  return { team1, team2, settled };
}

function fmtPoints(n) {
  const whole = Math.floor(n);
  const half = n - whole >= 0.5 - 1e-9;
  if (n === 0) return '0';
  return `${whole > 0 || !half ? whole : ''}${half ? '½' : ''}`.trim() || '0';
}

function fmtMoney(n) {
  const sign = n > 0 ? '+$' : n < 0 ? '−$' : '$';
  return sign + Math.abs(Math.round(n));
}
