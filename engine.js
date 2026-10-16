// Pure derived-state math. Nothing here touches the store or the DOM —
// gross scores + handicaps are the source of truth everywhere else; this
// module turns them into net scores, Nassau status and cup totals on read.
//
// Tournament rules encoded here:
//  - Each player's Handicap Index is converted to a course handicap for the
//    tee being played (index x slope/113 + rating - par), capped at MAX_HCP.
//    2v2 matches then play off 90% of that (rounded), strokes off the low
//    player in the match. Singles play the full difference.
//  - Every match is a Nassau: front nine, back nine, overall — 1 point each,
//    halves split 0.5/0.5.
//  - Fourball: best net ball per side wins the hole (±1).
//    Low ball / high ball: best nets compare and worst nets compare, so a
//    hole is worth up to ±2.

const MAX_HCP = 32;
const TEAM_ALLOWANCE = 0.9;
const BETS_PER_MATCH = 3;

// ---- handicaps --------------------------------------------------------------

// The tee a session is played from (falls back to the course's default).
function teeFor(session) {
  const course = COURSES_BY_ID[session.courseId];
  return course.tees.find((t) => t.id === session.teeId)
    || course.tees.find((t) => t.id === course.defaultTee) || course.tees[0];
}

// World Handicap System conversion: index x slope/113 + (rating - par),
// rounded to a whole number.
function courseHandicap(index, course, tee) {
  return Math.round(index * tee.slope / 113 + (tee.rating - (tee.par || course.par)));
}

// A player's course handicap for a session, before the MAX_HCP cap and allowance.
// Without a session (no course context) the index itself is used.
function courseHandicapFor(playerId, session) {
  const index = PLAYERS_BY_ID[playerId].hcp;
  if (!session) return Math.round(index);
  return courseHandicap(index, COURSES_BY_ID[session.courseId], teeFor(session));
}

// Playing handicap: course handicap, capped at MAX_HCP, then (2v2 only) 90%
// rounded. `session` supplies the course and tee.
function playingHandicaps(playerIds, session) {
  const team = playerIds.length > 2;
  const out = {};
  playerIds.forEach((id) => {
    const h = Math.min(courseHandicapFor(id, session), MAX_HCP);
    out[id] = team ? Math.round(h * TEAM_ALLOWANCE) : h;
  });
  return out;
}

