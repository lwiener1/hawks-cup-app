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

// The help page opens from the ? in the header on any screen; Back returns there.
function openHelp() {
  update((state) => {
    if (state.ui.screen !== 'help') state.ui.helpFrom = state.ui.screen;
    state.ui.screen = 'help';
  });
}

function goBack() {
  update((state) => {
    const s = state.ui.screen;
    if (s === 'help') { state.ui.screen = state.ui.helpFrom && state.ui.helpFrom !== 'help' ? state.ui.helpFrom : 'cup'; return; }
    if (s === 'foursome') { state.ui.screen = state.ui.cardFrom === 'live' ? 'live' : 'rounds'; return; }
    if (s === 'sidedetail') { state.ui.screen = 'side'; return; }
    if (s === 'sideedit') { state.ui.screen = state.ui.sideDraft && state.ui.sideDraft.id ? 'sidedetail' : 'side'; return; }
    if (s === 'card' && state.ui.cardFrom === 'live') state.ui.screen = 'live';
    else if (s === 'card' && state.ui.cardFrom === 'verify' && findSession(state.ui.verifySessionId)) state.ui.screen = 'verify';
    else state.ui.screen = (s === 'card' || s === 'setup' || s === 'verify') ? 'rounds' : 'cup';
    state.ui.cardFrom = 'rounds';
  });
}

function openSetup(sessionId) {
  update((state) => { state.ui.setupSessionId = sessionId; state.ui.screen = 'setup'; });
}

function openCard(matchId) {
  // a Saturday singles match opens its foursome's card: one screen, four scores
  const sess = sessionForMatch(matchId), mm = matchById(matchId);
  if (sess && mm && sess.shape === 'singles' && foursomeMatches(sess, foursomeIndex(sess, mm.sideA[0])).length === 2) { openFoursome(matchId); return; }
  update((state) => {
    state.ui.cardFrom = state.ui.screen === 'live' ? 'live' : 'rounds';   // Back returns to where you came from
    state.ui.cardMatchId = matchId;
    state.ui.screen = 'card';
  });
}

// Course, tee and the counts-toward-the-cup switch all change a match's result,
// so they are frozen while any match in the round is submitted.
function roundIsLocked(sessionId) {
  if (!findSession(sessionId).matches.some((m) => m.submitted)) return false;
  showNotice('A match in this round is submitted and locked. Unlock it (match card, "Unlock to edit") before changing the course, tees or team-event setting.');
  return true;
}

function pickCourse(sessionId, courseId) {
  if (roundIsLocked(sessionId)) return;
  update((state) => {
    const session = findSession(sessionId);
    session.courseId = courseId;
    session.teeId = COURSES_BY_ID[courseId].defaultTee;
    // the hammer only exists at Tobacco Road: moving the round elsewhere drops it
    const g = GAMES_BY_ID[session.format];
    if (g && !gameAllowedAt(g, courseId)) session.format = gamesForCourse(courseId, g.shape)[0].id;
  });
}

function pickTee(sessionId, teeId) {
  if (roundIsLocked(sessionId)) return;
  update((state) => {
    const session = findSession(sessionId);
    if (COURSES_BY_ID[session.courseId].tees.some((t) => t.id === teeId)) session.teeId = teeId;
  });
}

function pickShape(sessionId, shape) {
  update((state) => {
    const session = findSession(sessionId);
    session.shape = shape;
    session.format = gamesForCourse(session.courseId, shape)[0].id;
  });
}

function pickGame(sessionId, gameId) {
  const g = GAMES_BY_ID[gameId], session = findSession(sessionId);
  if (g && !gameAllowedAt(g, session.courseId)) { showNotice(`${g.name} is only played at Tobacco Road.`); return; }
  update((state) => { findSession(sessionId).format = gameId; });
}

function toggleCounts(sessionId) {
  if (roundIsLocked(sessionId)) return;
  update((state) => {
    const session = findSession(sessionId);
    session.counts = !sessionCounts(session);
  });
}

