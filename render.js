// Builds the whole app as one HTML string per render. Simple, and plenty
// fast at this scale — event handling is delegated once in main.js rather
// than re-bound after every render.

function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const TABS = [
  { id: 'cup', name: 'Cup' }, { id: 'rounds', name: 'Rounds' }, { id: 'side', name: 'Side' }, { id: 'money', name: 'Money' },
  { id: 'feed', name: 'Feed' }, { id: 'team', name: 'Teams' },
];

function headerInfo(state) {
  const screen = state.ui.screen;
  if (screen === 'verify') {
    const session = findSession(state.ui.verifySessionId);
    const n = photosFor(state, session.id).length;
    return { kicker: 'Verify scores', title: courseFor(session).name, right: `${n} photo${n === 1 ? '' : 's'}` };
  }
  if (screen === 'setup') {
    const session = findSession(state.ui.setupSessionId);
    return { kicker: `Session ${session.n}`, title: 'Set the game', right: 'Anyone can edit' };
  }
  if (screen === 'card') {
    const session = sessionForMatch(state.ui.cardMatchId);
    const course = courseFor(session);
    const game = gameFor(session);
    return { kicker: `${course.name} · ${game.name}`, title: 'Match card', right: `Scoring: ${myName(state)}` };
  }
  if (screen === 'help') return { kicker: 'The Hawks Cup', title: 'Help & player guide', right: '' };
  if (screen === 'foursome') {
    const fs = state.ui.foursome, sess = fs && findSession(fs.sessionId);
    return { kicker: sess ? `${courseFor(sess).name} · Singles` : 'Singles', title: 'Foursome', right: `Scoring: ${myName(state)}` };
  }
  if (screen === 'sidedetail') {
    const sm = sideById(state, state.ui.sideId);
    return { kicker: 'Side match', title: sm ? sm.name : 'Side match', right: sm ? sideFormatName(sm.format) : '' };
  }
  if (screen === 'sideedit') {
    const d = state.ui.sideDraft;
    return { kicker: 'Side match', title: d && d.id ? 'Edit settings' : 'New side match', right: 'Fully custom' };
  }
  const map = {
    side: { kicker: 'Individual games', title: 'Side matches', right: `${(state.sideMatches || []).length} game${(state.sideMatches || []).length === 1 ? '' : 's'}` },
    live: { kicker: 'Live scoring', title: 'On the course', right: `${liveMatchSets(state).live.length} live` },
    cup: { kicker: 'Standings', title: 'The Hawks Cup', right: new Date().toLocaleDateString('en-US', { weekday: 'short' }) },
    rounds: { kicker: 'Schedule', title: 'Sessions', right: '4 rounds' },
    money: { kicker: 'Games & money', title: 'The pot', right: moneyMovedLabel(state) },
    feed: { kicker: 'The group', title: 'Chatter', right: '8 golfers' },
    team: { kicker: 'Rosters', title: 'Teams & courses', right: '8 golfers' },
    trophy: { kicker: 'Projection', title: 'Where it lands', right: `${fmtPoints(cupTotals(state.sessions).available)} pts` },
  };
  return map[screen] || map.cup;
}

const SYNC_LABELS = {
  live: ['Live', 'var(--accent)'], connecting: ['Connecting…', 'var(--muted)'],
  offline: ['Offline · saving', 'var(--ink)'], error: ['Sync error', 'var(--accent)'],
};

function moneyMovedLabel(state) {
  const total = allLedger(state).filter((e) => e.amount > 0).reduce((a, e) => a + e.amount, 0);
  return `$${total} moved`;
}

function renderHeader(state) {
  const info = headerInfo(state);
  const showBack = ['card', 'foursome', 'setup', 'trophy', 'verify', 'sidedetail', 'sideedit', 'help'].includes(state.ui.screen);
  const helpBtn = state.ui.screen === 'help' ? '' : `<button data-action="open-help" aria-label="Help and player guide" style="flex:none;width:34px;height:34px;border:2px solid var(--accent);border-radius:50%;background:transparent;color:var(--accent);font-weight:800;font-size:17px;line-height:1;padding:0">?</button>`;
  const practiceBar = isPractice(state)
    ? `<div style="flex:none;background:var(--accent);color:#fff;text-align:center;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;padding:calc(env(safe-area-inset-top,0px) + 5px) 10px 5px">Practice mode &middot; nothing here counts</div>` : '';
  return `${practiceBar}
  <div style="flex:none;padding:${practiceBar ? '10px' : 'env(safe-area-inset-top,20px)'} 20px 12px;display:flex;align-items:center;gap:12px;background:var(--bg)">
    <button data-action="go-back" style="display:${showBack ? 'flex' : 'none'};align-items:center;justify-content:center;width:36px;height:36px;padding:0;border:1px solid var(--rule);border-radius:50%;background:transparent;color:var(--ink);font-size:17px;line-height:1">&larr;</button>
    <img src="./logo.png" alt="Hawks" width="38" height="36" style="flex:none;display:${showBack ? 'none' : 'block'};width:38px;height:36px">
    <div style="flex:1;min-width:0">
      <div style="font-size:13px;font-weight:600;color:var(--muted);line-height:1.2">${esc(info.kicker)}</div>
      <div style="font-size:22px;font-weight:800;letter-spacing:-.015em;line-height:1.15">${esc(info.title)}</div>
    </div>
    <div style="text-align:right;white-space:nowrap">
      <div style="font-size:13px;font-weight:700;color:var(--muted)">${esc(info.right)}</div>
      ${SYNC_LABELS[Sync.status] ? `<div style="font-size:12px;font-weight:700;color:${SYNC_LABELS[Sync.status][1]}">&bull; ${SYNC_LABELS[Sync.status][0]}</div>` : ''}
    </div>
    ${helpBtn}
  </div>`;
}

function renderTabBar(state) {
  const screen = state.ui.screen;
  return `
  <div style="flex:none;display:flex;gap:2px;background:var(--bg);border-top:1px solid var(--rule);padding:6px 6px calc(env(safe-area-inset-bottom,14px) + 2px)">
    ${TABS.map((t) => {
      const on = screen === t.id || (t.id === 'side' && (screen === 'sidedetail' || screen === 'sideedit'));
      return `
      <button data-action="go-screen" data-screen="${t.id}" style="flex:1;border:0;border-radius:12px;background:${on ? 'var(--accent)' : 'transparent'};color:${on ? '#fff' : 'var(--muted)'};font-weight:${on ? 800 : 700};font-size:12.5px;padding:11px 0">${t.name}</button>
    `;
    }).join('')}
  </div>`;
}

function holeFill(r) {
  return r > 0 ? 'var(--accent)' : r < 0 ? 'var(--team2)' : 'var(--rule-soft)';
}

// "Front LAWDs 2 UP · Back — · Total LAWDs 1 UP", one chip per Nassau bet.
function nassauChips(segments) {
  return `<div style="display:flex;gap:1px;background:var(--rule);border:1px solid var(--rule);margin-top:9px">${segments.map((s) => `
    <div style="flex:1;min-width:0;background:var(--bg);padding:5px 6px">
      <div style="font-size:8px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:rgba(10,16,48,.45)">${s.label}${s.final ? ' &check;' : ''}</div>
      <div style="font-size:11px;font-weight:800;color:${s.color};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.text)}</div>
    </div>`).join('')}</div>`;
}

function holeStrip(results, totalHoles) {
  const cells = [];
  for (let i = 0; i < totalHoles; i++) {
    cells.push(`<div style="flex:1;height:14px;background:${i < results.length ? holeFill(results[i]) : 'var(--rule-faint)'}"></div>`);
  }
  return `<div style="display:flex;gap:2px;margin-top:9px">${cells.join('')}</div>`;
}

// ---------- Cup ----------
// Layout: the projected score (clearly labelled), your own match, the net
// stableford tiebreaker as its own section, anything waiting to be submitted,
// the other matches, then the rounds.
function sectionTitle(text, right) {
  return `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:22px 20px 6px"><div style="font-size:16px;font-weight:800;letter-spacing:-.01em">${text}</div>${right ? `<div style="font-size:13px;color:var(--muted)">${right}</div>` : ''}</div>`;
}