// Strokes each player receives: their playing handicap minus the lowest in
// the match (the low player plays off scratch).
function handicapAllocation(playerIds, session) {
  const eff = playingHandicaps(playerIds, session);
  const low = Math.min.apply(null, playerIds.map((id) => eff[id]));
  const out = {};
  playerIds.forEach((id) => { out[id] = eff[id] - low; });
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

// ---- single hole -------------------------------------------------------------

// The most one hole can swing a bet. With the hammer there is no limit (each
// throw doubles the hole), so a bet is only settled once its nine is played.
function maxPerHole(format) {
  if (format === 'lowhigh') return 2;
  if (format === 'fourballhammer') return Infinity;
  return 1;
}

// ---- hammer -----------------------------------------------------------------------
// Fourball + hammer: during a hole either side may "throw the hammer". The
// other side must TAKE it (the hole's value doubles and the hammer passes to
// them, so they can throw it back) or FOLD (the thrower wins the hole at its
// current value). A hole is therefore worth 1, 2, 4, 8... Events for one hole
// are [{ by: 'A'|'B', resp: 'accept'|'fold'|null }] in order; resp null means
// the throw is still waiting for an answer.

function isHammerGame(match) { return match.format === 'fourballhammer'; }

function otherSide(side) { return side === 'A' ? 'B' : 'A'; }

function hammerOutcome(events) {
  let mult = 1, holder = null, pending = null, folded = null;
  for (const e of events || []) {
    if (e.resp == null) { pending = e.by; break; }
    if (e.resp === 'accept') { mult *= 2; holder = otherSide(e.by); continue; }
    folded = e.by;   // the thrower wins the hole at the value before this throw
    break;
  }
  return { mult, holder, pending, folded };
}

function canThrowHammer(events, by) {
  const h = hammerOutcome(events);
  return !h.pending && !h.folded && (h.holder == null || h.holder === by);
}

// Hole result (positive = side A) after the hammer: a fold hands the hole to
// the thrower at the current value; otherwise the normal result is multiplied.
function applyHammer(baseResult, events) {
  if (!events || !events.length) return baseResult;
  const h = hammerOutcome(events);
  if (h.folded) return (h.folded === 'A' ? 1 : -1) * h.mult;
  return baseResult * h.mult;
}

const sign = (n) => (n > 0 ? 1 : n < 0 ? -1 : 0);

// Net scores and the result of one hole for a match. `gross` maps
// playerId -> that player's gross strokes on this hole. Positive result =
// side A ahead, negative = side B.
function holeBreakdown(match, hole, gross) {
  const ids = match.sideA.concat(match.sideB);
  const strokes = handicapAllocation(ids, match._session);
  const nets = {};
  ids.forEach((id) => {
    const g = gross[id] != null ? gross[id] : hole.par;
    nets[id] = netScore(g, strokes[id], hole.si);
  });
  const a = match.sideA.map((id) => nets[id]);
  const b = match.sideB.map((id) => nets[id]);
  const lowA = Math.min.apply(null, a), lowB = Math.min.apply(null, b);
  const highA = Math.max.apply(null, a), highB = Math.max.apply(null, b);
  const low = sign(lowB - lowA);
  const high = sign(highB - highA);
  const result = match.format === 'lowhigh' ? low + high : low;
  return { nets, lowA, lowB, highA, highB, low, high, result };
}

// Result (see above) for every hole already played: all players have a
// committed gross for the hole. Stops at the first hole not yet entered.
function computeHoleResults(match, holes) {
  const ids = match.sideA.concat(match.sideB);
  const results = [];
  for (const hole of holes) {
    if (!ids.every((id) => match.grossScores[id] && match.grossScores[id][hole.n] != null)) break;
    const gross = {};
    ids.forEach((id) => { gross[id] = match.grossScores[id][hole.n]; });
    const hh = match.holeHammer && match.holeHammer[hole.n];
    results.push(applyHammer(holeBreakdown(match, hole, gross).result, hh && hh.events));
  }
  return results;
}

function matchDiff(holeResults) {
  return holeResults.reduce((a, b) => a + b, 0);
}

// ---- Nassau ---------------------------------------------------------------------

function nassauSegments(totalHoles) {
  const half = Math.ceil(totalHoles / 2);
  return [
    { key: 'front', label: 'Front', from: 0, to: half },
    { key: 'back', label: 'Back', from: half, to: totalHoles },
    { key: 'total', label: 'Total', from: 0, to: totalHoles },
  ];
}

// A bet is settled once the segment is complete or the lead can no longer be
// caught (lead > holes left × the most a hole can swing).
function segmentState(results, seg, maxPer) {
  const slice = results.slice(seg.from, seg.to);
  const len = seg.to - seg.from;
  const played = slice.length;
  const diff = matchDiff(slice);
  const remaining = len - played;
  const final = played > 0 && (remaining === 0 || Math.abs(diff) > remaining * maxPer);
  return { diff, played, len, remaining, final, started: played > 0 };
}

// Points a bet is worth to each side right now. Unstarted bets are worth
// nothing yet; live ones are projected to whoever leads (split when square).
function segmentShare(st) {
  if (!st.started) return { a: 0, b: 0, final: false };
  if (st.diff > 0) return { a: 1, b: 0, final: st.final };
  if (st.diff < 0) return { a: 0, b: 1, final: st.final };
  return { a: 0.5, b: 0.5, final: st.final };
}

const MUTED_INK = 'rgba(10,16,48,.5)';

function segmentText(st, nickA, nickB) {
  if (!st.started) return '—';
  if (st.diff === 0) return st.final ? 'Halved' : 'All square';
  const leader = st.diff > 0 ? nickA : nickB;
  const m = Math.abs(st.diff);
  return st.final && st.remaining > 0 ? `${leader} ${m}&${st.remaining}` : `${leader} ${m} UP`;
}

// Full Nassau picture for a match.
function nassauStatus(holeResults, totalHoles, nickA, nickB, maxPer) {
  const segments = nassauSegments(totalHoles).map((seg) => {
    const st = segmentState(holeResults, seg, maxPer || 1);
    return Object.assign({ key: seg.key, label: seg.label }, st, {
      text: segmentText(st, nickA, nickB),
      color: !st.started ? MUTED_INK : st.diff > 0 ? TEAM1_COLOR : st.diff < 0 ? TEAM2_TEXT : INK,
      share: segmentShare(st),
    });
  });
  return segments;
}

// Headline state for a match (its overall bet), plus whether every bet is
// settled. `done` therefore means the whole Nassau is decided.
function matchStateLabel(holeResults, totalHoles, sideAShort, sideBShort, maxPer) {
  const segments = nassauStatus(holeResults, totalHoles, sideAShort, sideBShort, maxPer);
  const total = segments[2];
  const done = segments.every((s) => s.final);
  if (!total.started) return { text: 'Not started', color: MUTED_INK, done: false, segments };
  return { text: total.text, color: total.color, done, segments };
}

// Points each side holds across the match's three bets.
function matchPointShares(holeResults, totalHoles, maxPer) {
  const segments = nassauStatus(holeResults, totalHoles, 'A', 'B', maxPer);
  let a = 0, b = 0, settledA = 0, settledB = 0;
  segments.forEach((s) => {
    a += s.share.a; b += s.share.b;
    if (s.share.final) { settledA += s.share.a; settledB += s.share.b; }
  });
  return { a, b, settledA, settledB, final: segments.every((s) => s.final), segments };
}

// ---- sessions ---------------------------------------------------------------------

function courseFor(session) { return COURSES_BY_ID[session.courseId]; }

// Does this round count toward the team event? (Old saved trips without the
// flag count it.)
function sessionCounts(session) {
  return session.counts !== undefined ? !!session.counts : true;
}

function plannedMatches(session) {
  return session.matches.length || (session.shape === 'singles' ? 4 : 2);
}

// Team-event points on offer in a session: one per Nassau bet.
function sessionPointValue(session) {
  return sessionCounts(session) ? plannedMatches(session) * BETS_PER_MATCH : 0;
}

function matchResults(match, course) { return computeHoleResults(match, course.holes); }

function sessionStatus(session) {
  if (!session.locked || session.matches.length === 0) return 'not-set';
  const course = courseFor(session);
  const allDone = session.matches.every((m) =>
    matchStateLabel(matchResults(m, course), course.holes.length, 'A', 'B', maxPerHole(m.format)).done);
  return allDone ? 'final' : 'in-play';
}

// Points the two teams hold from one session (live bets projected).
function sessionPoints(session) {
  if (!sessionCounts(session) || session.matches.length === 0) {
    return { team1: 0, team2: 0, final: session.matches.length > 0 };
  }
  const course = courseFor(session);
  let team1 = 0, team2 = 0, allFinal = true;
  session.matches.forEach((m) => {
    const s = matchPointShares(matchResults(m, course), course.holes.length, maxPerHole(m.format));
    team1 += s.a; team2 += s.b;
    if (!s.final) allFinal = false;
  });
  return { team1, team2, final: allFinal };
}

function cupTotals(sessions) {
  let team1 = 0, team2 = 0, settled = 0, settled1 = 0, settled2 = 0, available = 0;
  sessions.forEach((s) => {
    available += sessionPointValue(s);
    if (!sessionCounts(s)) return;
    const course = courseFor(s);
    s.matches.forEach((m) => {
      const sh = matchPointShares(matchResults(m, course), course.holes.length, maxPerHole(m.format));
      team1 += sh.a; team2 += sh.b;
      settled += sh.settledA + sh.settledB;
      settled1 += sh.settledA; settled2 += sh.settledB;
    });
  });
  // Win line: more than half of the points on offer (24 -> 12.5).
  return { team1, team2, settled, settled1, settled2, available, toWin: available / 2 + 0.5 };
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