// Two-man teams can't repeat between the morning and afternoon rounds of the
// same day. A "day" is the session's day label without its AM / PM.
function dayOf(session) { return String(session.day || '').replace(/\s+(AM|PM)$/i, '').trim(); }
function partnerKey(a, b) { return [a, b].sort().join('+'); }
function partnerPairs(order) { return [partnerKey(order[0], order[1]), partnerKey(order[2], order[3])]; }

// The other round that day already using one of the partnerships in `order`, or null.
function partnerClash(session, order) {
  if (session.shape !== 'team') return null;
  const mine = partnerPairs(order);
  for (const other of getState().sessions) {
    if (other.id === session.id || other.shape !== 'team' || dayOf(other) !== dayOf(session)) continue;
    for (const o of [other.teamLOrder, other.teamTOrder]) {
      const hit = partnerPairs(o).find((k) => mine.includes(k));
      if (hit) return { session: other, pair: hit.split('+').map((id) => PLAYERS_BY_ID[id].name) };
    }
  }
  return null;
}
function partnerClashNote(c) {
  return `${c.pair.join(' and ')} already play together in the ${c.session.day} round. A pair can't repeat in the morning and afternoon rounds, so change that round first or pick a different partner.`;
}
function orderAfterSwap(order, slot, playerId) {
  const o = order.slice(), from = o.indexOf(playerId);
  if (from === -1 || from === slot) return o;
  o[from] = o[slot];
  o[slot] = playerId;
  return o;
}