function renderCup(state) {
  const totals = cupTotals(state.sessions);
  const pct = (n) => `${(n / (totals.available || 1)) * 100}%`;
  const nick1 = esc(teamNickname(state.teamOneName)), nick2 = esc(teamNickname(state.teamTwoName));
  const allDone = totals.available > 0 && totals.settled >= totals.available;

  // ---- the score: it counts every match as it stands right now ----
  const scoreBlock = `
    <div style="padding:20px 20px 4px">
      <div style="font-size:13px;font-weight:700;color:var(--accent)">${allDone ? 'Final score' : 'Projected score &middot; if every match ended now'}</div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:12px">
        <div style="min-width:0">
          <div style="font-size:14px;font-weight:600;color:var(--muted);line-height:1.2">${esc(state.teamOneName)}</div>
          <div style="font-size:68px;font-weight:800;line-height:.95;letter-spacing:-.04em;color:var(--accent)">${fmtPoints(totals.team1)}</div>
        </div>
        <div style="text-align:right;min-width:0">
          <div style="font-size:14px;font-weight:600;color:var(--muted);line-height:1.2">${esc(state.teamTwoName)}</div>
          <div style="font-size:68px;font-weight:800;line-height:.95;letter-spacing:-.04em;color:var(--team2)">${fmtPoints(totals.team2)}</div>
        </div>
      </div>
      <div style="display:flex;height:6px;border-radius:3px;overflow:hidden;background:var(--rule-soft);margin-top:14px">
        <div style="width:${pct(totals.team1)};background:var(--accent)"></div>
        <div style="flex:1"></div>
        <div style="width:${pct(totals.team2)};background:var(--team2)"></div>
      </div>
      <div style="display:flex;justify-content:space-between;gap:10px;font-size:13px;color:var(--muted);margin-top:8px">
        <span>Settled so far: <strong style="color:var(--ink)">${fmtPoints(totals.settled1)} &ndash; ${fmtPoints(totals.settled2)}</strong></span>
        <span>${fmtPoints(totals.toWin)} wins the cup</span>
      </div>
    </div>`;

  // ---- projected winner: once every team-event round is set and play is on ----
  const cupSessions = state.sessions.filter((s) => sessionCounts(s));
  const anyLiveCup = cupSessions.some((s) => sessionStatus(s) === 'in-play');
  const allCupSet = cupSessions.every((s) => sessionStatus(s) !== 'not-set');
  let projection = '';
  if (anyLiveCup && allCupSet && totals.settled < totals.available) {
    const hi = Math.max(totals.team1, totals.team2);
    const tied = totals.team1 === totals.team2;
    const tbNow = tied ? stablefordTiebreak(state) : null;
    const t1Lead = tied ? tbNow.leader === 'L' : totals.team1 > totals.team2;
    const tieNoLeader = tied && !tbNow.leader;
    const name = tieNoLeader ? 'Level — stableford decides' : t1Lead ? state.teamOneName : state.teamTwoName;
    const color = tieNoLeader ? 'var(--ink)' : t1Lead ? 'var(--accent)' : 'var(--team2-text)';
    const need = tied
      ? `Level on points, so net stableford breaks the tie (${nick1} ${tbNow.sums.total.L} – ${tbNow.sums.total.T} ${nick2}).`
      : hi >= totals.toWin ? `${fmtPoints(totals.toWin)} wins the cup.` : `Still ${fmtPoints(totals.toWin - hi)} short of the ${fmtPoints(totals.toWin)} needed.`;
    projection = `
    <div style="margin:14px 20px 0;background:var(--row-alt);border-radius:12px;padding:14px 16px">
      <div style="font-size:13px;color:var(--muted)">${tieNoLeader ? 'Projected result' : 'Projected winner'}</div>
      <div style="font-size:19px;font-weight:800;letter-spacing:-.01em;color:${color};margin-top:2px">${esc(name)}</div>
      <div style="font-size:13px;line-height:1.45;color:var(--muted);margin-top:3px">${need} Live matches can still swing.</div>
    </div>`;
  }

  // ---- your match ----
  const me = state.ui.me;
  const all = allMatches(state);
  const mineAll = me ? all.filter((e) => !e.match.submitted && e.match.sideA.concat(e.match.sideB).includes(me)) : [];
  const mine = mineAll.find((e) => e.results.length && !matchComplete(e.match, e.course))
    || mineAll.find((e) => !matchComplete(e.match, e.course)) || mineAll[0] || null;
  let mineBlock = '';
  if (mine) {
    const { session, course, match, results } = mine;
    const lbl = matchStateLabel(results, course.holes.length, sideShortLabel(state, session, match.sideA), sideShortLabel(state, session, match.sideB), maxPerHole(match.format));
    const done = matchComplete(match, course);
    const next = Math.min(course.holes.length, results.length + 1);
    mineBlock = `
    <div style="margin:18px 20px 0;border:3px solid var(--accent);border-radius:18px;padding:16px 16px 18px;background:var(--bg)">
      <div style="font-size:13px;font-weight:800;color:var(--accent)">Your match &middot; ${esc(course.name)}</div>
      <div style="font-size:22px;font-weight:800;letter-spacing:-.01em;line-height:1.2;margin-top:4px">${esc(playerNames(match.sideA))} <span style="color:var(--muted);font-weight:600">vs</span> ${esc(playerNames(match.sideB))}</div>
      <div style="font-size:30px;font-weight:800;letter-spacing:-.02em;margin-top:8px;color:${results.length ? lbl.color : 'var(--muted)'}">${esc(results.length ? lbl.text : 'Not started')}</div>
      <div style="font-size:15px;color:var(--muted);font-weight:600">${results.length ? `Through ${results.length} hole${results.length === 1 ? '' : 's'}` : 'Ready to tee off'}</div>
      <button data-action="open-card" data-match="${match.id}" class="btn btn-primary btn-block" style="margin-top:14px;padding:16px;font-size:18px">${done ? 'Submit final score' : results.length ? `Score hole ${next}` : 'Start scoring'}</button>
    </div>`;
  }

  // ---- net stableford over the singles: its own section ----
  const sbCup = stablefordTiebreak(state);
  let stablefordBlock = '';
  if (sbCup.started) {
    const lines = [];
    state.sessions.forEach((session) => {
      if (!sessionCounts(session) || session.shape !== 'singles') return;
      session.matches.forEach((m) => {
        const a = m.sideA[0], b = m.sideB[0];
        const ra = ownStableford(a, session, m), rb = ownStableford(b, session, m);
        lines.push({ a, b, pa: ra.total, pb: rb.total, thru: Math.min(ra.holes, rb.holes) });
      });
    });
    const rows = lines.map((l) => `
      <div style="display:flex;align-items:baseline;padding:9px 0;border-top:1px solid var(--rule-faint)">
        <div style="flex:1;font-size:15px;font-weight:${l.pa > l.pb ? 800 : 500}">${esc(PLAYERS_BY_ID[l.a].name)} <span style="font-variant-numeric:tabular-nums">${l.pa}</span></div>
        <div style="font-size:12px;color:var(--muted);padding:0 8px">thru ${l.thru}</div>
        <div style="flex:1;font-size:15px;text-align:right;font-weight:${l.pb > l.pa ? 800 : 500}"><span style="font-variant-numeric:tabular-nums">${l.pb}</span> ${esc(PLAYERS_BY_ID[l.b].name)}</div>
      </div>`).join('');
    stablefordBlock = `
    ${sectionTitle('Net stableford &middot; singles', 'tiebreaker')}
    <div style="margin:0 20px;background:var(--row-alt);border-radius:12px;padding:14px 16px">
      <div style="display:flex;justify-content:space-between;align-items:flex-end">
        <div><div style="font-size:13px;color:var(--muted)">${nick1}</div><div style="font-size:40px;font-weight:800;line-height:1;letter-spacing:-.03em;color:var(--accent)">${sbCup.sums.total.L}</div></div>
        <div style="text-align:right"><div style="font-size:13px;color:var(--muted)">${nick2}</div><div style="font-size:40px;font-weight:800;line-height:1;letter-spacing:-.03em;color:var(--team2)">${sbCup.sums.total.T}</div></div>
      </div>
      <div style="font-size:13px;line-height:1.45;color:var(--muted);margin:8px 0 6px">Only used if the cup ends 12&ndash;12. ${sbCup.complete ? 'All singles scores are in.' : `${sbCup.played} of ${sbCup.needed} holes scored.`}</div>
      ${rows}
    </div>`;
  }

  // ---- finished matches waiting to be submitted ----
  const waiting = unsubmittedMatches(state).filter((w) => !mine || w.match.id !== mine.match.id);
  const submitBlock = waiting.length ? `
    ${sectionTitle('Needs submitting', `${waiting.length} finished`)}
    <div style="margin:0 20px;background:var(--row-alt);border-radius:12px;padding:4px 16px">
      ${waiting.map(({ match }, i) => `
      <button data-action="open-card" data-match="${match.id}" style="display:flex;width:100%;justify-content:space-between;align-items:center;gap:10px;text-align:left;border:0;${i ? 'border-top:1px solid var(--rule-faint);' : ''}background:transparent;padding:13px 0">
        <span style="font-size:15px;font-weight:700">${esc(playerNames(match.sideA))} v ${esc(playerNames(match.sideB))}</span>
        <span style="font-size:14px;font-weight:800;color:var(--accent);white-space:nowrap">Submit &rarr;</span>
      </button>`).join('')}
    </div>` : '';

  // ---- the other matches ----
  const others = all.filter(({ label, match }) => !label.done && label.text !== 'Not started' && !match.submitted && (!mine || match.id !== mine.match.id));
  const otherRows = others.map(({ session, course, match, results }) => {
    const lbl = matchStateLabel(results, course.holes.length, sideShortLabel(state, session, match.sideA), sideShortLabel(state, session, match.sideB), maxPerHole(match.format));
    const bets = lbl.segments.map((s) => `${s.label.replace(' 9', '')} ${s.text}`).join(' · ');
    return `
    <button data-action="open-card" data-match="${match.id}" style="display:block;width:100%;text-align:left;border:0;border-bottom:1px solid var(--rule-soft);background:transparent;padding:14px 20px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">
        <div style="font-size:17px;font-weight:700">${esc(playerNames(match.sideA))}</div>
        <div style="font-size:16px;font-weight:800;color:${lbl.color};white-space:nowrap">${esc(lbl.text)}</div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-top:1px">
        <div style="font-size:15px;color:var(--muted);font-weight:500">${esc(playerNames(match.sideB))}</div>
        <div style="font-size:13px;color:var(--muted)">thru ${results.length}</div>
      </div>
      <div style="height:4px;background:var(--rule-soft);border-radius:2px;margin-top:10px;overflow:hidden"><div style="width:${Math.round(results.length / course.holes.length * 100)}%;height:100%;background:var(--accent);border-radius:2px"></div></div>
      <div style="font-size:12px;color:var(--muted);margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(bets)}</div>
    </button>`;
  }).join('');
  const onCourse = (mine || others.length)
    ? `${sectionTitle(mine ? 'Also on the course' : 'On the course')}${otherRows || `<div style="padding:0 20px 8px;font-size:14px;color:var(--muted)">No other matches right now.</div>`}`
    : `${sectionTitle('On the course')}<div style="padding:0 20px 8px;font-size:14px;color:var(--muted)">Nothing live right now.</div>`;

  // ---- the rounds ----
  const sessionRows = state.sessions.map((session) => {
    const course = courseFor(session);
    const status = sessionStatus(session);
    const game = gameFor(session);
    const counts = sessionCounts(session);
    let result = '—', resColor = 'var(--muted)';
    if (status === 'final') {
      const pts = sessionPoints(session);
      result = counts ? `${fmtPoints(pts.team1)} – ${fmtPoints(pts.team2)}` : 'Final';
      resColor = counts ? 'var(--accent)' : 'var(--muted)';
    } else if (status === 'in-play') { result = 'Live'; resColor = counts ? 'var(--accent)' : 'var(--ink)'; }
    const fmt = `${game.name} · ${counts ? sessionPointValue(session) + ' pts' : 'no team pts'}`;
    return `
    <button data-action="${status === 'not-set' ? 'open-setup' : 'open-rounds'}" data-session="${session.id}" style="display:flex;width:100%;gap:12px;align-items:center;text-align:left;border:0;border-bottom:1px solid var(--rule-soft);background:transparent;padding:13px 20px">
      <div style="flex:1;min-width:0">
        <div style="font-size:16px;font-weight:700">${esc(course.name)}</div>
        <div style="font-size:13px;color:var(--muted)">${esc(fmt)}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:16px;font-weight:800;color:${resColor}">${esc(result)}</div>
        <div style="font-size:13px;color:var(--muted)">${esc(session.day)}</div>
      </div>
    </button>`;
  }).join('');

  return `
  <div style="display:flex;flex-direction:column">
    ${scoreBlock}
    ${projection}
    ${mineBlock}
    ${stablefordBlock}
    ${submitBlock}
    ${onCourse}
    ${sectionTitle('Rounds')}
    ${sessionRows}
    <button data-action="go-screen" data-screen="trophy" class="btn btn-secondary btn-block" style="margin:18px 20px 26px;width:calc(100% - 40px)">Cup projection &amp; awards &rarr;</button>
  </div>`;
}

// ---------- Rounds ----------
function renderRounds(state) {
  return `<div style="padding:0 16px">${state.sessions.map((session) => {
    const course = courseFor(session);
    const status = sessionStatus(session);
    const game = gameFor(session);
    const counts = sessionCounts(session);
    const statusLabel = { 'final': 'Final', 'in-play': 'In play', 'not-set': 'Not set' }[status];
    const fmtLine = `${game.name}${session.shape === 'team' ? ', 2v2' : ', singles'} · Nassau · ${counts ? sessionPointValue(session) + ' points' : 'no team points'} · ${session.tee}`;

    let matchRows;
    if (session.matches.length === 0) {
      matchRows = `<div style="display:flex;gap:10px;align-items:center;border-top:1px solid var(--rule);padding:9px 0">
        <div style="flex:1;min-width:0;font-size:13px;font-weight:800;color:var(--muted)">Pairings open</div>
      </div>`;
    } else {
      matchRows = session.matches.map((m) => {
        const results = computeHoleResults(m, course.holes);
        const label = matchStateLabel(results, course.holes.length, sideShortLabel(state, session, m.sideA), sideShortLabel(state, session, m.sideB), maxPerHole(m.format));
        const complete = matchComplete(m, course);
        const showScore = !m.submitted;
        const btnText = complete ? 'Submit' : 'Score';
        return `
        <div style="display:flex;gap:10px;align-items:center;border-top:1px solid var(--rule);padding:9px 0">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:800">${esc(playerNames(m.sideA))}</div>
            <div style="font-size:13px;font-weight:800;color:rgba(10,16,48,.7)">${esc(playerNames(m.sideB))}</div>
          </div>
          <div style="font-size:12px;font-weight:800;color:${label.color};text-align:right;white-space:nowrap">${esc(label.text)}${(label.done || results.length === 0) ? '' : ` · ${results.length}`}</div>
          ${m.submitted
            ? `<button data-action="open-card" data-match="${m.id}" style="border:0;background:transparent;color:var(--muted);font-weight:800;font-size:10px;letter-spacing:.08em;text-transform:uppercase;padding:6px 4px">&check; Submitted</button>`
            : `<button data-action="open-card" data-match="${m.id}" style="display:${showScore ? 'inline-block' : 'none'};border:1px solid var(--accent);background:${complete ? 'var(--accent)' : 'transparent'};color:${complete ? '#fff' : 'var(--accent)'};font-weight:800;font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:6px 9px">${btnText}</button>`}
        </div>
        ${results.length ? `<div style="margin:-2px 0 9px">${nassauChips(label.segments)}</div>` : ''}`;
      }).join('');
    }

    // Wolf (a side game played within a foursome) is offered at Tobacco Road
    // once the foursomes are set.
    const wolfButtons = (course.id === 'tobacco-road' && session.matches.length)
      ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--rule-soft)">
          <div style="font-size:13px;font-weight:700;margin-bottom:6px">Want to play Wolf? <span style="color:var(--muted);font-weight:500">A side game for each foursome.</span></div>
          ${session.matches.map((m) => `<button data-action="wolf-start" data-session="${session.id}" data-match="${m.id}" class="btn btn-secondary btn-block" style="margin-bottom:6px;text-align:left;padding:11px 12px;font-size:13px">Wolf: ${esc(playerNames(m.sideA.concat(m.sideB)).replace(/ & /g, ', '))}</button>`).join('')}
        </div>` : '';

    // Each course is its own card with a coloured header, so the four rounds
    // read as four separate things instead of one long list.
    const headBg = status === 'in-play' ? 'var(--accent)' : status === 'final' ? '#3b4157' : '#7b8196';
    return `
    <div style="margin:16px 0 0;background:#fff;border:1px solid var(--rule);border-radius:18px;overflow:hidden;box-shadow:0 1px 3px rgba(10,16,48,.08),0 6px 16px rgba(10,16,48,.05)">
      <div style="background:${headBg};color:#fff;padding:14px 16px 14px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <div style="font-size:13px;font-weight:700;opacity:.9">Session ${session.n} &middot; ${esc(session.day)}</div>
          <div style="font-size:12px;font-weight:800;background:rgba(255,255,255,.2);border-radius:999px;padding:3px 10px">${statusLabel}</div>
        </div>
        <div style="font-size:26px;font-weight:800;letter-spacing:-.02em;line-height:1.1;margin-top:6px">${esc(course.name)}</div>
        <div style="font-size:13px;opacity:.85;margin-top:3px">${esc(fmtLine)}</div>
      </div>
      <div style="padding:6px 16px 16px">
      ${matchRows}
      ${wolfButtons}
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
        <button data-action="open-setup" data-session="${session.id}" style="border:1px solid var(--rule);background:transparent;font-weight:800;font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:7px 10px;color:var(--ink)">Edit format &amp; pairings</button>
        ${session.matches.length ? (() => {
          const nPhotos = photosFor(state, session.id).length, vs = verifyStatus(session);
          const tag = vs === 'ok' ? ' &middot; &check; verified' : vs === 'stale' ? ' &middot; changed since verified' : '';
          return `<button data-action="open-verify" data-session="${session.id}" style="border:1px solid var(--accent);background:${vs === 'ok' ? 'var(--accent)' : 'transparent'};color:${vs === 'ok' ? '#fff' : 'var(--accent)'};font-weight:800;font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:7px 10px">Scorecards &amp; verify &middot; ${nPhotos} photo${nPhotos === 1 ? '' : 's'}${tag}</button>`;
        })() : ''}
      </div>
      </div>
    </div>`;
  }).join('')}<div style="height:24px"></div></div>`;
}

// A claw hammer drawn in SVG (no emoji, so it takes the team colors and looks
// the same on every phone).
const HAMMER_ICON = '<svg class="hammer-ico" viewBox="0 0 32 32" aria-hidden="true"><g fill="currentColor"><rect x="14.2" y="9" width="4.6" height="22" rx="1.4"/><path d="M8 5h15a2.4 2.4 0 0 1 2.4 2.4v3.2A2.4 2.4 0 0 1 23 13H8z"/><path d="M8 5 2 3v12l6-2z"/></g></svg>';

// ---------- Verify (scorecard photos vs. scores in the app) ----------
function renderScoreTable(state, session, course, match) {
  const n = course.holes.length, half = Math.ceil(n / 2);
  const results = computeHoleResults(match, course.holes);
  const ids = match.sideA.concat(match.sideB);
  const lbl = matchStateLabel(results, n, sideShortLabel(state, session, match.sideA), sideShortLabel(state, session, match.sideB), maxPerHole(match.format));
  const cols = [];
  for (let i = 0; i < half; i++) cols.push({ hole: i });
  cols.push({ sum: 'OUT', from: 0, to: half });
  for (let i = half; i < n; i++) cols.push({ hole: i });
  cols.push({ sum: 'IN', from: half, to: n });
  cols.push({ sum: 'TOT', from: 0, to: n });

  const cell = 'min-width:30px;height:32px;padding:0;text-align:center;font-size:13px;font-weight:700;border:0;border-bottom:1px solid var(--rule-faint);background:transparent;color:var(--ink)';
  const sticky = 'position:sticky;left:0;z-index:1;background:var(--bg);text-align:left;padding:0 8px;min-width:78px;white-space:nowrap;border-right:1px solid var(--rule)';
  const sumCss = 'background:var(--row-alt);font-weight:800';
  const grossOf = (id, h) => (match.grossScores[id] ? match.grossScores[id][course.holes[h].n] : undefined);
  const sumOf = (id, from, to) => { let t = 0, any = false; for (let h = from; h < to; h++) { const g = grossOf(id, h); if (g != null) { t += g; any = true; } } return any ? t : null; };
  const parSum = (from, to) => course.holes.slice(from, to).reduce((a, h) => a + h.par, 0);

  const headRow = `<tr><td style="${cell};${sticky};font-size:9px;letter-spacing:.1em;color:var(--muted)">HOLE</td>${cols.map((c) => c.sum
    ? `<td style="${cell};${sumCss};font-size:10px">${c.sum}</td>`
    : `<td style="${cell};padding:0"><button data-action="fix-hole" data-match="${match.id}" data-idx="${c.hole}" style="${cell};width:100%;border:0;font-size:11px;color:var(--muted)">${c.hole + 1}</button></td>`).join('')}</tr>`;
  const parRow = `<tr><td style="${cell};${sticky};font-size:9px;letter-spacing:.1em;color:var(--muted)">PAR</td>${cols.map((c) => c.sum
    ? `<td style="${cell};${sumCss};font-size:11px">${parSum(c.from, c.to)}</td>`
    : `<td style="${cell};font-size:11px;color:var(--muted)">${course.holes[c.hole].par}</td>`).join('')}</tr>`;
  const playerRows = ids.map((id) => {
    const p = PLAYERS_BY_ID[id];
    return `<tr><td style="${cell};${sticky}"><span style="display:inline-block;width:8px;height:8px;margin-right:6px;background:${p.team === 'L' ? 'var(--accent)' : 'var(--team2)'}"></span>${p.name}</td>${cols.map((c) => {
      if (c.sum) { const t = sumOf(id, c.from, c.to); return `<td style="${cell};${sumCss}">${t == null ? '–' : t}</td>`; }
      const g = grossOf(id, c.hole);
      return `<td style="${cell};padding:0"><button data-action="fix-hole" data-match="${match.id}" data-idx="${c.hole}" style="${cell};width:100%;${g == null ? 'color:var(--muted)' : ''}">${g == null ? '–' : g}</button></td>`;
    }).join('')}</tr>`;
  }).join('');
  const resultRow = `<tr><td style="${cell};${sticky};font-size:9px;letter-spacing:.1em;color:var(--muted)">HOLE WON</td>${cols.map((c) => c.sum
    ? `<td style="${cell};${sumCss}"></td>`
    : `<td style="${cell}"><div style="width:14px;height:14px;margin:0 auto;background:${c.hole < results.length ? holeFill(results[c.hole]) : 'var(--rule-faint)'}"></div></td>`).join('')}</tr>`;

  return `
  <div style="padding:14px 18px 4px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:6px">
      <div style="font-size:13px;font-weight:800;min-width:0">${esc(playerNames(match.sideA))} <span style="color:var(--muted)">v</span> ${esc(playerNames(match.sideB))}</div>
      <div style="font-size:12px;font-weight:800;color:${lbl.color};white-space:nowrap">${esc(lbl.text)}</div>
    </div>
    <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--rule)">
      <table style="border-collapse:collapse;width:max-content;min-width:100%">${headRow}${parRow}${playerRows}${resultRow}</table>
    </div>
  </div>`;
}

function renderVerify(state) {
  const session = findSession(state.ui.verifySessionId);
  const course = courseFor(session);
  const photos = photosFor(state, session.id);
  const status = verifyStatus(session);
  const v = session.verified;

  const addTile = `<label style="aspect-ratio:1;display:flex;align-items:center;justify-content:center;text-align:center;border:1px dashed var(--accent);font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);padding:6px;cursor:pointer">+ Add photo<input type="file" accept="image/*" multiple data-action="photo-file" data-session="${session.id}" style="display:none"></label>`;
  const thumbs = photos.map((p) => `
    <button data-action="view-photo" data-photo="${p.id}" style="padding:0;border:1px solid var(--rule);background:#fff;aspect-ratio:1;overflow:hidden;position:relative">
      <img src="${p.thumb}" alt="Scorecard photo" style="width:100%;height:100%;object-fit:cover;display:block">
      <span style="position:absolute;left:0;right:0;bottom:0;background:rgba(10,16,48,.78);color:#fff;font-size:9px;font-weight:800;padding:3px 4px;text-align:left">${esc(p.by)} &middot; ${timeAgo(p.ts)}</span>
    </button>`).join('');

  let statusBox;
  if (status === 'ok') {
    statusBox = `<div style="background:var(--accent);color:#fff;padding:12px 14px"><div style="font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;opacity:.8">Verified</div><div style="font-size:15px;font-weight:800;margin-top:2px">&check; ${esc(v.by)} checked these scores against the scorecards &middot; ${timeAgo(v.ts)}</div></div>`;
  } else if (status === 'stale') {
    statusBox = `<div style="border:2px solid var(--accent);padding:12px 14px"><div style="font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)">Scores changed since verified</div><div style="font-size:13px;line-height:1.45;margin-top:3px">${esc(v.by)} verified an earlier version. Check the scores below against the cards again.</div></div>`;
  } else {
    statusBox = `<div style="border:1px solid var(--rule);padding:12px 14px"><div style="font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)">Not verified yet</div><div style="font-size:13px;line-height:1.45;margin-top:3px">Add a photo of each paper card, compare it with the scores below, fix anything that's off (tap a score), then confirm.</div></div>`;
  }
  const verifyBtn = status === 'ok'
    ? `<button data-action="clear-verified" data-session="${session.id}" class="btn btn-secondary btn-block">Undo verification</button>`
    : `<button data-action="mark-verified" data-session="${session.id}" class="btn btn-primary btn-block">The scores match the paper cards</button>`;

  return `
  <div>
    <div style="padding:14px 18px 6px;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)">Scorecard photos &middot; ${photos.length}</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:0 18px 12px">${thumbs}${addTile}</div>
    <div style="padding:0 18px 12px;font-size:12px;line-height:1.45;color:var(--muted)">Photos are shrunk to a few hundred KB. Tap one to open it full screen and zoom.</div>
    <div style="border-top:2px solid var(--rule);padding:14px 18px 6px;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)">Scores in the app &middot; ${esc(course.name)} (tap a score to fix it)</div>
    ${session.matches.map((m) => renderScoreTable(state, session, course, m)).join('')}
    <div style="border-top:2px solid var(--rule);margin-top:12px;padding:14px 18px 28px;display:flex;flex-direction:column;gap:10px">${statusBox}${verifyBtn}</div>
  </div>`;
}

