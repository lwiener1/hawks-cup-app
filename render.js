// Builds the whole app as one HTML string per render. Simple, and plenty
// fast at this scale — event handling is delegated once in main.js rather
// than re-bound after every render.

function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const TABS = [
  { id: 'cup', name: 'Cup' }, { id: 'rounds', name: 'Rounds' }, { id: 'money', name: 'Money' },
  { id: 'feed', name: 'Feed' }, { id: 'team', name: 'Teams' },
];

function headerInfo(state) {
  const screen = state.ui.screen;
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
  const map = {
    cup: { kicker: 'Standings', title: 'The Hawks Cup', right: new Date().toLocaleDateString('en-US', { weekday: 'short' }) },
    rounds: { kicker: 'Schedule', title: 'Sessions', right: '5 rounds' },
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
  const total = state.ledger.filter((e) => e.amount > 0).reduce((a, e) => a + e.amount, 0);
  return `$${total} moved`;
}

function renderHeader(state) {
  const info = headerInfo(state);
  const showBack = state.ui.screen === 'card' || state.ui.screen === 'setup' || state.ui.screen === 'trophy';
  return `
  <div style="flex:none;padding:env(safe-area-inset-top,20px) 18px 10px;border-bottom:2px solid var(--rule);display:flex;align-items:flex-end;gap:10px;background:var(--bg)">
    <button data-action="go-back" style="display:${showBack ? 'flex' : 'none'};align-items:center;justify-content:center;width:26px;height:26px;padding:0;margin-bottom:2px;border:1px solid var(--rule);background:transparent;color:var(--ink);font-size:14px;line-height:1">&larr;</button>
    <img src="./logo.png" alt="Hawks" width="38" height="36" style="flex:none;display:${showBack ? 'none' : 'block'};width:38px;height:36px;margin-bottom:1px">
    <div style="flex:1;min-width:0">
      <div style="font-size:9px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--accent)">${esc(info.kicker)}</div>
      <div style="font-size:21px;font-weight:800;letter-spacing:-.015em;line-height:1.1">${esc(info.title)}</div>
    </div>
    <div style="text-align:right;padding-bottom:3px;white-space:nowrap">
      <div style="font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">${esc(info.right)}</div>
      ${SYNC_LABELS[Sync.status] ? `<div style="font-size:8px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:${SYNC_LABELS[Sync.status][1]}">&bull; ${SYNC_LABELS[Sync.status][0]}</div>` : ''}
    </div>
  </div>`;
}

function renderTabBar(state) {
  const screen = state.ui.screen;
  return `
  <div style="flex:none;display:flex;background:var(--rule);gap:1px;border-top:2px solid var(--rule);padding-bottom:env(safe-area-inset-bottom,14px)">
    ${TABS.map((t) => `
      <button data-action="go-screen" data-screen="${t.id}" style="flex:1;border:0;background:${screen === t.id ? 'var(--ink)' : 'var(--bg)'};color:${screen === t.id ? 'var(--bg)' : 'rgba(32,30,29,.75)'};font-weight:800;font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;padding:12px 2px 10px">${t.name}</button>
    `).join('')}
  </div>`;
}

function holeFill(r) {
  return r > 0 ? 'var(--accent)' : r < 0 ? 'var(--ink)' : 'var(--rule-soft)';
}

// "Front LAWDs 2 UP · Back — · Total LAWDs 1 UP", one chip per Nassau bet.
function nassauChips(segments) {
  return `<div style="display:flex;gap:1px;background:var(--rule);border:1px solid var(--rule);margin-top:9px">${segments.map((s) => `
    <div style="flex:1;min-width:0;background:var(--bg);padding:5px 6px">
      <div style="font-size:8px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:rgba(32,30,29,.45)">${s.label}${s.final ? ' &middot; final' : ''}</div>
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
function renderCup(state) {
  const totals = cupTotals(state.sessions);
  const pct = (n) => `${(n / (totals.available || 1)) * 100}%`;
  const live = allMatches(state).filter(({ label }) => !label.done && label.text !== 'Not started');

  const liveRows = live.map(({ session, course, match, results, label }) => {
    const shortA = playerNames(match.sideA), shortB = playerNames(match.sideB);
    const lbl = matchStateLabel(results, course.holes.length, sideShortLabel(state, session, match.sideA), sideShortLabel(state, session, match.sideB), maxPerHole(match.format));
    return `
    <button data-action="open-card" data-match="${match.id}" style="display:block;width:100%;text-align:left;border:0;border-top:1px solid var(--rule);background:transparent;padding:12px 18px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">
        <div style="font-size:14px;font-weight:800;letter-spacing:-.01em">${esc(shortA)}</div>
        <div style="font-size:13px;font-weight:800;color:${lbl.color};white-space:nowrap">${esc(lbl.text)}</div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-top:3px">
        <div style="font-size:14px;font-weight:800;letter-spacing:-.01em;color:rgba(32,30,29,.75)">${esc(shortB)}</div>
        <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">thru ${results.length}</div>
      </div>
      ${holeStrip(results, course.holes.length)}
      ${nassauChips(lbl.segments)}
    </button>`;
  }).join('') || `<div style="padding:14px 18px;font-size:13px;color:var(--muted)">Nothing live right now.</div>`;

  const sessionRows = state.sessions.map((session, idx) => {
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
    <button data-action="${status === 'not-set' ? 'open-setup' : 'open-rounds'}" data-session="${session.id}" style="display:flex;width:100%;gap:12px;align-items:center;text-align:left;border:0;border-top:1px solid var(--rule);background:${idx % 2 ? 'var(--row-alt)' : 'transparent'};padding:11px 18px">
      <div style="font-size:11px;font-weight:800;color:rgba(32,30,29,.35);width:14px">${session.n}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:800;letter-spacing:-.01em">${esc(course.name)}</div>
        <div style="font-size:11px;color:var(--muted)">${esc(fmt)}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:14px;font-weight:800;color:${resColor}">${esc(result)}</div>
        <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">${esc(session.day)}</div>
      </div>
    </button>`;
  }).join('');

  return `
  <div style="display:flex;flex-direction:column">
    <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:20px 18px 18px;border-bottom:2px solid var(--rule)">
      <div>
        <div style="font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:2px">${esc(state.teamOneName)}</div>
        <div style="font-size:62px;font-weight:800;line-height:.9;letter-spacing:-.04em;color:var(--accent)">${fmtPoints(totals.team1)}</div>
      </div>
      <div style="font-size:11px;font-weight:800;letter-spacing:.1em;color:rgba(32,30,29,.35);padding:0 6px">V</div>
      <div style="text-align:right">
        <div style="font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:2px">${esc(state.teamTwoName)}</div>
        <div style="font-size:62px;font-weight:800;line-height:.9;letter-spacing:-.04em">${fmtPoints(totals.team2)}</div>
      </div>
    </div>
    <div style="display:flex;height:8px;border-bottom:2px solid var(--rule)">
      <div style="width:${pct(totals.team1)};background:var(--accent)"></div>
      <div style="width:${pct(Math.max(0, totals.available - totals.team1 - totals.team2))};background:var(--rule-soft)"></div>
      <div style="width:${pct(totals.team2)};background:var(--ink)"></div>
    </div>
    <div style="display:flex;justify-content:space-between;padding:7px 18px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);border-bottom:2px solid var(--rule)">
      <span>${fmtPoints(totals.settled)} of ${fmtPoints(totals.available)} settled</span><span>${fmtPoints(totals.toWin)} wins the cup</span>
    </div>
    <div style="padding:14px 18px 6px;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)">On the course now</div>
    ${liveRows}
    <div style="border-top:2px solid var(--rule);padding:14px 18px 6px;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)">Sessions</div>
    ${sessionRows}
    <button data-action="go-screen" data-screen="trophy" class="btn btn-secondary btn-block" style="margin:16px 18px 24px;width:calc(100% - 36px)">Cup projection &amp; awards &rarr;</button>
  </div>`;
}

// ---------- Rounds ----------
function renderRounds(state) {
  return state.sessions.map((session) => {
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
        const showScore = !label.done;
        return `
        <div style="display:flex;gap:10px;align-items:center;border-top:1px solid var(--rule);padding:9px 0">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:800">${esc(playerNames(m.sideA))}</div>
            <div style="font-size:13px;font-weight:800;color:rgba(32,30,29,.7)">${esc(playerNames(m.sideB))}</div>
          </div>
          <div style="font-size:12px;font-weight:800;color:${label.color};text-align:right;white-space:nowrap">${esc(label.text)}${(label.done || results.length === 0) ? '' : ` · ${results.length}`}</div>
          <button data-action="open-card" data-match="${m.id}" style="display:${showScore ? 'inline-block' : 'none'};border:1px solid var(--accent);background:transparent;color:var(--accent);font-weight:800;font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:6px 9px">Score</button>
        </div>
        ${results.length ? `<div style="margin:-2px 0 9px">${nassauChips(label.segments)}</div>` : ''}`;
      }).join('');
    }

    return `
    <div style="border-bottom:2px solid var(--rule);padding:14px 18px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
        <div style="font-size:9px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)">Session ${session.n} · ${esc(session.day)}</div>
        <div style="font-size:9px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)">${statusLabel}</div>
      </div>
      <div style="font-size:24px;font-weight:800;letter-spacing:-.02em;line-height:1.1;margin:2px 0 1px">${esc(course.name)}</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:10px">${esc(fmtLine)}</div>
      ${matchRows}
      <button data-action="open-setup" data-session="${session.id}" style="margin-top:8px;border:1px solid var(--rule);background:transparent;font-weight:800;font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:7px 10px;color:var(--ink)">Edit format &amp; pairings</button>
    </div>`;
  }).join('');
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

  const gameBtns = GAMES.filter((g) => g.shape === game.shape).map((g) => {
    const on = g.id === session.format;
    return `<button data-action="pick-game" data-session="${session.id}" data-game="${g.id}" style="border:0;background:${on ? 'var(--accent)' : 'var(--bg)'};color:${on ? '#fff' : 'var(--ink)'};text-align:left;padding:10px;display:flex;justify-content:space-between;align-items:baseline;gap:8px">
      <span style="font-weight:800;font-size:12px">${g.name}</span><span style="font-size:10px;opacity:.65">${g.note}</span>
    </button>`;
  }).join('');

  const countsBtns = [{ v: true, name: 'Counts' }, { v: false, name: 'Doesn’t count' }].map((o) => {
    const on = counts === o.v;
    return `<button data-action="${on ? 'noop' : 'toggle-counts'}" data-session="${session.id}" style="flex:1;border:0;background:${on ? 'var(--accent)' : 'var(--bg)'};color:${on ? '#fff' : 'var(--ink)'};font-weight:800;font-size:12px;padding:11px 8px;text-align:left">${o.name}</button>`;
  }).join('');
  const matchCount = session.shape === 'singles' ? 4 : 2;
  const teamEvent = `
    <div>
      <div style="font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:7px">Team event</div>
      <div style="display:flex;background:var(--rule);gap:1px;border:1px solid var(--rule)">${countsBtns}</div>
      <div style="font-size:12px;line-height:1.5;color:rgba(32,30,29,.7);margin-top:7px">${counts
        ? `Nassau: front, back and overall are 1 point each. ${matchCount} matches &times; 3 = <strong>${matchCount * 3} points</strong> on offer.`
        : 'Still played as a Nassau, but none of it counts toward the Hawks Cup points.'}</div>
    </div>
    <div>
      <div style="font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:7px">Handicap</div>
      <div style="border:1px solid var(--rule);padding:9px 10px;font-size:12px;font-weight:800">${session.shape === 'singles' ? 'Full difference' : '90% of handicap, strokes off the low player'} &middot; max ${MAX_HCP}</div>
    </div>`;

  // One dropdown per player slot. Slot k of a team's order is who plays in
  // that position; choosing someone already placed swaps the two.
  const perSide = session.shape === 'singles' ? 1 : 2;
  const slotSelect = (team, slot) => {
    const order = team === 'L' ? session.teamLOrder : session.teamTOrder;
    const roster = PLAYERS.filter((p) => p.team === team);
    const opts = roster.map((p) => `<option value="${p.id}"${p.id === order[slot] ? ' selected' : ''}>${p.name} (${p.hcp})</option>`).join('');
    return `<select data-action="set-slot" data-session="${session.id}" data-team="${team}" data-slot="${slot}" class="field-input" style="padding:9px 8px;border-left:4px solid ${team === 'L' ? 'var(--accent)' : 'var(--ink)'}">${opts}</select>`;
  };
  const sideCol = (team, matchIdx) => Array.from({ length: perSide }, (_, k) => slotSelect(team, matchIdx * perSide + k)).join('');
  const pairRows = pairings.map((p, i) => `
    <div style="padding:10px;border-bottom:1px solid var(--rule)">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
        <div style="font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Match ${i + 1}</div>
        <div style="font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);text-align:right">${esc(pairingStrokesNote(p.sideA, p.sideB))}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center">
        <div style="display:flex;flex-direction:column;gap:6px">${sideCol('L', i)}</div>
        <div style="font-size:10px;font-weight:800;letter-spacing:.1em;color:rgba(32,30,29,.35)">V</div>
        <div style="display:flex;flex-direction:column;gap:6px">${sideCol('T', i)}</div>
      </div>
    </div>`).join('');
  const hasScores = session.matches.some((m) => Object.keys(m.grossScores).some((id) => Object.keys(m.grossScores[id]).length));

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
    ${teamEvent}
    <div>
      <div style="font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:4px">Who plays whom &mdash; ${session.shape === 'singles' ? '4 singles matches' : pairings.length + ' matches'}</div>
      <div style="font-size:12px;line-height:1.45;color:rgba(32,30,29,.7);margin-bottom:8px">${esc(state.teamOneName)} on the left, ${esc(state.teamTwoName)} on the right. Tap a name to change it &mdash; picking someone already in another match swaps the two. (Handicap in brackets.)</div>
      <div style="border:1px solid var(--rule)">${pairRows}</div>
    </div>
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
  const strokes = handicapAllocation(ids);
  const nets = {};
  ids.forEach((id) => { nets[id] = netScore(view.gross[id], strokes[id], hole.si); });
  const bd = holeBreakdown(match, hole, view.gross);
  const holeDelta = bd.result;
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
  const holeResultColor = holeDelta > 0 ? 'var(--accent)' : holeDelta < 0 ? 'var(--ink)' : 'rgba(32,30,29,.6)';

  const cardHoles = course.holes.map((h, i) => {
    let fill;
    if (i < committedResults.length) fill = holeFill(committedResults[i]);
    else if (i === view.holeIdx) fill = holeFill(holeDelta);
    else fill = 'var(--rule-faint)';
    const ring = i === view.holeIdx ? '2px solid var(--accent)' : 'none';
    return `<button data-action="go-to-hole" data-match="${match.id}" data-idx="${i}" style="flex:1;border:0;padding:0;background:transparent">
      <div style="height:20px;background:${fill};outline:${ring};outline-offset:-2px"></div>
      <div style="font-size:7px;font-weight:800;color:rgba(32,30,29,.45);margin-top:2px">${h.n}</div>
    </button>`;
  }).join('');

  const entryRows = ids.map((id) => {
    const p = PLAYERS_BY_ID[id];
    const shots = shotsOnHole(strokes[id], hole.si);
    const net = nets[id];
    return `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 18px;border-bottom:1px solid var(--rule);background:${p.team === 'L' ? 'transparent' : 'rgba(32,30,29,.04)'}">
      <div style="width:9px;height:9px;flex:none;background:${p.team === 'L' ? 'var(--accent)' : 'var(--ink)'}"></div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:5px">
          <span style="font-size:14px;font-weight:800">${p.name}</span>
          <span style="font-size:11px;font-weight:800;color:var(--accent)">${shots === 0 ? '' : shots === 1 ? '•' : '••'}</span>
        </div>
        <div style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Hcp ${p.hcp} · plays off ${strokes[id]} · net ${net}</div>
      </div>
      <div style="display:flex;border:1px solid var(--rule)">
        <button data-action="step-gross" data-match="${match.id}" data-player="${id}" data-delta="-1" style="width:32px;height:34px;border:0;border-right:1px solid var(--rule);background:transparent;font-size:15px;font-weight:800">&minus;</button>
        <div style="width:38px;height:34px;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:800">${view.gross[id]}</div>
        <button data-action="step-gross" data-match="${match.id}" data-player="${id}" data-delta="1" style="width:32px;height:34px;border:0;border-left:1px solid var(--rule);background:transparent;font-size:15px;font-weight:800">+</button>
      </div>
    </div>`;
  }).join('');

  const tagBtns = TAG_TYPES.map((t) => {
    const on = view.tags.includes(t);
    return `<button data-action="toggle-tag" data-match="${match.id}" data-tag="${t}" style="flex:1 0 auto;border:0;background:${on ? 'var(--accent)' : 'var(--bg)'};color:${on ? '#fff' : 'var(--ink)'};font-weight:800;font-size:11px;letter-spacing:.04em;text-transform:uppercase;padding:9px 11px">${t}</button>`;
  }).join('');

  return `
  <div>
    <div style="display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:13px 18px;border-bottom:2px solid var(--rule)">
      <div>
        <div style="font-size:13px;font-weight:800">${esc(shortA)}</div>
        <div style="font-size:13px;font-weight:800;color:rgba(32,30,29,.7)">${esc(shortB)}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:19px;font-weight:800;color:${headerLabel.color};line-height:1">${esc(headerLabel.text)}</div>
        <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">thru ${committedResults.length}</div>
      </div>
    </div>
    <div style="padding:0 18px 12px;border-bottom:2px solid var(--rule);margin-top:-1px">
      ${nassauChips(headerLabel.segments)}
      <div style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-top:6px">${esc(gameFor(session).name)} &middot; Nassau &middot; ${sessionCounts(session) ? 'counts toward the team event' : 'does not count toward the team event'}</div>
    </div>
    <div style="display:flex;gap:2px;padding:10px 18px;border-bottom:1px solid var(--rule)">${cardHoles}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 18px;border-bottom:2px solid var(--rule)">
      <button data-action="step-hole" data-match="${match.id}" data-delta="-1" style="border:1px solid var(--rule);background:transparent;font-weight:800;font-size:16px;width:34px;height:34px">&larr;</button>
      <div style="text-align:center">
        <div style="font-size:9px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)">Hole ${hole.n}</div>
        <div style="font-size:15px;font-weight:800;letter-spacing:-.01em">Par ${hole.par} · ${hole.yds ? hole.yds + ' yds · ' : ''}SI ${hole.si}</div>
      </div>
      <button data-action="step-hole" data-match="${match.id}" data-delta="1" style="border:1px solid var(--rule);background:transparent;font-weight:800;font-size:16px;width:34px;height:34px">&rarr;</button>
    </div>
    ${entryRows}
    <div style="padding:12px 18px;border-bottom:2px solid var(--rule);display:flex;justify-content:space-between;align-items:baseline">
      <div style="font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)">This hole</div>
      <div style="font-size:15px;font-weight:800;color:${holeResultColor}">${esc(holeResultText)}</div>
    </div>
    <div style="padding:12px 18px 8px;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)">Tag the hole</div>
    <div style="display:flex;flex-wrap:wrap;gap:1px;background:var(--rule);margin:0 18px;border:1px solid var(--rule)">${tagBtns}</div>
    <button data-action="post-hole" data-match="${match.id}" class="btn btn-primary btn-block" style="margin:16px 18px 26px;width:calc(100% - 36px)">Post hole ${hole.n} &amp; advance</button>
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
    const skinEvents = state.sideGameEvents.filter((e) => e.type === 'Skin').sort((a, b) => b.ts - a.ts);
    const ctpEvents = state.sideGameEvents.filter((e) => e.type !== 'Skin').sort((a, b) => b.ts - a.ts);
    const skinRows = skinEvents.length ? skinEvents.map((e) => `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 18px;border-bottom:1px solid var(--rule)">
        <div style="font-size:11px;font-weight:800;color:rgba(32,30,29,.35);width:22px">${e.holeN}</div>
        <div style="flex:1;font-size:13px;font-weight:800">${esc(PLAYERS_BY_ID[e.playerId].name)}</div>
        <div style="font-size:11px;color:var(--muted)">won it outright</div>
        <div style="font-size:13px;font-weight:800;color:var(--accent);width:46px;text-align:right">$${e.amount}</div>
      </div>`).join('') : `<div style="padding:12px 18px;font-size:13px;color:var(--muted)">No skins tagged yet — tag one from a match's Score screen.</div>`;
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
        <div style="font-size:12px;line-height:1.45;color:rgba(32,30,29,.7);margin-top:6px">Skins, CTPs and greenies get tagged from the Score screen while you play — whoever has the best net on a tagged hole wins it.</div>
      </div>
      ${skinRows}
      <div style="padding:16px 18px 6px;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);border-top:2px solid var(--rule)">Closest to pin &amp; greenies</div>
      ${ctpRows}
      <div style="height:26px"></div>`;
  } else {
    const totals = ledgerTotals(state);
    const rows = PLAYERS.slice().sort((a, b) => totals[b.id] - totals[a.id]).map((p) => `
      <div style="display:flex;align-items:center;gap:10px;padding:11px 18px;border-bottom:1px solid var(--rule)">
        <div style="width:9px;height:9px;flex:none;background:${p.team === 'L' ? 'var(--accent)' : 'var(--ink)'}"></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:800">${p.name}</div>
          <div style="font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted)">${esc(ledgerDetail(state, p.id))}</div>
        </div>
        <div style="font-size:16px;font-weight:800;color:${totals[p.id] > 0 ? 'var(--accent)' : totals[p.id] < 0 ? 'var(--muted)' : 'var(--ink)'};text-align:right;min-width:62px">${fmtMoney(totals[p.id])}</div>
      </div>`).join('');
    const net = Object.values(totals).reduce((a, b) => a + b, 0);
    const moved = state.ledger.filter((e) => e.amount > 0).reduce((a, e) => a + e.amount, 0);
    body = `
      <div style="padding:14px 18px;border-bottom:2px solid var(--rule);font-size:12px;line-height:1.45;color:rgba(32,30,29,.7)">Skins, greenies, CTPs and fines net into one balance per man. Nobody pays anybody until Tobacco Road is in the books.</div>
      ${rows}
      <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:2px solid var(--rule);background:var(--row-alt)">
        <div style="font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase">Pot in play</div>
        <div style="font-size:18px;font-weight:800">${fmtMoney(net)} net · $${moved} moved</div>
      </div>
      <button data-action="open-fines" style="display:block;width:calc(100% - 36px);margin:16px 18px 26px;border:1px solid var(--rule);background:transparent;font-weight:800;font-size:12px;letter-spacing:.06em;text-transform:uppercase;padding:11px;text-align:left;color:var(--ink)">Charge a fine</button>`;
  }

  return `<div><div style="display:flex;gap:1px;background:var(--rule);border-bottom:2px solid var(--rule)">${tabs}</div>${body}</div>`;
}

function renderFinesModal(state) {
  if (!state.ui.finesOpen) return '';
  const playerOpts = PLAYERS.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
  const fineOpts = FINE_TYPES.map((f) => `<option value="${esc(f)}">${esc(f)}</option>`).join('');
  return `
  <div class="modal-backdrop" data-action="close-fines-backdrop">
    <div class="modal-sheet" data-action="noop">
      <div style="font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)">Charge a fine</div>
      <label style="font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Player
        <select id="fine-player" class="field-input" style="margin-top:4px">${playerOpts}</select>
      </label>
      <label style="font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Fine
        <select id="fine-type" class="field-input" style="margin-top:4px">${fineOpts}</select>
      </label>
      <label style="font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Amount ($)
        <input id="fine-amount" class="field-input" type="number" min="1" max="200" value="10" style="margin-top:4px">
      </label>
      <div style="display:flex;gap:10px;margin-top:6px">
        <button data-action="close-fines" class="btn btn-secondary" style="flex:1">Cancel</button>
        <button data-action="submit-fine" class="btn btn-primary" style="flex:1">Charge it</button>
      </div>
    </div>
  </div>`;
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
        <div style="font-size:10px;color:rgba(32,30,29,.45)">${timeAgo(f.ts)}</div>
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
    { name: state.teamTwoName, captain: 'Tom', team: 'T', bg: 'var(--ink)', fg: '#fff' },
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
          <div style="font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--accent)">hcp · edit</div>
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
      <div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:800">${esc(c.name)}</div><div style="font-size:11px;color:var(--muted)">${c.extra ? esc(c.note) : `Par ${c.par} · ${c.holes.reduce((a, h) => a + h.yds, 0).toLocaleString()} · ${esc(c.note)}`}</div></div>
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
  return `
  <div style="border-top:2px solid var(--rule);margin-top:14px;padding:14px 18px 30px;display:flex;flex-direction:column;gap:8px">
    <div style="font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)">This phone</div>
    <div style="font-size:12px;line-height:1.45;color:rgba(32,30,29,.7)">Playing as <strong>${esc(myName(state))}</strong>${code ? ` &middot; trip code <strong>${esc(code)}</strong>` : syncAvailable() ? '' : ' &middot; saving on this phone only'}.</div>
    <button data-action="forget-me" style="${btn}">Not you? Switch player</button>
    ${code ? `<button data-action="share-invite" style="${btn}">Copy invite link for the group</button>` : ''}
    <button data-action="reset-trip" data-kind="fresh" style="${btn};color:var(--accent);border-color:var(--accent)">Clear everything &amp; start the trip</button>
    <button data-action="reset-trip" data-kind="sample" style="${btn}">Load the sample trip</button>
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
      <div style="font-size:13px;font-weight:800;text-align:right;white-space:nowrap">${esc(a.who)}</div>
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
    <div style="padding:14px 18px;border-bottom:2px solid var(--rule);font-size:12px;line-height:1.45;color:rgba(32,30,29,.7)">${esc(note)}</div>
    <div style="padding:14px 18px 6px;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)">Awards on the table</div>
    ${awardRows}
    <div style="height:26px"></div>
  </div>`;
}

const SCREEN_RENDERERS = {
  cup: renderCup, rounds: renderRounds, setup: renderSetup, card: renderCard,
  money: renderMoney, feed: renderFeed, team: renderTeams, trophy: renderTrophy,
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
      <label style="font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Whole number &middot; anything above ${MAX_HCP} plays as ${MAX_HCP} (minus sign for plus-handicaps)
        <input id="hcp-input" class="field-input" type="number" inputmode="numeric" step="1" min="-10" max="54" value="${p.hcp}" style="margin-top:4px">
      </label>
      ${warn}
      <div style="display:flex;gap:10px;margin-top:6px">
        <button data-action="close-hcp" class="btn btn-secondary" style="flex:1">Cancel</button>
        <button data-action="save-hcp" data-player="${id}" class="btn btn-primary" style="flex:1">Save</button>
      </div>
    </div>
  </div>`;
}

// First launch on a phone: join the trip (code) and say who you are.
function renderWelcome(state) {
  const needCode = syncAvailable() && !state.ui.tripCode;
  const names = PLAYERS.map((p) => `<button data-action="pick-me" data-player="${p.id}" class="btn btn-secondary" style="text-align:left">${p.name}</button>`).join('');
  return `
  <div class="modal-backdrop">
    <div class="modal-sheet" data-action="noop" style="max-height:92vh;overflow-y:auto">
      <div style="display:flex;align-items:center;gap:12px">
        <img src="./logo.png" alt="Hawks" width="52" height="50" style="width:52px;height:50px">
        <div style="font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)">Welcome to the Hawks Cup</div>
      </div>
      ${needCode ? `
      <label style="font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Trip code (from the group text)
        <input id="trip-code-input" class="field-input" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="e.g. hawks-7k2q" style="margin-top:4px">
      </label>` : ''}
      <div style="font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Who are you?</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${names}</div>
    </div>
  </div>`;
}

let lastRenderedScreen = null;
let scrollTopRequested = false;
function requestScrollTop() { scrollTopRequested = true; }

const PRESERVED_FIELDS = ['feed-input', 'trip-code-input', 'fine-player', 'fine-type', 'fine-amount', 'hcp-input'];

function render() {
  const state = getState();
  const ui = state.ui;
  applyHandicaps(state);

  // Remote changes can delete what this phone is looking at.
  if (ui.screen === 'card' && !(ui.cardMatchId && matchById(ui.cardMatchId))) ui.screen = 'rounds';
  if (ui.screen === 'setup' && !findSession(ui.setupSessionId)) ui.screen = 'rounds';

  // Re-rendering replaces the DOM, so carry over scroll position and any
  // half-typed text — otherwise a teammate's score arriving mid-keystroke
  // would eat what you were typing.
  const oldScroll = document.querySelector('.scroll');
  const scrollTop = oldScroll ? oldScroll.scrollTop : 0;
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
      <div class="scroll" style="flex:1;overflow-y:auto;overflow-x:hidden">${body}</div>
      ${renderTabBar(state)}
    </div>
    ${renderFinesModal(state)}
    ${renderHcpModal(state)}
    ${needsWelcome ? renderWelcome(state) : ''}
  `;

  const newScroll = document.querySelector('.scroll');
  if (newScroll) newScroll.scrollTop = (scrollTopRequested || ui.screen !== lastRenderedScreen) ? 0 : scrollTop;
  scrollTopRequested = false;
  lastRenderedScreen = ui.screen;

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