// Put `playerId` in position `slot` for their team; whoever was there swaps
// into the vacated position, so every player stays in exactly one slot.
function setSlot(sessionId, team, slot, playerId) {
  const session0 = findSession(sessionId);
  const key0 = team === 'L' ? 'teamLOrder' : 'teamTOrder';
  const clash = partnerClash(session0, orderAfterSwap(session0[key0], slot, playerId));
  if (clash) { showNotice(partnerClashNote(clash)); render(); return; }
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

// Closest to the pin on a par 3: tap the winner (tap again to clear). It pays
// out of the whole foursome and is saved immediately, not with Post hole.
function setCtp(matchId, holeN, playerId) {
  if (matchIsLocked(matchId)) return;
  update((state) => {
    const session = sessionForMatch(matchId);
    if (!session) return;
    const gi = foursomeIndex(session, playerId);
    if (gi < 0) return;
    session.ctp = session.ctp || {};
    const h = session.ctp[holeN] = session.ctp[holeN] || {};
    if (h[gi] && h[gi].p === playerId) delete h[gi]; else h[gi] = { p: playerId, ts: Date.now() };
    if (!Object.keys(h).length) delete session.ctp[holeN];
    rebuildCtp(state, session);
  });
}

// ---- the foursome card (Saturday singles) -----------------------------------------
// One screen for the whole foursome: all four players' scores for the hole, the
// closest-to-pin winner and the fines. It writes to the two singles matches the
// foursome is made of, so everything downstream (results, money, conflicts,
// submit and lock) is exactly what the single match card does.

function foursomeMatches(session, gi) {
  const g = sessionGroups(session)[gi];
  if (!g) return [];
  return session.matches.filter((m) => m.sideA.concat(m.sideB).every((id) => g.includes(id)));
}

function openFoursome(matchId) {
  update((state) => {
    const session = sessionForMatch(matchId), m = matchById(matchId);
    const gi = foursomeIndex(session, m.sideA[0]);
    const ms = foursomeMatches(session, gi), course = courseFor(session);
    state.ui.cardFrom = state.ui.screen === 'live' ? 'live' : 'rounds';
    state.ui.foursome = { sessionId: session.id, gi };
    const idx = cardView(state, ms[0], course).holeIdx;       // both matches score the same hole together
    ms.forEach((x) => { if (cardView(state, x, course).holeIdx !== idx) setViewedHole(state, x.id, idx); });
    state.ui.screen = 'foursome';
  });
}

function foursomeGoto(idx) {
  update((state) => {
    const f = state.ui.foursome, session = f && findSession(f.sessionId);
    if (!session) return;
    const course = courseFor(session);
    const i = Math.max(0, Math.min(course.holes.length - 1, idx));
    foursomeMatches(session, f.gi).forEach((m) => setViewedHole(state, m.id, i));
  });
}
function foursomeStep(delta) {
  const f = getState().ui.foursome, session = f && findSession(f.sessionId);
  if (!session) return;
  const ms = foursomeMatches(session, f.gi);
  foursomeGoto(cardView(getState(), ms[0], courseFor(session)).holeIdx + delta);
}

// Post the hole for both matches. If the first one runs into a score conflict
// the popup comes up and the second is posted after it is resolved.
function postNext(ids) {
  const queue = ids.slice();
  while (queue.length) {
    const id = queue.shift();
    postHoleAndAdvance(id, undefined, queue.slice());
    const c = getState().ui.scoreConflict;
    if (c && c.matchId === id) return;
  }
}
function postFoursomeHole() {
  const f = getState().ui.foursome, session = f && findSession(f.sessionId);
  if (session) postNext(foursomeMatches(session, f.gi).map((m) => m.id));
}
function submitFoursome() {
  const f = getState().ui.foursome, session = f && findSession(f.sessionId);
  if (!session) return;
  foursomeMatches(session, f.gi).forEach((m) => { if (!m.submitted && matchComplete(m, courseFor(session))) submitMatch(m.id); });
}

// Fines on the foursome card: pick the fine, then tap who. The fine is stored
// on the singles match that player is in.
function fsSelectTag(tag) {
  update((state) => { state.ui.fineTag = state.ui.fineTag === tag ? null : tag; });
}
function fsToggleFine(playerId, tagOverride) {
  const f = getState().ui.foursome, session = f && findSession(f.sessionId);
  if (!session) return;
  const tag = tagOverride || getState().ui.fineTag;
  if (!tag) { showNotice('Pick the fine first, then tap who it\'s for.'); return; }
  const m = foursomeMatches(session, f.gi).find((x) => x.sideA.concat(x.sideB).includes(playerId));
  if (!m || matchIsLocked(m.id)) return;
  update((state) => {
    writeDraft(state, m, courseFor(session), (d) => {
      const cur = d.who[tag] || [];
      if (cur.includes(playerId)) {
        d.who[tag] = cur.filter((x) => x !== playerId);
        if (!d.who[tag].length) { delete d.who[tag]; d.tags = d.tags.filter((t) => t !== tag); }
      } else {
        if (!d.tags.includes(tag)) d.tags.push(tag);
        d.who[tag] = cur.concat(playerId);
      }
    });
  });
}

// Singles rounds: tap one player, then a player in the other foursome, to swap them.
function pickForGroup(sessionId, playerId) {
  const session = findSession(sessionId);
  if (!session || session.shape !== 'singles') return;
  const pick = getState().ui.groupPick;
  if (!pick || pick.sessionId !== sessionId || pick.playerId === playerId) {
    update((state) => { state.ui.groupPick = pick && pick.playerId === playerId && pick.sessionId === sessionId ? null : { sessionId, playerId }; });
    return;
  }
  const groups = sessionGroups(session);
  const gi = foursomeIndex(session, pick.playerId), gj = foursomeIndex(session, playerId);
  if (gi === gj) { update((state) => { state.ui.groupPick = { sessionId, playerId }; }); return; }   // same foursome: just move the highlight
  if (roundIsLocked(sessionId)) { update((state) => { state.ui.groupPick = null; }); return; }
  // a foursome is two whole matches, so the swap moves a match (both of its players)
  const pairs = pairingsFromOrders('singles', session.teamLOrder, session.teamTOrder).map((p) => p.sideA.concat(p.sideB));
  const pairOf = (id) => pairs.find((p) => p.includes(id));
  const mine = pairOf(pick.playerId), theirs = pairOf(playerId);
  update((state) => {
    const s = findSession(sessionId);
    const keepI = groups[gi].filter((id) => !mine.includes(id)), keepJ = groups[gj].filter((id) => !theirs.includes(id));
    const next = [];
    next[gi] = keepI.concat(theirs);
    next[gj] = keepJ.concat(mine);
    s.groups = next;
    rebuildCtp(state, s);
    state.ui.groupPick = null;
  });
}

function lockInSession(sessionId) {
  if (findSession(sessionId).matches.some((m) => m.submitted)) {
    showNotice('A match in this round is submitted and locked, so the pairings can\'t be re-set. Unlock it first (match card, "Unlock to edit").');
    return;
  }
  {
    const s0 = findSession(sessionId);
    const clash = partnerClash(s0, s0.teamLOrder) || partnerClash(s0, s0.teamTOrder);
    if (clash) { showNotice(partnerClashNote(clash)); return; }
  }
  update((state) => {
    const session = findSession(sessionId);
    const pairings = pairingsFromOrders(session.shape, session.teamLOrder, session.teamTOrder);
    session.matches = pairings.map((p) => makeMatch(p.sideA, p.sideB, null, session.format));
    session.locked = true;
    session.ctp = {};                // new matches, new scores: closest-to-pin wins start over
    rebuildCtp(state, session);
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

// A submitted match can't be changed until it is unlocked with the code.
function matchIsLocked(matchId) {
  const match = matchById(matchId);
  if (!match || !match.submitted) return false;
  showNotice('This match is submitted and locked. Tap "Unlock to edit" and enter the code to change it.');
  return true;
}

function submitMatch(matchId) {
  update((state) => {
    const match = matchById(matchId);
    const session = sessionForMatch(matchId);
    const course = courseFor(session);
    if (!match || match.submitted || !matchComplete(match, course)) return;
    const who = myName(state);
    match.submitted = { by: state.ui.me || null, name: who, ts: Date.now() };
    const results = computeHoleResults(match, course.holes);
    const label = matchStateLabel(results, course.holes.length, sideShortLabel(state, session, match.sideA), sideShortLabel(state, session, match.sideB), maxPerHole(match.format));
    const nassau = label.segments.map((s) => `${s.label} ${s.text}`).join(' · ');
    state.feed.unshift({ id: uid('fd'), author: 'Hawks Cup', isSystem: true, ts: Date.now(),
      text: `${playerNames(match.sideA)} vs ${playerNames(match.sideB)} submitted by ${who}: ${nassau}.` });
  });
}

function unlockMatch(matchId) {
  update((state) => {
    const match = matchById(matchId);
    if (!match || !match.submitted) return;
    const was = match.submitted.name || 'someone';
    delete match.submitted;
    state.feed.unshift({ id: uid('fd'), author: 'Hawks Cup', isSystem: true, ts: Date.now(),
      text: `${playerNames(match.sideA)} vs ${playerNames(match.sideB)} was unlocked by ${myName(state)} (it had been submitted by ${was}).` });
  });
}

function stepGross(matchId, playerId, delta) {
  if (matchIsLocked(matchId)) return;
  update((state) => {
    const match = matchById(matchId);
    const course = courseFor(sessionForMatch(matchId));
    writeDraft(state, match, course, (d) => {
      d.gross[playerId] = Math.max(1, Math.min(12, d.gross[playerId] + delta));
    });
  });
}

function toggleTag(matchId, tag) {
  if (matchIsLocked(matchId)) return;
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

// Name the player a CTP pays, or the player(s) a penalty tag fines.
function toggleTagWho(matchId, tag, playerId) {
  const rule = TAG_RULES[tag];
  if (!rule || matchIsLocked(matchId)) return;
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
  if (matchIsLocked(matchId)) return;
  update((state) => {
    const match = matchById(matchId);
    const course = courseFor(sessionForMatch(matchId));
    if (!canThrowHammer(cardView(state, match, course).hammer, by)) return;
    writeDraft(state, match, course, (d) => { d.hammer.push({ by, resp: null }); });
  });
}

function answerHammer(matchId, resp) {
  if (matchIsLocked(matchId)) return;
  update((state) => {
    const match = matchById(matchId);
    const course = courseFor(sessionForMatch(matchId));
    if (!hammerOutcome(cardView(state, match, course).hammer).pending) return;
    writeDraft(state, match, course, (d) => { d.hammer[d.hammer.length - 1].resp = resp; });
  });
}

function undoHammer(matchId) {
  if (matchIsLocked(matchId)) return;
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

// Which of the conflicting scores is right: choose per player, then confirm.
function chooseConflict(playerId, which) {
  update((state) => {
    const c = state.ui.scoreConflict;
    if (c) c.choice[playerId] = which === 'posted' ? 'posted' : 'mine';
  });
}
function cancelConflict() {
  update((state) => { state.ui.scoreConflict = null; });
}
function confirmConflict() {
  const c = getState().ui.scoreConflict;
  if (!c) return;
  if (!c.items.every((it) => c.choice[it.playerId])) { showNotice('Pick the correct score for each player first.'); return; }
  const rest = (c.queue || []).slice();
  postHoleAndAdvance(c.matchId, Object.assign({}, c.choice));
  if (rest.length && !getState().ui.scoreConflict) postNext(rest);   // the other match in the foursome
}

function postHoleAndAdvance(matchId, resolved, queue) {
  if (matchIsLocked(matchId)) return;
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

    // Two people scoring the same match can end up entering different scores for
    // the same player on the same hole. If this hole was already posted by
    // someone else and what's about to be posted differs, stop and ask which is right.
    const posted = match.holeBy && match.holeBy[hole.n];
    const conflicts = [];
    if (posted && posted.by !== (state.ui.me || null)) {
      ids.forEach((id) => {
        const ex = match.grossScores[id] && match.grossScores[id][hole.n];
        if (ex != null && ex !== v.gross[id]) conflicts.push({ playerId: id, posted: ex, mine: v.gross[id] });
      });
    }
    if (conflicts.length && !(resolved && conflicts.every((c) => resolved[c.playerId]))) {
      state.ui.scoreConflict = {
        matchId, holeN: hole.n, by: posted.name || 'Someone', byId: posted.by || null, ts: posted.ts,
        items: conflicts, choice: Object.assign({}, resolved || {}), queue: queue || [],
      };
      return;
    }
    let conflictNote = '';
    if (conflicts.length) {
      conflictNote = ` Score conflict on hole ${hole.n}: ` + conflicts.map((c) => {
        const keptPosted = resolved[c.playerId] === 'posted';
        if (keptPosted) v.gross[c.playerId] = c.posted;
        return `${PLAYERS_BY_ID[c.playerId].name} was ${c.posted} (${posted.name || 'someone'}) vs ${c.mine} (${myName(state)}), confirmed as ${keptPosted ? c.posted : c.mine}.`;
      }).join(' ');
    }
    state.ui.scoreConflict = null;
    match.holeBy = match.holeBy || {};
    match.holeBy[hole.n] = { by: state.ui.me || null, name: myName(state), ts: Date.now() };

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
        // The offender pays the fine into the one big fine pot (no one else
        // collects it; the pot total shows on the Money screen).
        (whoNow[tag] || []).forEach((pid) => {
          state.ledger.push({ id: uid('ldg'), kind: 'fine', matchId, holeN: hole.n, playerId: pid, amount: -rule.amount, detail: `${tag} ${ordinal(hole.n)}`, ts });
        });
      }
    });

    // Hole in one / albatross: a feed post (which is what sets off the
    // celebration on every phone) plus the bounty from everyone else. Ids are
    // fixed per match, hole and player, so re-posting the hole never duplicates
    // or re-celebrates, and correcting a mistaken score removes both again.
    const featPrefix = `feat_${matchId}_${hole.n}_`;
    const oldFeats = {};
    state.feed.forEach((f) => { if (f.feat && f.id.indexOf(featPrefix) === 0) oldFeats[f.id] = f; });
    state.feed = state.feed.filter((f) => !oldFeats[f.id]);
    ids.forEach((pid) => {
      const type = featFor(v.gross[pid], hole.par);
      if (!type) return;
      const name = PLAYERS_BY_ID[pid].name;
      const others = PLAYERS.filter((p) => p.id !== pid);
      const total = FEAT_BOUNTY * others.length;
      const fid = featPrefix + pid;
      const ts = oldFeats[fid] ? oldFeats[fid].ts : Date.now();
      const label = FEAT_NAMES[type];
      state.feed.unshift({
        id: fid, author: 'Hawks Cup', isSystem: true, ts,
        text: `${type === 'ace' ? 'ACE!' : 'ALBATROSS!'} ${name} made a ${label.toLowerCase()} on the ${ordinal(hole.n)} at ${course.name}. Everyone else owes ${name} $${FEAT_BOUNTY} ($${total}).`,
        feat: { type, playerId: pid, holeN: hole.n, course: course.name, par: hole.par, bounty: FEAT_BOUNTY, total },
      });
      const detail = `${label} ${ordinal(hole.n)}`;
      state.ledger.push({ id: uid('ldg'), kind: 'bounty', matchId, holeN: hole.n, playerId: pid, amount: total, detail, ts });
      others.forEach((p) => {
        state.ledger.push({ id: uid('ldg'), kind: 'bounty', matchId, holeN: hole.n, playerId: p.id, amount: -FEAT_BOUNTY, detail: `${detail} (${name})`, ts });
      });
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
    state.feed.unshift({ id: uid('fd'), author: 'Hawks Cup', isSystem: true, text: text + hammerNote + conflictNote, ts: Date.now() });

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

// The tiebreaker of last resort: record which team won a playoff when the cup
// is level on points and on net stableford. null undoes it.
function setPlayoff(team) {
  update((state) => { state.playoffWinner = team === 'L' || team === 'T' ? team : null; });
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

// Remove a fine / manual entry (or a whole match payout). Closest-to-pin wins and
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
  const submittedWithPlayer = getState().sessions.some((s) => s.matches.some((m) => m.submitted && m.sideA.concat(m.sideB).includes(playerId)));
  if (submittedWithPlayer) {
    closeHcp();
    showNotice(`${PLAYERS_BY_ID[playerId].name} is in a submitted match. Unlock it before changing the handicap, because it would change that match's result.`);
    return;
  }
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

function setJoinMode(mode) {
  update((state) => { state.ui.joinMode = mode === 'practice' ? 'practice' : 'live'; });
}

// Leave this trip on this phone only: back to the welcome screen to type a
// code and pick a player. Nothing is changed for anyone else.
function changeTripCode() {
  applyTripCode('');
  update((state) => { state.ui.me = null; });
}

function resetTrip(kind) {
  if (liveClearLocked(getState())) {
    showNotice('The live tournament is locked: it can\'t be cleared once play has started (11/6).');
    return;
  }
  const oldPhotoIds = getState().photos.map((p) => p.id);
  update((state) => {
    const base = kind === 'sample' ? seedState(state.ui) : freshState(state.ui);
    state.photos = [];
    state.ui.viewPhotoId = null;
    state.sideMatches = base.sideMatches || [];
    state.playoffWinner = null;
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
  return location.origin + location.pathname;
}