function renderPhotoViewer(state) {
  const id = state.ui.viewPhotoId;
  if (!id) return '';
  const p = state.photos.find((x) => x.id === id);
  if (!p) return '';
  const full = PhotoCache[id];
  const z = state.ui.photoZoom || 1;
  const btn = 'border:1px solid rgba(255,255,255,.5);background:transparent;color:#fff;font-weight:800;font-size:13px;min-width:38px;height:34px;padding:0 10px';
  return `
  <div class="photo-view">
    <div class="photo-bar">
      <div style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.by)} &middot; ${timeAgo(p.ts)}</div>
      <div style="display:flex;gap:6px;flex:none">
        <button data-action="photo-zoom" data-delta="-1" style="${btn}">&minus;</button>
        <button data-action="photo-zoom" data-delta="1" style="${btn}">+</button>
        <button data-action="remove-photo" data-photo="${id}" style="${btn}">Delete</button>
        <button data-action="close-photo" style="${btn};background:#fff;color:var(--ink)">Close</button>
      </div>
    </div>
    <div class="photo-scroll">${full
      ? `<img src="${full}" alt="Scorecard photo" style="display:block;max-width:none;width:${z * 100}%;height:auto">`
      : `<div style="color:#fff;padding:40px 24px;font-size:14px;line-height:1.5">Loading the full-size photo&hellip;<br><span style="opacity:.7;font-size:12px">If it never appears, it was added on another phone and this phone has no signal right now.</span></div>`}</div>
  </div>`;
}

// ---------- Setup ----------
function renderSetup(state) {
  const session = findSession(state.ui.setupSessionId);
  const game = gameFor(session);
  const counts = sessionCounts(session);
  const pairings = pairingsFromOrders(session.shape, session.teamLOrder, session.teamTOrder);

  const courseBtns = COURSES.map((c, i) => {
    const on = c.id === session.courseId;
    const isLastOdd = COURSES.length % 2 === 1 && i === COURSES.length - 1;
    return `<button data-action="pick-course" data-session="${session.id}" data-course="${c.id}" style="grid-column:${isLastOdd ? '1 / -1' : 'auto'};border:0;background:${on ? 'var(--accent)' : 'var(--bg)'};color:${on ? '#fff' : 'var(--ink)'};font-weight:800;font-size:12px;text-align:left;padding:11px 10px">${esc(c.name)}</button>`;
  }).join('');

  const shapeBtns = [{ id: 'team', name: 'Team · 2v2' }, { id: 'singles', name: 'Singles · 1v1' }].map((s) => {
    const on = session.shape === s.id;
    return `<button data-action="pick-shape" data-session="${session.id}" data-shape="${s.id}" style="flex:1;border:0;background:${on ? 'var(--accent)' : 'var(--bg)'};color:${on ? '#fff' : 'var(--ink)'};font-weight:800;font-size:12px;padding:11px 8px;text-align:left">${s.name}</button>`;
  }).join('');

  const gameBtns = gamesForCourse(session.courseId, game.shape).map((g) => {
    const on = g.id === session.format;
    return `<button data-action="pick-game" data-session="${session.id}" data-game="${g.id}" style="border:0;background:${on ? 'var(--accent)' : 'var(--bg)'};color:${on ? '#fff' : 'var(--ink)'};text-align:left;padding:10px;display:flex;justify-content:space-between;align-items:baseline;gap:8px">
      <span style="font-weight:800;font-size:12px">${g.name}</span><span style="font-size:10px;opacity:.65">${g.note}</span>
    </button>`;
  }).join('');

  const course = courseFor(session);
  const curTee = teeFor(session);
  const teeOpts = course.tees.map((t) => {
    const yds = t.total ? ` · ${t.total.toLocaleString()} yds` : '';
    return `<option value="${t.id}"${t.id === curTee.id ? ' selected' : ''}>${esc(t.name)} · ${t.rating}/${t.slope}${yds}</option>`;
  }).join('');
  const teePicker = `
    <div>
      <div style="font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:7px">Tees</div>
      <select data-action="set-tee" data-session="${session.id}" class="field-input" style="padding:11px 10px;font-weight:800">${teeOpts}</select>
      <div style="font-size:12px;line-height:1.45;color:rgba(10,16,48,.7);margin-top:7px">Shown as rating/slope. Par ${course.par}. Each player's course handicap is worked out from their Handicap Index for these tees.</div>
    </div>`;

  const countsBtns = [{ v: true, name: 'Counts' }, { v: false, name: 'Doesn’t count' }].map((o) => {
    const on = counts === o.v;
    return `<button data-action="${on ? 'noop' : 'toggle-counts'}" data-session="${session.id}" style="flex:1;border:0;background:${on ? 'var(--accent)' : 'var(--bg)'};color:${on ? '#fff' : 'var(--ink)'};font-weight:800;font-size:12px;padding:11px 8px;text-align:left">${o.name}</button>`;
  }).join('');
  const matchCount = session.shape === 'singles' ? 4 : 2;
  const teamEvent = `
    <div>
      <div style="font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:7px">Team event</div>
      <div style="display:flex;background:var(--rule);gap:1px;border:1px solid var(--rule)">${countsBtns}</div>
      <div style="font-size:12px;line-height:1.5;color:rgba(10,16,48,.7);margin-top:7px">${counts
        ? `Nassau: front, back and overall are 1 point each. ${matchCount} matches &times; 3 = <strong>${matchCount * 3} points</strong> on offer.`
        : 'Still played as a Nassau, but none of it counts toward the Hawks Cup points.'}</div>
    </div>
    <div>
      <div style="font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:7px">Handicap</div>
      <div style="border:1px solid var(--rule);padding:9px 10px;font-size:12px;font-weight:800">Course handicap (index &times; slope &divide; 113 + rating &minus; par), max ${MAX_HCP} &middot; ${session.shape === 'singles' ? 'full difference' : '90%, strokes off the low player'}</div>
    </div>`;

  // One dropdown per player slot. Slot k of a team's order is who plays in
  // that position; choosing someone already placed swaps the two.
  const perSide = session.shape === 'singles' ? 1 : 2;
  const slotSelect = (team, slot) => {
    const order = team === 'L' ? session.teamLOrder : session.teamTOrder;
    const roster = PLAYERS.filter((p) => p.team === team);
    const opts = roster.map((p) => `<option value="${p.id}"${p.id === order[slot] ? ' selected' : ''}>${p.name} (CH ${Math.min(courseHandicapFor(p.id, session), MAX_HCP)})</option>`).join('');
    return `<select data-action="set-slot" data-session="${session.id}" data-team="${team}" data-slot="${slot}" class="field-input" style="padding:9px 8px;border-left:4px solid ${team === 'L' ? 'var(--accent)' : 'var(--team2)'}">${opts}</select>`;
  };
  const sideCol = (team, matchIdx) => Array.from({ length: perSide }, (_, k) => slotSelect(team, matchIdx * perSide + k)).join('');
  const pairRows = pairings.map((p, i) => `
    <div style="padding:10px;border-bottom:1px solid var(--rule)">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
        <div style="font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Match ${i + 1}</div>
        <div style="font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);text-align:right">${esc(pairingStrokesNote(p.sideA, p.sideB, session))}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center">
        <div style="display:flex;flex-direction:column;gap:6px">${sideCol('L', i)}</div>
        <div style="font-size:10px;font-weight:800;letter-spacing:.1em;color:rgba(10,16,48,.35)">V</div>
        <div style="display:flex;flex-direction:column;gap:6px">${sideCol('T', i)}</div>
      </div>
    </div>`).join('');
  const hasScores = session.matches.some((m) => Object.keys(m.grossScores).some((id) => Object.keys(m.grossScores[id]).length));

  // Singles: who is in each foursome (the four people who actually walk the
  // course together). Closest to the pin pays out within the foursome.
  let groupBlock = '';
  if (session.shape === 'singles') {
    const groups = sessionGroups(session);
    const pick = state.ui.groupPick && state.ui.groupPick.sessionId === session.id ? state.ui.groupPick.playerId : null;
    const pairs = pairingsFromOrders('singles', session.teamLOrder, session.teamTOrder);
    const box = (g, i) => `
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:800;margin-bottom:6px">Foursome ${i + 1}</div>
        <div style="display:flex;flex-direction:column;gap:1px;background:var(--rule);border:1px solid var(--rule)">${pairs.filter((p) => g.includes(p.sideA[0])).map((p) => {
          const a = PLAYERS_BY_ID[p.sideA[0]], b = PLAYERS_BY_ID[p.sideB[0]], on = pick === a.id || pick === b.id;
          return `<button data-action="group-pick" data-session="${session.id}" data-player="${a.id}" style="border:0;background:${on ? 'var(--accent)' : 'var(--bg)'};color:${on ? '#fff' : 'var(--ink)'};font-weight:800;font-size:14px;padding:12px 10px;text-align:left;line-height:1.4">${esc(a.name)}<br><span style="font-weight:600;opacity:.75;font-size:12px">vs</span> ${esc(b.name)}</button>`;
        }).join('')}</div>
      </div>`;
    groupBlock = `
    <div>
      <div style="font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:4px">Foursomes &mdash; who plays together</div>
      <div style="font-size:13px;line-height:1.45;color:rgba(10,16,48,.7);margin-bottom:8px">These are the two groups of four on the course. Each foursome is two matches, and closest to the pin pays out within it. To change it, tap a match, then tap a match in the other foursome to swap them. (To change who plays whom, use the match slots above.)</div>
      <div style="display:flex;gap:10px">${groups.map(box).join('')}</div>
    </div>`;
  }

  return `
  <div style="padding:16px 18px 30px;display:flex;flex-direction:column;gap:16px">
    <div>
      <div style="font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:7px">Course</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--rule);border:1px solid var(--rule)">${courseBtns}</div>
    </div>
    <div>
      <div style="font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:7px">Shape</div>
      <div style="display:flex;background:var(--rule);gap:1px;border:1px solid var(--rule)">${shapeBtns}</div>
    </div>
    <div>
      <div style="font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:7px">Game</div>
      <div style="display:flex;flex-direction:column;gap:1px;background:var(--rule);border:1px solid var(--rule)">${gameBtns}</div>
    </div>
    ${teePicker}
    ${teamEvent}
    <div>
      <div style="font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:4px">Who plays whom &mdash; ${session.shape === 'singles' ? '4 singles matches' : pairings.length + ' matches'}</div>
      <div style="font-size:12px;line-height:1.45;color:rgba(10,16,48,.7);margin-bottom:8px">${esc(state.teamOneName)} on the left, ${esc(state.teamTwoName)} on the right. Tap a name to change it &mdash; picking someone already in another match swaps the two. (CH = course handicap on these tees.)</div>
      <div style="border:1px solid var(--rule)">${pairRows}</div>
    </div>
    ${groupBlock}
    ${hasScores ? `<div style="border:1px solid var(--accent);padding:10px;font-size:12px;line-height:1.45"><strong style="color:var(--accent)">Scores already entered.</strong> Locking in again replaces this round's matches and clears its scores.</div>` : ''}
    <button data-action="lock-in" data-session="${session.id}" class="btn btn-primary btn-block">${session.locked ? 'Lock in again' : 'Lock in session'}</button>
  </div>`;
}

// ---------- Card ----------
function renderCard(state) {
  const match = matchById(state.ui.cardMatchId);
  const session = sessionForMatch(state.ui.cardMatchId);
  const course = courseFor(session);
  const view = cardView(state, match, course);
  const hole = view.hole;
  const committedResults = view.results;
  const shortA = playerNames(match.sideA), shortB = playerNames(match.sideB);
  const nickA = sideShortLabel(state, session, match.sideA), nickB = sideShortLabel(state, session, match.sideB);
  const headerLabel = matchStateLabel(committedResults, course.holes.length, nickA, nickB, maxPerHole(match.format));

  const ids = match.sideA.concat(match.sideB);
  const strokes = handicapAllocation(ids, session);
  const cardTee = teeFor(session);
  const holeYds = cardTee.yards ? cardTee.yards[hole.n - 1] : null;
  const nets = {};
  ids.forEach((id) => { nets[id] = netScore(view.gross[id], strokes[id], hole.si); });
  const bd = holeBreakdown(match, hole, view.gross);
  const hammerNow = hammerOutcome(view.hammer);
  const holeDelta = applyHammer(bd.result, view.hammer);
  const winner = holeDelta > 0 ? nickA : nickB;
  let holeResultText;
  if (match.format === 'lowhigh') {
    const detail = `low ${bd.lowA}–${bd.lowB}, high ${bd.highA}–${bd.highB}`;
    holeResultText = holeDelta === 0 ? `Halved · ${detail}` : `${winner} +${Math.abs(holeDelta)} · ${detail}`;
  } else if (holeDelta === 0) {
    holeResultText = `Halved in ${bd.lowA}`;
  } else {
    holeResultText = holeDelta > 0 ? `${nickA} win ${bd.lowA} to ${bd.lowB}` : `${nickB} win ${bd.lowB} to ${bd.lowA}`;
  }
  if (hammerNow.folded) holeResultText = `${hammerNow.folded === 'A' ? nickA : nickB} win the hole (fold) ×${hammerNow.mult}`;
  else if (hammerNow.mult > 1) holeResultText += ` ×${hammerNow.mult}`;
  const holeResultColor = holeDelta > 0 ? 'var(--accent)' : holeDelta < 0 ? 'var(--team2-text)' : 'rgba(10,16,48,.6)';

  const cardHoles = course.holes.map((h, i) => {
    let fill;
    if (i < committedResults.length) fill = holeFill(committedResults[i]);
    else if (i === view.holeIdx) fill = holeFill(holeDelta);
    else fill = 'var(--rule-faint)';
    const ring = i === view.holeIdx ? '2px solid var(--accent)' : 'none';
    return `<button data-action="go-to-hole" data-match="${match.id}" data-idx="${i}" style="flex:1;border:0;padding:0;background:transparent">
      <div style="height:20px;background:${fill};outline:${ring};outline-offset:-2px"></div>
      <div style="font-size:7px;font-weight:800;color:rgba(10,16,48,.45);margin-top:2px">${h.n}</div>
    </button>`;
  }).join('');

  const entryRows = ids.map((id) => {
    const p = PLAYERS_BY_ID[id];
    const shots = shotsOnHole(strokes[id], hole.si);
    const net = nets[id];
    return `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 18px;border-bottom:1px solid var(--rule);background:${p.team === 'L' ? 'transparent' : 'rgba(10,16,48,.04)'}">
      <div style="width:9px;height:9px;flex:none;background:${p.team === 'L' ? 'var(--accent)' : 'var(--team2)'}"></div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:5px">
          <span style="font-size:14px;font-weight:800">${p.name}</span>
          <span style="font-size:11px;font-weight:800;color:var(--accent)">${shots === 0 ? '' : shots === 1 ? '•' : '••'}</span>
        </div>
        <div style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Idx ${p.hcp} · CH ${Math.min(courseHandicapFor(id, session), MAX_HCP)} · plays off ${strokes[id]} · net ${net}</div>
      </div>
      <div style="display:flex;border:1px solid var(--rule)">
        <button data-action="step-gross" data-match="${match.id}" data-player="${id}" data-delta="-1" style="width:32px;height:34px;border:0;border-right:1px solid var(--rule);background:transparent;font-size:15px;font-weight:800">&minus;</button>
        <div style="width:38px;height:34px;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:800">${view.gross[id]}</div>
        <button data-action="step-gross" data-match="${match.id}" data-player="${id}" data-delta="1" style="width:32px;height:34px;border:0;border-left:1px solid var(--rule);background:transparent;font-size:15px;font-weight:800">+</button>
      </div>
    </div>`;
  }).join('');

  let hammerBlock = '';
  if (isHammerGame(match)) {
    const h = hammerOutcome(view.hammer);
    const sideNick = (s) => (s === 'A' ? nickA : nickB);
    const hammerBtn = (attrs, cls, label, mult) => `
      <button ${attrs} class="hammer-btn ${cls}">${HAMMER_ICON}<span>${label}</span>${mult ? `<span class="mult">&times;${mult}</span>` : ''}</button>`;
    const valueChip = `<div class="hammer-value${h.mult > 1 ? ' hot' : ''}"><span>Hole value</span><strong>&times;${h.mult}</strong></div>`;
    const mid = `data-match="${match.id}"`;
    let body;
    if (h.folded) {
      body = `
        <div class="hammer-banner">${HAMMER_ICON}<div><strong>Folded.</strong> ${esc(sideNick(h.folded))} take the hole at &times;${h.mult}.</div></div>`;
    } else if (h.pending) {
      body = `
        <div class="hammer-banner hammer-swing">${HAMMER_ICON}<div><strong>${esc(sideNick(h.pending))} threw the hammer.</strong> Take it and the hole is worth &times;${h.mult * 2}. Fold and ${esc(sideNick(h.pending))} win the hole at &times;${h.mult}.</div></div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <div style="flex:1">${hammerBtn(`data-action="hammer-answer" data-resp="accept" ${mid}`, 'hammer-live', 'Take it', h.mult * 2)}</div>
          <div style="flex:1">${hammerBtn(`data-action="hammer-answer" data-resp="fold" ${mid}`, 'silver', 'Fold', '')}</div>
        </div>`;
    } else if (h.holder) {
      body = `
        <div style="font-size:12px;font-weight:800;margin-bottom:8px">${esc(sideNick(h.holder))} hold the hammer.</div>
        ${hammerBtn(`data-action="hammer-throw" data-side="${h.holder}" ${mid}`, h.holder === 'A' ? 'hammer-live' : 'silver hammer-live', `${esc(sideNick(h.holder))} throw it back`, h.mult * 2)}`;
    } else {
      body = `
        <div style="display:flex;gap:8px">
          <div style="flex:1">${hammerBtn(`data-action="hammer-throw" data-side="A" ${mid}`, '', `${esc(nickA)} hammer`, h.mult * 2)}</div>
          <div style="flex:1">${hammerBtn(`data-action="hammer-throw" data-side="B" ${mid}`, 'silver', `${esc(nickB)} hammer`, h.mult * 2)}</div>
        </div>`;
    }
    hammerBlock = `
    <div style="padding:12px 18px;border-bottom:2px solid var(--rule)">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px">
        <div style="font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)">The hammer &middot; hole ${hole.n}</div>
        ${valueChip}
      </div>
      ${body}
      ${view.hammer.length ? `<button data-action="hammer-undo" ${mid} style="border:0;background:transparent;color:var(--muted);font-weight:800;font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:10px 0 0">Undo last hammer action</button>` : ''}
      <div style="font-size:11px;line-height:1.45;color:var(--muted);margin-top:8px">Either side can throw the hammer during a hole. The other side must take it (the hole doubles, and they can throw it back) or fold (the thrower wins the hole). A hammered hole counts for its full value in the front, back and overall bets.</div>
    </div>`;
  }

  const holeTags = tagsForHole(hole);
  const tagBtns = holeTags.map((t) => {
    const on = view.tags.includes(t);
    return `<button data-action="toggle-tag" data-match="${match.id}" data-tag="${t}" style="flex:1 0 auto;border:0;background:${on ? 'var(--accent)' : 'var(--bg)'};color:${on ? '#fff' : 'var(--ink)'};font-weight:800;font-size:11px;letter-spacing:.04em;text-transform:uppercase;padding:9px 11px">${t}</button>`;
  }).join('');

  // For each active tag that needs a player: who is it?
  const tagWhoBlocks = holeTags.filter((t) => view.tags.includes(t) && TAG_RULES[t]).map((t) => {
    const rule = TAG_RULES[t];
    const picked = view.who[t] || [];
    const chips = match.sideA.concat(match.sideB).map((id) => {
      const on = picked.includes(id);
      return `<button data-action="toggle-tag-who" data-match="${match.id}" data-tag="${t}" data-player="${id}" style="flex:1 0 auto;border:0;background:${on ? 'var(--accent)' : 'var(--bg)'};color:${on ? '#fff' : 'var(--ink)'};font-weight:800;font-size:12px;padding:10px 12px">${esc(PLAYERS_BY_ID[id].name)}</button>`;
    }).join('');
    const warn = picked.length ? '' : `<span style="color:var(--accent)"> &mdash; pick one or nothing is ${rule.mode === 'fine' ? 'charged' : 'paid'}</span>`;
    return `
    <div style="margin:10px 18px 0">
      <div style="font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding-bottom:5px">${esc(rule.ask)}${warn}</div>
      <div style="display:flex;flex-wrap:wrap;gap:1px;background:var(--rule);border:1px solid var(--rule)">${chips}</div>
    </div>`;
  }).join('');

  // Closest to the pin (par 3s): the winner collects from the whole foursome
  // playing together. Saved the moment you tap, separately from Post hole.
  let ctpBlock = '';
  if (hole.par === 3) {
    // normally both players of a singles match are in the same foursome; if the
    // foursomes were set up so they aren't, offer both
    const shown = [];
    match.sideA.concat(match.sideB).forEach((pid) => { foursomeFor(session, pid).forEach((id) => { if (!shown.includes(id)) shown.push(id); }); });
    const winnerOf = (id) => { const w = ((session.ctp || {})[hole.n] || {})[foursomeIndex(session, id)]; return w && w.p === id ? w : null; };
    const winners = shown.filter((id) => winnerOf(id));
    const four = foursomeFor(session, match.sideA[0]);
    const cur = winners.length ? { p: winners[0] } : null;
    const chips = shown.map((id) => {
      const on = !!winnerOf(id);
      return `<button data-action="ctp-set" data-match="${match.id}" data-hole="${hole.n}" data-player="${id}" style="flex:1 0 auto;border:0;background:${on ? 'var(--accent)' : 'var(--bg)'};color:${on ? '#fff' : 'var(--ink)'};font-weight:800;font-size:14px;padding:12px 10px">${esc(PLAYERS_BY_ID[id].name)}</button>`;
    }).join('');
    ctpBlock = `
    <div style="margin:14px 18px 0;border:1px solid var(--rule);border-radius:12px;padding:12px 12px 10px">
      <div style="font-size:15px;font-weight:800">Closest to the pin</div>
      <div style="font-size:13px;color:var(--muted);margin:2px 0 8px">${cur ? `${winners.map((id) => esc(PLAYERS_BY_ID[id].name)).join(' and ')} ${winners.length > 1 ? 'win' : 'wins'} $${CTP_AMOUNT * (four.length - 1)}: $${CTP_AMOUNT} from each other player in the foursome.` : `Tap the winner. Every other player in the foursome pays them $${CTP_AMOUNT}.`}</div>
      <div style="display:flex;flex-wrap:wrap;gap:1px;background:var(--rule);border:1px solid var(--rule)">${chips}</div>
    </div>`;
  }

  // Finished matches must be submitted; a submitted match is locked.
  const sub = match.submitted;
  const complete = matchComplete(match, course);
  const lockBanner = sub ? `
    <div style="display:flex;align-items:center;gap:10px;padding:11px 18px;background:var(--ink);color:#fff;border-bottom:2px solid var(--rule)">
      <div style="flex:1;min-width:0;font-size:12px;line-height:1.4"><strong style="letter-spacing:.08em;text-transform:uppercase">&check; Submitted &amp; locked</strong><br>by ${esc(sub.name || 'someone')} &middot; ${new Date(sub.ts).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</div>
      <button data-action="unlock-match" data-match="${match.id}" style="border:1px solid #fff;background:transparent;color:#fff;font-weight:800;font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:8px 10px;white-space:nowrap">Unlock to edit</button>
    </div>` : '';
  const submitBlock = !sub && complete ? `
    <div style="margin:0 18px 26px;border:2px solid var(--accent);padding:12px 14px">
      <div style="font-size:12px;line-height:1.45;color:var(--ink)"><strong style="color:var(--accent);letter-spacing:.08em;text-transform:uppercase">Match finished.</strong> Check the scores, then submit the final result. Once submitted it is locked and changing it needs the unlock code.</div>
      <button data-action="submit-match" data-match="${match.id}" class="btn btn-primary btn-block" style="margin-top:10px">Submit final score</button>
    </div>` : '';

  return `
  <div>
    ${lockBanner}
    <div style="display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:13px 18px;border-bottom:2px solid var(--rule)">
      <div>
        <div style="font-size:13px;font-weight:800">${esc(shortA)}</div>
        <div style="font-size:13px;font-weight:800;color:rgba(10,16,48,.7)">${esc(shortB)}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:19px;font-weight:800;color:${headerLabel.color};line-height:1">${esc(headerLabel.text)}</div>
        <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">thru ${committedResults.length}</div>
      </div>
    </div>
    <div style="padding:0 18px 12px;border-bottom:2px solid var(--rule);margin-top:-1px">
      ${nassauChips(headerLabel.segments)}
      <div style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-top:6px">${esc(gameFor(session).name)} &middot; Nassau &middot; ${esc(cardTee.name)} tees &middot; ${sessionCounts(session) ? 'counts toward the team event' : 'does not count toward the team event'}</div>
    </div>
    ${hammerBlock}
    <div style="display:flex;gap:2px;padding:10px 18px;border-bottom:1px solid var(--rule)">${cardHoles}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 18px;border-bottom:2px solid var(--rule)">
      <button data-action="step-hole" data-match="${match.id}" data-delta="-1" style="border:1px solid var(--rule);background:transparent;font-weight:800;font-size:16px;width:34px;height:34px">&larr;</button>
      <div style="text-align:center">
        <div style="font-size:9px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)">Hole ${hole.n}</div>
        <div style="font-size:15px;font-weight:800;letter-spacing:-.01em">Par ${hole.par} · ${holeYds ? holeYds + ' yds · ' : ''}SI ${hole.si}</div>
      </div>
      <button data-action="step-hole" data-match="${match.id}" data-delta="1" style="border:1px solid var(--rule);background:transparent;font-weight:800;font-size:16px;width:34px;height:34px">&rarr;</button>
    </div>
    ${entryRows}
    <div style="padding:12px 18px;border-bottom:2px solid var(--rule);display:flex;justify-content:space-between;align-items:baseline">
      <div style="font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)">This hole</div>
      <div style="font-size:15px;font-weight:800;color:${holeResultColor}">${esc(holeResultText)}</div>
    </div>
    <div style="padding:12px 18px 8px;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)">Tag the hole &middot; fines</div>
    <div style="display:flex;flex-wrap:wrap;gap:1px;background:var(--rule);margin:0 18px;border:1px solid var(--rule)">${tagBtns}</div>
    ${tagWhoBlocks}
    <div style="padding:8px 18px 0;font-size:13px;line-height:1.45;color:var(--muted)">Fines: whoever you pick pays $${TAG_RULES['Gallery rule'].amount} into the one big fine pot. They land in Money when you post the hole.</div>
    ${ctpBlock}
    ${sub ? '<div style="height:26px"></div>' : `<button data-action="post-hole" data-match="${match.id}" class="btn btn-primary btn-block" style="margin:16px 18px ${complete ? '14px' : '26px'};width:calc(100% - 36px)">Post hole ${hole.n} &amp; advance</button>`}
    ${submitBlock}
  </div>`;
}

// ---------- Foursome card (Saturday singles: one screen, four scores) ----------
function renderFoursome(state) {
  const f = state.ui.foursome;
  const session = f && findSession(f.sessionId);
  const ms = session ? foursomeMatches(session, f.gi) : [];
  if (!session || ms.length < 2) return `<div style="padding:22px 20px;font-size:14px;color:var(--muted)">That foursome isn't set up.<br><br><button data-action="go-screen" data-screen="rounds" class="btn btn-secondary">Back to rounds</button></div>`;
  const course = courseFor(session);
  const group = sessionGroups(session)[f.gi];
  const views = ms.map((m) => cardView(state, m, course));
  const hole = views[0].hole, holeIdx = views[0].holeIdx;
  const tee = teeFor(session);
  const yds = tee.yards ? tee.yards[hole.n - 1] : null;
  const nHoles = course.holes.length;

  const nav = `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 20px">
      <button data-action="fs-step" data-delta="-1" style="border:1px solid var(--rule);background:transparent;border-radius:50%;width:40px;height:40px;font-size:18px">&larr;</button>
      <div style="text-align:center">
        <div style="font-size:13px;font-weight:700;color:var(--muted)">Foursome ${f.gi + 1} &middot; hole ${hole.n} of ${nHoles}</div>
        <div style="font-size:19px;font-weight:800;letter-spacing:-.01em">Par ${hole.par} &middot; ${yds ? yds + ' yds &middot; ' : ''}SI ${hole.si}</div>
      </div>
      <button data-action="fs-step" data-delta="1" style="border:1px solid var(--rule);background:transparent;border-radius:50%;width:40px;height:40px;font-size:18px">&rarr;</button>
    </div>
    <div style="display:flex;gap:2px;padding:0 20px 10px">${course.holes.map((h, i) => {
      const posted = ms.every((m) => (m.grossScores[m.sideA[0]] || {})[h.n] != null);
      return `<button data-action="fs-goto" data-idx="${i}" style="flex:1;border:0;padding:0;background:transparent"><div style="height:14px;border-radius:2px;background:${posted ? 'var(--accent)' : 'var(--rule-soft)'};outline:${i === holeIdx ? '2px solid var(--accent)' : 'none'};outline-offset:1px"></div></button>`;
    }).join('')}</div>`;

  // each singles match: two players, steppers, the hole result as entered
  const matchBlocks = ms.map((m, mi) => {
    const view = views[mi];
    const ids = m.sideA.concat(m.sideB);
    const strokes = handicapAllocation(ids, session);
    const nets = {};
    ids.forEach((id) => { nets[id] = netScore(view.gross[id], strokes[id], hole.si); });
    const [a, b] = ids;
    const label = matchStateLabel(view.results, nHoles, PLAYERS_BY_ID[a].name, PLAYERS_BY_ID[b].name, 1);
    const delta = Math.sign(nets[b] - nets[a]);
    const holeText = delta === 0 ? `Halved with a net ${nets[a]}` : `${PLAYERS_BY_ID[delta > 0 ? a : b].name} wins ${Math.min(nets[a], nets[b])} to ${Math.max(nets[a], nets[b])}`;
    const rows = ids.map((id) => {
      const p = PLAYERS_BY_ID[id];
      const shots = shotsOnHole(strokes[id], hole.si);
      return `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--rule-faint)">
        <div style="width:9px;height:9px;flex:none;background:${p.team === 'L' ? 'var(--accent)' : 'var(--team2)'}"></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:16px;font-weight:800">${esc(p.name)} <span style="color:var(--accent);font-size:13px">${shots === 0 ? '' : shots === 1 ? '&bull;' : '&bull;&bull;'}</span></div>
          <div style="font-size:12px;color:var(--muted)">plays off ${strokes[id]} &middot; net ${nets[id]}</div>
        </div>
        <div style="display:flex;border:1px solid var(--rule);border-radius:10px;overflow:hidden">
          <button data-action="step-gross" data-match="${m.id}" data-player="${id}" data-delta="-1" style="width:44px;height:46px;border:0;border-right:1px solid var(--rule);background:transparent;font-size:20px;font-weight:800">&minus;</button>
          <div style="width:46px;height:46px;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800">${view.gross[id]}</div>
          <button data-action="step-gross" data-match="${m.id}" data-player="${id}" data-delta="1" style="width:44px;height:46px;border:0;border-left:1px solid var(--rule);background:transparent;font-size:20px;font-weight:800">+</button>
        </div>
      </div>`;
    }).join('');
    return `
    <div style="margin:0 20px 12px;border:1px solid var(--rule);border-radius:16px;padding:12px 14px 10px;background:#fff">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">
        <div style="font-size:13px;font-weight:700;color:var(--muted)">Match ${mi + 1} &middot; ${esc(label.text)}${view.results.length ? ` &middot; thru ${view.results.length}` : ''}</div>
        ${m.submitted ? `<div style="font-size:12px;font-weight:800;color:var(--muted)">&check; Submitted</div>` : ''}
      </div>
      ${m.submitted ? `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;background:var(--ink);color:#fff;border-radius:10px;padding:8px 10px;margin-top:8px;font-size:13px"><span>Submitted &amp; locked by ${esc(m.submitted.name || 'someone')}</span><button data-action="unlock-match" data-match="${m.id}" style="border:1px solid #fff;background:transparent;color:#fff;font-weight:800;font-size:12px;padding:6px 8px;border-radius:8px">Unlock</button></div>` : ''}
      ${rows}
      <div style="font-size:14px;font-weight:800;color:var(--accent);margin-top:2px">${esc(holeText)}</div>
    </div>`;
  }).join('');

  // closest to the pin (par 3s), paid out of the whole foursome
  let ctp = '';
  if (hole.par === 3) {
    const winner = ((session.ctp || {})[hole.n] || {})[f.gi];
    const chips = group.map((id) => {
      const on = winner && winner.p === id;
      return `<button data-action="ctp-set" data-match="${ms[0].id}" data-hole="${hole.n}" data-player="${id}" style="flex:1 0 auto;border:0;background:${on ? 'var(--accent)' : 'var(--bg)'};color:${on ? '#fff' : 'var(--ink)'};font-weight:800;font-size:15px;padding:13px 10px">${esc(PLAYERS_BY_ID[id].name)}</button>`;
    }).join('');
    ctp = `
    <div style="margin:0 20px 12px;border:1px solid var(--rule);border-radius:16px;padding:12px 14px">
      <div style="font-size:16px;font-weight:800">Closest to the pin</div>
      <div style="font-size:13px;color:var(--muted);margin:2px 0 8px">${winner ? `${esc(PLAYERS_BY_ID[winner.p].name)} wins $${CTP_AMOUNT * (group.length - 1)}: $${CTP_AMOUNT} from each of the other three.` : `Tap the winner. The other three in the foursome each pay $${CTP_AMOUNT}.`}</div>
      <div style="display:flex;flex-wrap:wrap;gap:1px;background:var(--rule);border:1px solid var(--rule)">${chips}</div>
    </div>`;
  }

  // fines: pick the fine, then who
  const picked = state.ui.fineTag;
  const fineChips = FINE_TYPES.map((t) => `<button data-action="fs-tag" data-tag="${esc(t)}" style="border:0;background:${picked === t ? 'var(--accent)' : 'var(--bg)'};color:${picked === t ? '#fff' : 'var(--ink)'};font-weight:800;font-size:13px;padding:10px 12px;flex:1 0 auto">${esc(t)}</button>`).join('');
  const whoChips = group.map((id) => `<button data-action="fs-fine" data-player="${id}" style="flex:1 0 auto;border:0;background:var(--bg);color:var(--ink);font-weight:800;font-size:14px;padding:11px 10px;${picked ? '' : 'opacity:.45'}">${esc(PLAYERS_BY_ID[id].name)}</button>`).join('');
  const current = [];
  views.forEach((v) => { Object.keys(v.who).forEach((tag) => (v.who[tag] || []).forEach((id) => current.push({ tag, id }))); });
  const fines = `
    <div style="margin:0 20px 12px;border:1px solid var(--rule);border-radius:16px;padding:12px 14px">
      <div style="font-size:16px;font-weight:800">Fines on this hole</div>
      <div style="font-size:13px;color:var(--muted);margin:2px 0 8px">$${TAG_RULES['Gallery rule'].amount} each, into the fine pot. Pick the fine, then tap who it's for.</div>
      <div style="display:flex;flex-wrap:wrap;gap:1px;background:var(--rule);border:1px solid var(--rule)">${fineChips}</div>
      <div style="font-size:12px;font-weight:700;color:var(--muted);margin:8px 0 4px">${picked ? `${esc(picked)}: who?` : 'Then tap who'}</div>
      <div style="display:flex;flex-wrap:wrap;gap:1px;background:var(--rule);border:1px solid var(--rule)">${whoChips}</div>
      ${current.length ? `<div style="font-size:13px;margin-top:8px">${current.map((c) => `<button data-action="fs-fine" data-player="${c.id}" data-tag="${esc(c.tag)}" style="border:1px solid var(--rule);background:var(--row-alt);border-radius:999px;padding:5px 10px;margin:0 6px 6px 0;font-size:13px;font-weight:700">${esc(PLAYERS_BY_ID[c.id].name)} &middot; ${esc(c.tag)} &times;</button>`).join('')}</div>` : ''}
    </div>`;

  const allComplete = ms.every((m) => matchComplete(m, course));
  const needSubmit = ms.some((m) => !m.submitted && matchComplete(m, course));
  const allSubmitted = ms.every((m) => m.submitted);
  return `
  <div style="padding-bottom:20px">
    ${nav}
    ${matchBlocks}
    ${ctp}
    ${fines}
    ${allSubmitted ? '' : `<button data-action="fs-post" class="btn btn-primary btn-block" style="margin:6px 20px 12px;width:calc(100% - 40px);padding:16px;font-size:18px">Post hole ${hole.n} &amp; advance</button>`}
    ${needSubmit ? `<div style="margin:0 20px 6px;border:2px solid var(--accent);border-radius:14px;padding:12px 14px">
      <div style="font-size:14px;line-height:1.45"><strong style="color:var(--accent)">${allComplete ? 'Both matches are finished.' : 'A match is finished.'}</strong> Check the scores, then submit. Submitted matches are locked.</div>
      <button data-action="fs-submit" class="btn btn-primary btn-block" style="margin-top:10px">Submit final scores</button></div>` : ''}
  </div>`;
}

// ---------- Money ----------
function renderMoney(state) {
  const tabs = [{ id: 'games', name: 'Side games' }, { id: 'ledger', name: 'The ledger' }].map((t) => {
    const on = state.ui.moneyTab === t.id;
    return `<button data-action="pick-money-tab" data-tab="${t.id}" style="flex:1;border:0;background:${on ? 'var(--accent)' : 'var(--bg)'};color:${on ? '#fff' : 'var(--ink)'};font-weight:800;font-size:11px;letter-spacing:.1em;text-transform:uppercase;padding:11px 6px">${t.name}</button>`;
  }).join('');

  let body;
  if (state.ui.moneyTab === 'games') {
    const ctpEvents = state.sideGameEvents.filter((e) => e.type === 'CTP').sort((a, b) => b.ts - a.ts);
    const ctpRows = ctpEvents.length ? ctpEvents.map((e) => `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 18px;border-top:1px solid var(--rule)">
        <div style="font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);width:64px">${e.type}</div>
        <div style="flex:1;font-size:13px;font-weight:800">${esc(PLAYERS_BY_ID[e.playerId].name)}</div>
        <div style="font-size:11px;color:var(--muted)">Hole ${ordinal(e.holeN)}</div>
        <div style="font-size:13px;font-weight:800;color:var(--accent);width:46px;text-align:right">$${e.amount}</div>
      </div>`).join('') : `<div style="padding:12px 18px;font-size:13px;color:var(--muted)">Nothing tagged yet.</div>`;
    const pot = state.sideGameEvents.reduce((a, e) => a + e.amount, 0);
    body = `
      <div style="padding:14px 18px;border-bottom:2px solid var(--rule)">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <div style="font-size:9px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)">Side games so far</div>
          <div style="font-size:11px;color:var(--muted)">$${pot} tagged</div>
        </div>
        <div style="font-size:12px;line-height:1.45;color:rgba(10,16,48,.7);margin-top:6px">On a par 3, open the match card and tap who was closest to the pin. Every other player in that foursome pays the winner $${CTP_AMOUNT}.</div>
      </div>
      <div style="padding:16px 18px 6px;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)">Closest to the pin</div>
      ${ctpRows}
      <div style="height:26px"></div>`;
  } else {
    const totals = ledgerTotals(state);
    const rows = PLAYERS.slice().sort((a, b) => totals[b.id] - totals[a.id]).map((p) => `
      <div style="display:flex;align-items:center;gap:10px;padding:11px 18px;border-bottom:1px solid var(--rule)">
        <div style="width:9px;height:9px;flex:none;background:${p.team === 'L' ? 'var(--accent)' : 'var(--team2)'}"></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:800">${p.name}</div>
          <div style="font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted)">${esc(ledgerDetail(state, p.id))}</div>
        </div>
        <div style="font-size:16px;font-weight:800;color:${totals[p.id] > 0 ? 'var(--accent)' : totals[p.id] < 0 ? 'var(--muted)' : 'var(--ink)'};text-align:right;min-width:62px">${fmtMoney(totals[p.id])}</div>
      </div>`).join('');
    const net = Object.values(totals).reduce((a, b) => a + b, 0);
    const moved = allLedger(state).filter((e) => e.amount > 0).reduce((a, e) => a + e.amount, 0);

    // Team event status
    const te = teamEventStatus(state);
    const t1 = esc(teamNickname(state.teamOneName)), t2 = esc(teamNickname(state.teamTwoName));
    let teHead, teText, teExtra = '';
    const sb = te.tb || stablefordTiebreak(state);
    const sbLine = `Net stableford (singles): ${t1} ${sb.sums.total.L} &ndash; ${sb.sums.total.T} ${t2}`;
    if (te.state === 'won') {
      const w = te.winner === 'L' ? t1 : t2;
      teHead = `${w} win the cup`;
      const how = te.via === 'points' ? '' : te.via === 'playoff' ? ' It was level at 12–12 and a playoff decided it.' : ` It was level at 12–12 and ${te.via} decided it (${sbLine.replace(/&ndash;/g, '–')}).`;
      teText = `Settled at $${te.stake} a man: each ${w} player collects $${te.stake}, each loser pays $${te.stake}. It's already in the balances below.${how}`;
      if (te.via === 'playoff') teExtra = `<button data-action="set-playoff" data-team="" style="margin-top:8px;border:1px solid var(--rule);background:transparent;font-weight:800;font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:8px 10px;color:var(--ink)">Undo playoff result</button>`;
    } else if (te.state === 'tiebreak') {
      teHead = `Level at ${fmtPoints(te.team1)} – ${fmtPoints(te.team2)}`;
      if (te.needPlayoff) {
        teText = `Every point is in and net stableford is level too, so it takes a playoff. Record the winner to settle the $${te.stake} a man.`;
        teExtra = `<div style="display:flex;gap:8px;margin-top:8px">
          <button data-action="set-playoff" data-team="L" style="flex:1;border:1px solid var(--rule);background:transparent;font-weight:800;font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:9px 6px;color:var(--ink)">${t1} won</button>
          <button data-action="set-playoff" data-team="T" style="flex:1;border:1px solid var(--rule);background:transparent;font-weight:800;font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:9px 6px;color:var(--ink)">${t2} won</button></div>`;
      } else {
        teText = `Every point is in and it's level, so net stableford in the singles decides it once every score is entered. ${sbLine}.`;
      }
    } else {
      teHead = `${fmtPoints(te.team1)} – ${fmtPoints(te.team2)}`;
      teText = `$${te.stake} a man on the team event — pays out automatically when a team clinches ${fmtPoints(te.toWin)}. If it ends 12–12, net stableford in the singles breaks the tie.`;
    }
    const teCard = `
      <div style="padding:14px 18px;border-bottom:2px solid var(--rule);background:var(--row-alt)">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <div style="font-size:9px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)">Team event · $${te.stake} a man</div>
          <div style="font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">${te.state === 'open' ? 'Open' : te.state === 'tiebreak' ? 'Tiebreak' : 'Settled'}</div>
        </div>
        <div style="font-size:18px;font-weight:800;margin-top:4px">${teHead}</div>
        <div style="font-size:12px;line-height:1.45;color:rgba(10,16,48,.7);margin-top:4px">${teText}</div>
        ${teExtra}
      </div>`;

    // The one big fine pot: every hole fine goes in, nobody collects it hole by hole
    const fineEntries = state.ledger.filter((e) => e.kind === 'fine' && e.amount < 0);
    const finePot = fineEntries.reduce((a, e) => a - e.amount, 0);
    const paidIn = {};
    fineEntries.forEach((e) => { paidIn[e.playerId] = (paidIn[e.playerId] || 0) - e.amount; });
    const payers = Object.keys(paidIn).sort((a, b) => paidIn[b] - paidIn[a]);
    const potCard = `
      <div style="padding:14px 18px;border-bottom:2px solid var(--rule);background:var(--row-alt)">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">
          <div style="font-size:16px;font-weight:800">Fine pot</div>
          <div style="font-size:26px;font-weight:800;letter-spacing:-.02em;color:var(--accent)">$${finePot}</div>
        </div>
        <div style="font-size:13px;line-height:1.45;color:var(--muted);margin-top:2px">${fineEntries.length ? `${fineEntries.length} fine${fineEntries.length === 1 ? '' : 's'} so far. Every fine goes into this one pot.` : 'Every fine goes into this one pot. Nothing in it yet.'}</div>
        ${payers.length ? `<div style="font-size:13px;margin-top:6px">${payers.map((id) => `${esc(PLAYERS_BY_ID[id].name)} $${paidIn[id]}`).join(' &middot; ')}</div>` : ''}
      </div>`;

    // Recent hand-entered money and match payouts (hole fines and closest-to-pin
    // wins belong to their hole and are undone there)
    const recent = state.ledger.filter((e) => !e.matchId && (e.kind === 'manual' || e.kind === 'fine')).slice().sort((a, b) => b.ts - a.ts).slice(0, 12);
    const seenGroups = {};
    const recentRows = recent.filter((e) => { if (!e.group) return true; if (seenGroups[e.group]) return false; seenGroups[e.group] = true; return true; }).map((e) => {
      const grouped = e.group ? state.ledger.filter((x) => x.group === e.group) : [e];
      const label = e.group ? esc(e.detail) : `${esc(PLAYERS_BY_ID[e.playerId].name)} · ${esc(e.detail)}`;
      const amt = e.group ? `$${Math.abs(e.amount)} a man` : fmtMoney(e.amount);
      return `
      <div style="display:flex;align-items:center;gap:10px;padding:9px 18px;border-bottom:1px solid var(--rule)">
        <div style="flex:1;min-width:0;font-size:12px;line-height:1.35">${label}</div>
        <div style="font-size:12px;font-weight:800;color:${!e.group && e.amount < 0 ? 'var(--muted)' : 'var(--accent)'}">${amt}</div>
        <button data-action="remove-ledger" data-entry="${e.id}" aria-label="Remove" style="border:1px solid var(--rule);background:transparent;width:24px;height:24px;padding:0;color:var(--muted);font-size:13px;line-height:1">&times;</button>
      </div>`;
    }).join('');

    const btn = 'flex:1;border:1px solid var(--rule);background:transparent;font-weight:800;font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:11px 6px;color:var(--ink)';
    body = `
      ${teCard}
      ${potCard}
      <div style="padding:14px 18px;border-bottom:2px solid var(--rule);font-size:12px;line-height:1.45;color:rgba(10,16,48,.7)">Closest-to-pin wins, hole fines, the team event and any hand-entered money net into one balance per man. Fines are tagged on the hole and go into the fine pot above, which is why the balances add up to minus the pot.</div>
      <div style="display:flex;gap:8px;padding:12px 18px;border-bottom:2px solid var(--rule)">
        <button data-action="open-money-payout" style="${btn}">Pay out a match</button>
        <button data-action="open-money-entry" style="${btn}">Enter money</button>
      </div>
      ${rows}
      <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:2px solid var(--rule);background:var(--row-alt)">
        <div style="font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase">Balances</div>
        <div style="font-size:16px;font-weight:800">${fmtMoney(net)} net${finePot ? ` (fine pot $${finePot})` : ''} · $${moved} moved</div>
      </div>
      <div style="padding:16px 18px 6px;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)">Hand-entered money</div>
      ${recentRows || `<div style="padding:4px 18px 12px;font-size:13px;color:var(--muted)">Nothing yet — use the buttons above for Tobacco Road money or side bets.</div>`}
      <div style="height:26px"></div>`;
  }

  return `<div><div style="display:flex;gap:1px;background:var(--rule);border-bottom:2px solid var(--rule)">${tabs}</div>${body}</div>`;
}

// Two people entered different scores for the same player on the same hole.
function renderConflictModal(state) {
  const c = state.ui.scoreConflict;
  if (!c) return '';
  const match = matchById(c.matchId);
  if (!match) return '';
  const course = courseFor(sessionForMatch(c.matchId));
  const when = c.ts ? new Date(c.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  const me = myName(state);
  const rows = c.items.map((it) => {
    const name = PLAYERS_BY_ID[it.playerId].name;
    const pick = c.choice[it.playerId];
    const btn = (which, big, small) => `<button data-action="conflict-choose" data-player="${it.playerId}" data-which="${which}" style="flex:1;border:2px solid ${pick === which ? 'var(--accent)' : 'var(--rule)'};background:${pick === which ? 'var(--accent)' : 'var(--bg)'};color:${pick === which ? '#fff' : 'var(--ink)'};padding:10px 6px;text-align:center"><div style="font-size:24px;font-weight:800;line-height:1">${big}</div><div style="font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;margin-top:4px">${small}</div></button>`;
    return `
    <div style="border-top:1px solid var(--rule);padding-top:10px">
      <div style="font-size:14px;font-weight:800;margin-bottom:8px">${esc(name)}</div>
      <div style="display:flex;gap:8px">
        ${btn('posted', it.posted, `${esc(c.by)}'s${when ? ' (' + esc(when) + ')' : ''}`)}
        ${btn('mine', it.mine, `${esc(me)}'s (yours)`)}
      </div>
    </div>`;
  }).join('');
  const ready = c.items.every((it) => c.choice[it.playerId]);
  return `
  <div class="modal-backdrop" style="z-index:150">
    <div class="modal-sheet" data-action="noop" style="max-height:92vh;overflow-y:auto">
      <div style="font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)">Score conflict &middot; hole ${c.holeN} &middot; ${esc(course.name)}</div>
      <div style="font-size:14px;line-height:1.5"><strong>${esc(c.by)}</strong> already posted ${c.items.length === 1 ? 'a different score' : 'different scores'} for this hole than the ${c.items.length === 1 ? 'one' : 'ones'} you just entered. Check the card and tap the correct ${c.items.length === 1 ? 'score' : 'score for each player'}.</div>
      ${rows}
      <div style="display:flex;gap:10px;margin-top:6px">
        <button data-action="conflict-cancel" class="btn btn-secondary" style="flex:1">Go back</button>
        <button data-action="conflict-confirm" class="btn btn-primary" style="flex:1;${ready ? '' : 'opacity:.45'}">Confirm scores</button>
      </div>
    </div>
  </div>`;
}

const MONEY_LABEL ='font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)';

function renderMoneyModal(state) {
  const kind = state.ui.moneyModal;
  if (!kind) return '';
  const wrap = (inner) => `
  <div class="modal-backdrop" data-action="close-money-modal">
    <div class="modal-sheet" data-action="noop">${inner}</div>
  </div>`;
  const buttons = (submit, label) => `
      <div style="display:flex;gap:10px;margin-top:6px">
        <button data-action="close-money-modal" class="btn btn-secondary" style="flex:1">Cancel</button>
        <button data-action="${submit}" class="btn btn-primary" style="flex:1">${label}</button>
      </div>`;

  if (kind === 'entry') {
    const playerOpts = PLAYERS.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
    return wrap(`
      <div style="font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)">Enter money</div>
      <label style="${MONEY_LABEL}">Player
        <select id="money-player" class="field-input" style="margin-top:4px">${playerOpts}</select>
      </label>
      <label style="${MONEY_LABEL}">Direction
        <select id="money-dir" class="field-input" style="margin-top:4px"><option value="won">Won / is owed</option><option value="owed">Lost / owes</option></select>
      </label>
      <label style="${MONEY_LABEL}">Amount ($)
        <input id="money-amount" class="field-input" type="number" min="1" max="10000" value="20" style="margin-top:4px">
      </label>
      <label style="${MONEY_LABEL}">What for
        <input id="money-note" class="field-input" type="text" maxlength="60" placeholder="Tobacco Road side bet" style="margin-top:4px">
      </label>
      ${buttons('submit-money-entry', 'Add it')}`);
  }

  // payout: one row per match per winning side, Tobacco Road first
  const opts = [];
  state.sessions.slice().sort((a, b) => (courseFor(b).id === 'tobacco-road') - (courseFor(a).id === 'tobacco-road')).forEach((s) => {
    const course = courseFor(s);
    s.matches.forEach((m) => {
      opts.push(`<option value="${m.id}|A">${esc(course.name)}: ${esc(playerNames(m.sideA))} won</option>`);
      opts.push(`<option value="${m.id}|B">${esc(course.name)}: ${esc(playerNames(m.sideB))} won</option>`);
    });
  });
  return wrap(`
      <div style="font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)">Pay out a match</div>
      ${opts.length ? `
      <label style="${MONEY_LABEL}">Who won
        <select id="payout-winner" class="field-input" style="margin-top:4px">${opts.join('')}</select>
      </label>
      <label style="${MONEY_LABEL}">Stake per man ($)
        <input id="payout-amount" class="field-input" type="number" min="1" max="10000" value="20" style="margin-top:4px">
      </label>
      <div style="font-size:12px;line-height:1.45;color:rgba(10,16,48,.7)">Each man on the winning side collects this; each man on the losing side pays it. For a halved match, just don't pay out.</div>
      ${buttons('submit-money-payout', 'Pay it out')}` : `
      <div style="font-size:13px;color:var(--muted)">No matches are set yet. Lock in a round first.</div>
      ${buttons('close-money-modal', 'OK')}`}`);
}

// ---------- Feed ----------
function timeAgo(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function renderFeed(state) {
  const rows = state.feed.map((f) => `
    <div style="padding:12px 18px;border-bottom:1px solid var(--rule);background:${f.isSystem ? 'var(--row-alt)' : 'transparent'}">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
        <div style="font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:${f.isSystem || f.author === myName(state) ? 'var(--accent)' : 'var(--ink)'}">${esc(f.author)}</div>
        <div style="font-size:10px;color:rgba(10,16,48,.45)">${timeAgo(f.ts)}</div>
      </div>
      <div style="font-size:${f.isSystem ? '15px' : '14px'};font-weight:${f.isSystem ? '800' : '400'};line-height:1.35;letter-spacing:-.01em;margin-top:3px">${esc(f.text)}</div>
    </div>`).join('');

  return `
  <div>
    ${rows}
    <div style="display:flex;gap:1px;background:var(--rule);border-top:1px solid var(--rule);margin-bottom:22px">
      <input id="feed-input" placeholder="Say something…" onkeydown="if(event.key==='Enter'){sendFeedPost(this.value)}" style="flex:1;background:var(--row-alt);border:0;padding:12px 14px;font-size:16px;color:var(--ink)">
      <button data-action="send-feed" style="border:0;background:var(--accent);color:#fff;font-weight:800;font-size:11px;letter-spacing:.1em;text-transform:uppercase;padding:0 16px">Send</button>
    </div>
  </div>`;
}

// ---------- Teams ----------
function renderTeams(state) {
  const totals = ledgerTotals(state);
  const blocks = [
    { name: state.teamOneName, captain: 'David', team: 'L', bg: 'var(--accent)', fg: '#fff' },
    { name: state.teamTwoName, captain: 'Tom', team: 'T', bg: 'var(--team2)', fg: '#fff' },
  ].map((t) => {
    const cupT = cupTotals(state.sessions);
    const score = t.team === 'L' ? cupT.team1 : cupT.team2;
    const players = PLAYERS.filter((p) => p.team === t.team).map((p) => {
      const rec = playerRecord(state, p.id);
      return `
      <button data-action="edit-hcp" data-player="${p.id}" style="display:flex;align-items:center;gap:12px;width:100%;text-align:left;border:0;border-top:1px solid var(--rule);background:transparent;padding:10px 18px;min-height:52px">
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:800;letter-spacing:-.01em">${p.name}${p.captain ? ' (C)' : ''}</div>
          <div style="font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted)">${rec.text} · ${fmtMoney(totals[p.id])}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:17px;font-weight:800">${p.hcp}</div>
          <div style="font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--accent)">index · edit</div>
        </div>
      </button>`;
    }).join('');
    return `
    <div style="border-bottom:2px solid var(--rule)">
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:13px 18px 8px;background:${t.bg};color:${t.fg}">
        <div>
          <div style="font-size:9px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;opacity:.7">Captain ${t.captain}</div>
          <div style="font-size:20px;font-weight:800;letter-spacing:-.02em">${esc(t.name)}</div>
        </div>
        <div style="font-size:30px;font-weight:800;letter-spacing:-.03em">${fmtPoints(score)}</div>
      </div>
      ${players}
    </div>`;
  }).join('');

  const courseRows = COURSES.map((c) => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 18px;border-top:1px solid var(--rule)">
      <div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:800">${esc(c.name)}</div><div style="font-size:11px;color:var(--muted)">${[`Par ${c.par}`, `${c.tees.length} tees`, c.note].filter(Boolean).map(esc).join(' · ')}</div></div>
      <div style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">${esc((state.sessions.find((s) => s.courseId === c.id) || {}).day || '')}</div>
    </div>`).join('');

  return `
  <div>
    ${blocks}
    <div style="padding:14px 18px 8px;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)">Courses</div>
    ${courseRows}
    ${renderTripSettings(state)}
  </div>`;
}

function renderTripSettings(state) {
  const btn = 'display:block;width:100%;border:1px solid var(--rule);background:transparent;font-weight:800;font-size:12px;letter-spacing:.06em;text-transform:uppercase;padding:11px;text-align:left;color:var(--ink)';
  const code = state.ui.tripCode;
  const practice = isPractice(state);
  const live = !practice && !!code;
  const where = practice ? 'Practice' : code ? '2026 Live Tournament' : '';
  return `
  <div style="border-top:2px solid var(--rule);margin-top:14px;padding:14px 18px 30px;display:flex;flex-direction:column;gap:8px">
    <div style="font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)">This phone</div>
    <div style="font-size:12px;line-height:1.45;color:rgba(10,16,48,.7)">Playing as <strong>${esc(myName(state))}</strong>${where ? ` &middot; <strong>${where}</strong>` : syncAvailable() ? '' : ' &middot; saving on this phone only'}.</div>
    <button data-action="open-help" style="${btn}">Help &amp; player guide</button>
    <button data-action="forget-me" style="${btn}">Not you? Switch player</button>
    ${syncAvailable() ? `<button data-action="change-code" style="${btn}">Switch Practice / Live Tournament</button>` : ''}
    ${live ? `<button data-action="share-invite" style="${btn}">Copy the site link for the group</button>` : ''}
    ${liveClearLocked(state)
      ? `<div style="border:1px solid var(--rule);padding:11px;font-size:12px;line-height:1.45;color:var(--muted)"><strong style="letter-spacing:.06em;text-transform:uppercase;color:var(--ink)">Live tournament locked.</strong> It can't be cleared now that play has started.</div>`
      : `<button data-action="reset-trip" data-kind="fresh" style="${btn};color:var(--accent);border-color:var(--accent)">${live ? 'Clear the live tournament' : 'Clear everything &amp; start fresh'}</button>`}
    ${live ? '' : `<button data-action="reset-trip" data-kind="sample" style="${btn}">Load the sample trip</button>`}
  </div>`;
}

// ---------- Trophy ----------
function renderTrophy(state) {
  const { totals, note } = trophyProjection(state);
  const leaderName = totals.team1 >= totals.team2 ? state.teamOneName : state.teamTwoName;
  const hi = Math.max(totals.team1, totals.team2), lo = Math.min(totals.team1, totals.team2);
  const wins = hi >= totals.toWin;
  const headline = totals.team1 === totals.team2
    ? 'All square in the Hawks Cup'
    : `${leaderName} ${wins ? 'win' : 'lead'} the Hawks Cup`;
  const awards = computeAwards(state);
  const awardRows = awards.map((a) => `
    <div style="display:flex;gap:12px;align-items:baseline;padding:11px 18px;border-top:1px solid var(--rule)">
      <div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:800;letter-spacing:-.01em">${esc(a.title)}</div><div style="font-size:11px;color:var(--muted)">${esc(a.detail)}</div></div>
      <div style="font-size:13px;font-weight:800;text-align:right;max-width:55%">${esc(a.who)}</div>
    </div>`).join('');

  return `
  <div>
    <div style="background:var(--accent);color:#fff;padding:26px 18px 22px">
      <div style="font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;opacity:.8">Projected · live</div>
      <div style="font-size:36px;font-weight:800;line-height:1.05;letter-spacing:-.03em;margin:8px 0 12px">${esc(headline)}</div>
      <div style="display:flex;align-items:flex-end;gap:10px">
        <div style="font-size:54px;font-weight:800;line-height:.9;letter-spacing:-.04em">${fmtPoints(hi)}</div>
        <div style="font-size:20px;font-weight:800;opacity:.75;padding-bottom:6px">&ndash; ${fmtPoints(lo)}</div>
      </div>
    </div>
    <div style="padding:14px 18px;border-bottom:2px solid var(--rule);font-size:12px;line-height:1.45;color:rgba(10,16,48,.7)">${esc(note)}</div>
    <div style="padding:14px 18px 6px;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)">Awards on the table</div>
    ${awardRows}
    <div style="height:26px"></div>
  </div>`;
}

// ---------- Help / player guide ----------
function renderHelp(state) {
  const card = (title, body) => `
    <div style="margin:12px 16px 0;background:#fff;border:1px solid var(--rule);border-radius:16px;padding:14px 16px;box-shadow:0 1px 3px rgba(10,16,48,.06)">
      <div style="font-size:16px;font-weight:800;letter-spacing:-.01em;color:var(--accent);margin-bottom:6px">${title}</div>
      <div style="font-size:14px;line-height:1.5">${body}</div>
    </div>`;
  const li = (items) => `<ol style="margin:0;padding-left:20px">${items.map((i) => `<li style="margin:4px 0">${i}</li>`).join('')}</ol>`;
  const ul = (items) => `<ul style="margin:0;padding-left:18px">${items.map((i) => `<li style="margin:4px 0">${i}</li>`).join('')}</ul>`;
  const row = (a, b) => `<div style="display:flex;gap:10px;padding:5px 0;border-top:1px solid var(--rule-faint)"><div style="flex:none;width:92px;font-weight:800">${a}</div><div style="flex:1;color:rgba(10,16,48,.82)">${b}</div></div>`;
  const fines = FINE_TYPES.join(' &middot; ');
  return `
  <div style="padding-bottom:28px">
    <div style="padding:6px 20px 0;font-size:14px;line-height:1.5;color:var(--muted)">Everything you need to use the app on the course. Tap <strong style="color:var(--ink)">&larr;</strong> at the top to go back.</div>
    ${card('Get set up', li([
      'Open the site in <strong>Safari</strong>. Tap <strong>Share &rarr; Add to Home Screen</strong> so it opens like an app.',
      'Tap <strong>2026 Live Tournament</strong>, then tap <strong>your name</strong> and confirm. (<strong>Practice</strong> is a sandbox for testing; nothing in it counts.)',
      'That\'s it. Everyone sees scores and money update live. It keeps working with poor signal and syncs when you\'re back online.',
    ]))}
    ${card('The six tabs',
      row('Cup', 'The projected score (what it would be if every match ended now), <strong>your match</strong> with a big Score button, the stableford tiebreaker and the other matches.') +
      row('Rounds', 'One card per course. Set pairings and tees, open matches, add scorecard photos, start <strong>Wolf</strong> at Tobacco Road.') +
      row('Side', 'Your own games on the side (below).') +
      row('Money', 'Everyone\'s balance, the team-event pot, and how each dollar was won or lost.') +
      row('Feed', 'Match updates and group chat.') +
      row('Teams', 'Rosters, handicap indexes (tap Edit), switch player, Practice / Live.') +
      `<div style="margin-top:6px">The blue bar under the title is always one tap to <strong>Live scoring</strong>.</div>`)}
    ${card('Scoring a hole', li([
      '<strong>Cup &rarr; Your match &rarr; Score hole N</strong> (or tap Live scoring). Use <strong>&minus; / +</strong> to set each player\'s <strong>gross</strong> score.',
      'Tag the hole if it applies (below), then tap <strong>Post hole &amp; advance</strong>. One person per group can keep score, but anyone can.',
      '<strong>Saturday singles:</strong> tapping your match opens the whole <strong>foursome</strong> on one screen, with all four scores, closest to the pin and fines. One person can score for everybody.',
      'If two people post <strong>different scores</strong> for the same player and hole, a popup shows both. Tap the correct one and confirm.',
      'After the 18th hole, tap <strong>Submit final score</strong>. Submitted matches are <strong>locked</strong>. To change one, ask the organizer for the unlock code.',
    ]))}
    ${card('Tags on a hole',
      `<p style="margin:0 0 6px"><strong>Par 3s:</strong> <strong>Closest to the pin</strong>. Tap the winner on the match card; every other player in your <strong>foursome</strong> pays them <strong>$5</strong>. (On Saturday, the foursome is set when the singles are created.)</p>
       <p style="margin:0 0 6px"><strong>Fines, $10 each, into one big fine pot:</strong> ${fines}.</p>
       <p style="margin:0"><strong>Hammer</strong> (Tobacco Road only): either side can throw it to double the hole; the other side takes it or folds.</p>`)}
    ${card('The weekend',
      row('Fri AM', 'Southern Pines &middot; low ball / high ball, 2v2 &middot; 6 pts') +
      row('Fri PM', 'Mid Pines &middot; fourball, 2v2 &middot; 6 pts') +
      row('Sat', 'Pine Needles &middot; singles &middot; 12 pts') +
      row('Sun', 'Tobacco Road &middot; 2v2 fourball (hammer or Wolf optional) &middot; no cup points') +
      ul([
        '<strong>Every match is a Nassau:</strong> three bets (front 9, back 9, overall), each worth 1 point.',
        '<strong>24 points, 12&frac12; wins the Cup.</strong> The winning team collects <strong>$200 a man</strong>.',
        '<strong>Tiebreaker at 12&ndash;12:</strong> net stableford over the Saturday singles (each player on his own handicap). Still level? A playoff.',
        '<strong>Handicaps:</strong> course handicap from your index and the tees played, capped at 32. 2v2 matches use 90%, with strokes off the low player. Singles use the full difference.',
      ]))}
    ${card('Side matches &amp; Wolf',
      `<p style="margin:0 0 6px">Anyone can start extra games between any players on the <strong>Side</strong> tab: <strong>match play, stableford or stroke play</strong>, net, gross or custom strokes, any round and holes, any stake. Each is a Nassau with its own pot, and it scores itself from the scores you already enter. Tap <strong>Post the money</strong> when it's done.</p>
       <p style="margin:0"><strong>Wolf</strong> (Tobacco Road): Rounds &rarr; Tobacco Road &rarr; <strong>Wolf</strong> for your foursome. The Wolf rotates, then picks a partner, goes lone or goes blind. You only enter the Wolf's call each hole.</p>`)}
    ${card('Money at a glance',
      row('Team event', '$200 a man, automatic') +
      row('Closest to pin', '$5 from each other player in the foursome') +
      row('Fines', '$10 each, into the one big fine pot') +
      row('Side games', 'Whatever the game\'s stake is') +
      `<div style="margin-top:6px">Everything nets into one balance per player on the <strong>Money</strong> tab. We settle up after Tobacco Road.</div>`)}
    ${card('Good to know', ul([
      '<strong>Wrong player?</strong> Teams &rarr; <strong>Not you? Switch player</strong>.',
      '<strong>Scorecard photos:</strong> Rounds &rarr; <strong>Scorecards &amp; verify</strong> to snap the paper card and check scores.',
      '<strong>Stuck or odd screen?</strong> Close the app fully and reopen it. Questions: ask the organizer.',
    ]))}
  </div>`;
}

// ---------- Live scoring ----------
// One place to see every match in play and jump straight into scoring.
function liveMatchBlock(state, e, mine) {
  const { session, course, match, results } = e;
  const n = course.holes.length;
  const lbl = matchStateLabel(results, n, sideShortLabel(state, session, match.sideA), sideShortLabel(state, session, match.sideB), maxPerHole(match.format));
  const next = Math.min(n, results.length + 1);
  const started = results.length > 0;
  return `
  <div style="${mine ? 'margin:0 20px 10px;border:3px solid var(--accent);border-radius:18px;padding:14px 16px 16px' : 'margin:0 20px 10px;border:1px solid var(--rule);border-radius:16px;padding:14px 16px 16px'}">
    <div style="font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:5px">${esc(course.name)} &middot; ${esc(gameFor(session).name)}${sessionCounts(session) ? '' : ' &middot; not for the cup'}</div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">
      <div style="font-size:15px;font-weight:800;letter-spacing:-.01em">${esc(playerNames(match.sideA))}</div>
      <div style="font-size:14px;font-weight:800;color:${started ? lbl.color : 'var(--muted)'};white-space:nowrap">${esc(started ? lbl.text : 'Not started')}</div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-top:2px">
      <div style="font-size:15px;font-weight:800;letter-spacing:-.01em;color:rgba(10,16,48,.75)">${esc(playerNames(match.sideB))}</div>
      <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">${started ? `thru ${results.length}` : 'tee off'}</div>
    </div>
    ${started ? holeStrip(results, n) : ''}
    ${started ? nassauChips(lbl.segments) : ''}
    <button data-action="open-card" data-match="${match.id}" class="btn btn-primary btn-block" style="margin-top:10px">${started ? `Score hole ${next}` : 'Start scoring'}</button>
  </div>`;
}

function renderLive(state) {
  const totals = cupTotals(state.sessions);
  const { live, notStarted } = liveMatchSets(state);
  const waiting = unsubmittedMatches(state);
  const me = state.ui.me;
  const isMine = (e) => me && e.match.sideA.concat(e.match.sideB).includes(me);
  const mineLive = live.concat(notStarted).filter(isMine);
  const section = (title) => sectionTitle(title);

  const mineBlock = mineLive.length
    ? section('Your match') + mineLive.map((e) => liveMatchBlock(state, e, true)).join('')
    : '';
  const others = live.filter((e) => !isMine(e));
  const othersBlock = others.length
    ? section(mineLive.length ? 'Also on the course' : 'On the course now') + others.map((e) => liveMatchBlock(state, e, false)).join('')
    : (mineLive.length ? '' : section('On the course now') + `<div style="padding:4px 18px 14px;font-size:13px;color:var(--muted)">Nothing is being played right now.</div>`);
  const waitingStart = notStarted.filter((e) => !isMine(e));
  const startBlock = waitingStart.length
    ? section('Set up, not started') + waitingStart.map((e) => liveMatchBlock(state, e, false)).join('')
    : '';
  const submitBlockLive = waiting.length ? `
    ${section('Finished &middot; needs submitting')}
    ${waiting.map(({ match }) => `
    <button data-action="open-card" data-match="${match.id}" style="display:flex;width:100%;justify-content:space-between;align-items:center;gap:10px;text-align:left;border:0;border-top:1px solid var(--rule);background:transparent;padding:12px 18px">
      <span style="font-size:14px;font-weight:800">${esc(playerNames(match.sideA))} v ${esc(playerNames(match.sideB))}</span>
      <span style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);white-space:nowrap">Submit &rarr;</span>
    </button>`).join('')}` : '';

  const latest = state.feed.filter((f) => f.isSystem).slice(0, 4);
  const latestBlock = latest.length ? `
    ${section('Latest')}
    ${latest.map((f) => `<div style="padding:9px 18px;border-top:1px solid var(--rule);font-size:12px;line-height:1.4"><span style="color:var(--muted)">${timeAgo(f.ts)}</span> &nbsp;${esc(f.text)}</div>`).join('')}` : '';

  return `
  <div>
    <button data-action="go-screen" data-screen="cup" style="display:flex;width:100%;justify-content:space-between;align-items:center;border:0;border-bottom:2px solid var(--rule);background:transparent;padding:12px 18px;text-align:left">
      <span style="font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">The Hawks Cup</span>
      <span style="font-size:18px;font-weight:800;letter-spacing:-.01em"><span style="color:var(--accent)">${fmtPoints(totals.team1)}</span> &ndash; <span style="color:var(--team2)">${fmtPoints(totals.team2)}</span></span>
    </button>
    ${mineBlock}
    ${othersBlock}
    ${startBlock}
    ${submitBlockLive}
    ${latestBlock}
    <div style="height:26px"></div>
  </div>`;
}

// A slim link under the header on every screen: always one tap back to live
// scoring.
function renderLiveBar(state) {
  if (state.ui.screen === 'live') return '';
  const { live } = liveMatchSets(state);
  const waiting = unsubmittedMatches(state).length;
  const label = live.length ? `&bull; ${live.length} live` : 'Live';
  const extra = waiting ? ` &middot; ${waiting} to submit` : '';
  return `<button data-action="go-screen" data-screen="live" style="flex:none;display:flex;justify-content:space-between;align-items:center;width:calc(100% - 40px);margin:0 20px 6px;border:0;border-radius:999px;background:${live.length || waiting ? 'var(--accent)' : 'var(--ink)'};color:#fff;padding:10px 16px;font-size:13px;font-weight:700;white-space:nowrap"><span>${label}${extra}</span><span>Live scoring &rarr;</span></button>`;
}

const SCREEN_RENDERERS = {
  foursome: renderFoursome, help: renderHelp, live: renderLive, side: renderSideList, sidedetail: renderSideDetail, sideedit: renderSideEdit, cup: renderCup, rounds: renderRounds, setup: renderSetup, card: renderCard,
  money: renderMoney, feed: renderFeed, team: renderTeams, trophy: renderTrophy, verify: renderVerify,
};

function renderHcpModal(state) {
  const id = state.ui.hcpEditPlayer;
  if (!id) return '';
  const p = PLAYERS_BY_ID[id];
  const warn = anyScoresEntered(state)
    ? `<div style="border:1px solid var(--accent);padding:10px;font-size:12px;line-height:1.45"><strong style="color:var(--accent)">Scores already entered.</strong> Changing a handicap recalculates net scores and match results for every hole already played, for everyone.</div>`
    : '';
  return `
  <div class="modal-backdrop" data-action="close-hcp">
    <div class="modal-sheet" data-action="noop">
      <div style="font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)">Handicap · ${esc(p.name)}</div>
      <label style="font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Handicap Index (e.g. 11.4) &middot; turned into a course handicap per round, max ${MAX_HCP}
        <input id="hcp-input" class="field-input" type="number" inputmode="decimal" step="0.1" min="-10" max="54" value="${p.hcp}" style="margin-top:4px">
      </label>
      ${warn}
      <div style="display:flex;gap:10px;margin-top:6px">
        <button data-action="close-hcp" class="btn btn-secondary" style="flex:1">Cancel</button>
        <button data-action="save-hcp" data-player="${id}" class="btn btn-primary" style="flex:1">Save</button>
      </div>
    </div>
  </div>`;
}

// First launch on a phone: pick Live or Practice and say who you are.
function renderWelcome(state) {
  const needCode = syncAvailable() && !state.ui.tripCode;
  const practiceJoin = state.ui.joinMode === 'practice';
  const names = PLAYERS.map((p) => `<button data-action="pick-me" data-player="${p.id}" class="btn btn-secondary" style="text-align:left">${p.name}</button>`).join('');
  return `
  <div class="modal-backdrop">
    <div class="modal-sheet" data-action="noop" style="max-height:92vh;overflow-y:auto">
      <div style="display:flex;align-items:center;gap:12px">
        <img src="./logo.png" alt="Hawks" width="52" height="50" style="width:52px;height:50px">
        <div style="font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)">Welcome to the Hawks Cup</div>
      </div>
      ${needCode ? `
      <div style="display:flex;gap:1px;background:var(--rule);border:1px solid var(--rule)">
        ${[['live', '2026 Live Tournament'], ['practice', 'Practice']].map(([id, name]) => {
          const on = (state.ui.joinMode || 'live') === id;
          return `<button data-action="join-mode" data-mode="${id}" style="flex:1;border:0;background:${on ? 'var(--accent)' : 'var(--bg)'};color:${on ? '#fff' : 'var(--ink)'};font-weight:800;font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:12px 6px">${name}</button>`;
        }).join('')}
      </div>
      <div style="font-size:12px;line-height:1.45;color:rgba(10,16,48,.7)">${practiceJoin
        ? 'Practice is a sandbox for testing the site. Nothing in it counts, and anyone can wipe it.'
        : 'The real tournament. Everyone in the group picks this one, so scores and money are shared live.'}</div>` : ''}
      <div style="font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Who are you?</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${names}</div>
    </div>
  </div>`;
}

let lastRenderedScreen = null;
let scrollTopRequested = false;
function requestScrollTop() { scrollTopRequested = true; }

const PRESERVED_FIELDS = ['feed-input', 'hcp-input',
  'money-player', 'money-dir', 'money-amount', 'money-note', 'payout-winner', 'payout-amount'].concat(SIDE_FIELD_IDS);

function render() {
  const state = getState();
  const ui = state.ui;
  applyHandicaps(state);

  // Remote changes can delete what this phone is looking at.
  if (ui.screen === 'card' && !(ui.cardMatchId && matchById(ui.cardMatchId))) ui.screen = 'rounds';
  if (ui.screen === 'setup' && !findSession(ui.setupSessionId)) ui.screen = 'rounds';
  if (ui.screen === 'verify' && !findSession(ui.verifySessionId)) ui.screen = 'rounds';
  if (ui.viewPhotoId && !state.photos.some((p) => p.id === ui.viewPhotoId)) ui.viewPhotoId = null;
  if (ui.scoreConflict && !matchById(ui.scoreConflict.matchId)) ui.scoreConflict = null;
  if (ui.screen === 'foursome' && !(ui.foursome && findSession(ui.foursome.sessionId))) ui.screen = 'rounds';

  // Re-rendering replaces the DOM, so carry over scroll position and any
  // half-typed text — otherwise a teammate's score arriving mid-keystroke
  // would eat what you were typing.
  const oldScroll = document.querySelector('.scroll');
  const scrollTop = oldScroll ? oldScroll.scrollTop : 0;
  const oldPhoto = document.querySelector('.photo-scroll');
  const photoPos = oldPhoto ? [oldPhoto.scrollTop, oldPhoto.scrollLeft] : null;
  const saved = {};
  PRESERVED_FIELDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) saved[id] = { value: el.value, focused: document.activeElement === el, start: el.selectionStart, end: el.selectionEnd };
  });

  const body = SCREEN_RENDERERS[ui.screen](state);
  const needsWelcome = !ui.me || (syncAvailable() && !ui.tripCode);
  document.getElementById('app').innerHTML = `
    <div class="viewport">
      ${renderHeader(state)}
      ${renderLiveBar(state)}
      <div class="scroll" style="flex:1;overflow-y:auto;overflow-x:hidden">${body}</div>
      ${renderTabBar(state)}
    </div>
    ${renderMoneyModal(state)}
    ${renderConflictModal(state)}
    ${renderHcpModal(state)}
    ${renderPhotoViewer(state)}
    ${needsWelcome ? renderWelcome(state) : ''}
  `;

  const newScroll = document.querySelector('.scroll');
  if (newScroll) newScroll.scrollTop = (scrollTopRequested || ui.screen !== lastRenderedScreen) ? 0 : scrollTop;
  scrollTopRequested = false;
  lastRenderedScreen = ui.screen;
  const newPhoto = document.querySelector('.photo-scroll');
  if (newPhoto && photoPos) { newPhoto.scrollTop = photoPos[0]; newPhoto.scrollLeft = photoPos[1]; }

  if (typeof checkCelebrations === 'function') checkCelebrations(state);

  Object.keys(saved).forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = saved[id].value;
    if (saved[id].focused) {
      el.focus();
      try { el.setSelectionRange(saved[id].start, saved[id].end); } catch (e) { /* select/number inputs */ }
    }
  });
}

