// Side matches: individual games played alongside the team event. Anyone can
// set one up (any players, any round(s), any holes, match play / stableford /
// stroke play, net / gross / custom strokes, their own stake) and the app
// scores it from the gross scores already entered in the team matches, so
// nothing is typed in twice. Loaded before render.js, which registers the
// three screens below.

const SIDE_FORMATS = [
  { id: 'match', name: 'Match play', note: 'Head to head, hole by hole. Exactly 2 players.' },
  { id: 'stableford', name: 'Stableford', note: 'Points on every hole, most points wins.' },
  { id: 'stroke', name: 'Stroke play', note: 'Total score, lowest wins.' },
];
const SIDE_BASES = [
  { id: 'net', name: 'Net', note: 'Handicap strokes from each player\'s course handicap (strokes off the low player in match play).' },
  { id: 'gross', name: 'Gross', note: 'No strokes at all.' },
  { id: 'custom', name: 'Custom strokes', note: 'You set how many strokes each player gets per round.' },
];
const SIDE_RANGES = [
  { id: 'all', name: 'All 18' }, { id: 'front', name: 'Front 9' }, { id: 'back', name: 'Back 9' }, { id: 'custom', name: 'Custom holes' },
];
const SIDE_PAYOUTS = [
  { id: 'winner', name: 'Winner takes all', note: 'A tie splits the pot.' },
  { id: 'places', name: '60 / 30 / 10', note: 'Top three share the pot (top two if only 2–3 play).' },
  { id: 'none', name: 'No money', note: 'Just for bragging rights.' },
];
const SIDE_PRESETS = {
  standard: { albatross: 5, eagle: 4, birdie: 3, par: 2, bogey: 1, dbl: 0 },
  modified: { albatross: 8, eagle: 5, birdie: 2, par: 0, bogey: -1, dbl: -3 },
};
const SIDE_POINT_KEYS = [
  ['albatross', 'Albatross'], ['eagle', 'Eagle'], ['birdie', 'Birdie'], ['par', 'Par'], ['bogey', 'Bogey'], ['dbl', 'Double +'],
];
// every text/number field on the setup form (render.js keeps them across redraws)
const SIDE_FIELD_IDS = ['sd-name', 'sd-allowance', 'sd-stake', 'sd-notes', 'sd-from', 'sd-to']
  .concat(SIDE_POINT_KEYS.map((k) => 'sd-pt-' + k[0]))
  .concat(PLAYERS.map((p) => 'sd-strokes-' + p.id));

// ---- scoring --------------------------------------------------------------------

function sideSessions(state, sm) {
  return state.sessions.filter((s) => sm.sessionIds.includes(s.id));
}

function sideHoleInRange(sm, n, total) {
  if (sm.range === 'front') return n <= total / 2;
  if (sm.range === 'back') return n > total / 2;
  if (sm.range === 'custom') return n >= (Number(sm.from) || 1) && n <= (Number(sm.to) || total);
  return true;
}

// A player's gross on a hole of a round: it lives in whichever team match he played in.
function sideGross(session, playerId, holeN) {
  for (const m of session.matches) {
    const g = m.grossScores && m.grossScores[playerId];
    if (g && g[holeN] != null) return g[holeN];
  }
  return null;
}

// Strokes each player gets in one round.
function sideStrokesFor(sm, session) {
  const out = {};
  const players = sm.players.filter((id) => PLAYERS_BY_ID[id]);
  if (sm.basis === 'gross') { players.forEach((id) => { out[id] = 0; }); return out; }
  if (sm.basis === 'custom') { players.forEach((id) => { out[id] = Math.max(0, Math.round(Number((sm.strokes || {})[id]) || 0)); }); return out; }
  const allow = (Number(sm.allowance) || 100) / 100;
  const ph = {};
  players.forEach((id) => { ph[id] = Math.round(Math.min(courseHandicapFor(id, session), MAX_HCP) * allow); });
  // match play plays off the low player; stableford and stroke play use each player's own handicap
  const low = sm.format === 'match' ? Math.min.apply(null, players.map((id) => ph[id])) : 0;
  players.forEach((id) => { out[id] = ph[id] - low; });
  return out;
}

function computeSide(state, sm) {
  const players = sm.players.filter((id) => PLAYERS_BY_ID[id]);
  const table = Object.assign({}, STABLEFORD_STD, sm.points || {});
  const holes = [];
  const strokes = {};   // sessionId -> {playerId: strokes}
  sideSessions(state, sm).forEach((session) => {
    strokes[session.id] = sideStrokesFor(sm, session);
    const course = courseFor(session);
    course.holes.forEach((hole) => {
      if (sideHoleInRange(sm, hole.n, course.holes.length)) holes.push({ session, course, hole });
    });
  });

  const cells = {};
  players.forEach((id) => {
    cells[id] = holes.map(({ session, hole }) => {
      const gross = sideGross(session, id, hole.n);
      if (gross == null) return { has: false };
      const net = gross - shotsOnHole(strokes[session.id][id] || 0, hole.si);
      return { has: true, gross, net, pts: stablefordPts(net, hole.par, table), par: hole.par };
    });
  });

  // Every side match is a Nassau: three bets over the holes you picked, the
  // front half, the back half and the whole thing, each scored the same way.
  // Only holes everyone has a score for count, so nobody is judged on a
  // different set of holes.
  const n = holes.length;
  const half = Math.ceil(n / 2);
  const range = (from, to) => Array.from({ length: Math.max(0, to - from) }, (_, k) => from + k);
  const eighteen = n === 18, twoRounds = n === 36 && sm.sessionIds.length === 2;
  const defs = [
    { key: 'front', label: eighteen ? 'Front 9' : twoRounds ? 'Round 1' : 'First half', idx: range(0, half) },
    { key: 'back', label: eighteen ? 'Back 9' : twoRounds ? 'Round 2' : 'Second half', idx: range(half, n) },
    { key: 'total', label: 'Overall', idx: range(0, n) },
  ].filter((d) => d.idx.length);
  const segments = defs.map((d) => Object.assign({ key: d.key, label: d.label, idx: d.idx }, sideSegment(sm, players, cells, d.idx)));
  const total = segments.find((s) => s.key === 'total') || { counted: [], tot: {}, complete: false, matchHoles: {}, standings: [], status: 'Not started', leaders: [], size: 0 };

  // The headline (standings, status, hole table) is the overall bet.
  return {
    sm, holes, players, strokes, cells, segments, nassau: true,
    counted: total.counted, tot: total.tot, complete: total.complete, total: n, thru: total.counted.length,
    matchHoles: total.matchHoles, matchDiff: total.matchDiff, standings: total.standings, status: total.status, leaders: total.leaders,
  };
}

// One bet of the Nassau: a set of hole indexes scored for the players.
function sideSegment(sm, players, cells, idx) {
  const counted = idx.filter((i) => players.length && players.every((id) => cells[id][i].has));
  const size = idx.length;
  const tot = {};
  players.forEach((id) => {
    const t = { gross: 0, net: 0, pts: 0, par: 0 };
    counted.forEach((i) => { const c = cells[id][i]; t.gross += c.gross; t.net += c.net; t.pts += c.pts; t.par += c.par; });
    tot[id] = t;
  });
  const complete = size > 0 && counted.length === size;
  const out = { size, counted, tot, complete, matchHoles: {}, standings: [], status: '', leaders: [] };
  const name = (id) => PLAYERS_BY_ID[id].name;

  if (sm.format === 'match' && players.length === 2) {
    const [a, b] = players;
    let diff = 0;
    counted.forEach((i) => {
      const r = Math.sign(cells[b][i].net - cells[a][i].net);   // +1 = a wins the hole
      out.matchHoles[i] = r;
      diff += r;
    });
    const remaining = size - counted.length;
    const decided = Math.abs(diff) > remaining && counted.length > 0;
    const final = complete || decided;
    const lead = diff > 0 ? a : b;
    if (!counted.length) out.status = 'Not started';
    else if (final && diff === 0) out.status = 'Halved';
    else if (final) out.status = `${name(lead)} wins ${decided && remaining > 0 ? `${Math.abs(diff)}&${remaining}` : `${Math.abs(diff)} UP`}`;
    else out.status = diff === 0 ? `All square thru ${counted.length}` : `${name(lead)} ${Math.abs(diff)} UP thru ${counted.length}`;
    out.complete = final;
    out.matchDiff = diff;
    out.standings = [a, b].map((id) => ({ pid: id, value: id === a ? diff : -diff }));
    out.standings.sort((x, y) => y.value - x.value);
  } else {
    const metric = sm.format === 'stableford' ? (id) => tot[id].pts : (id) => tot[id].net;
    const better = sm.format === 'stableford' ? (x, y) => y - x : (x, y) => x - y;
    out.standings = players.map((id) => ({ pid: id, value: metric(id) })).sort((x, y) => better(x.value, y.value));
    if (!counted.length) out.status = 'Not started';
    else {
      const best = out.standings[0].value;
      const leaders = out.standings.filter((s) => s.value === best).map((s) => name(s.pid));
      const par = tot[out.standings[0].pid].par, d = best - par;
      const val = sm.format === 'stableford' ? `${best} pts` : `${best}${par ? ` (${d === 0 ? 'E' : d > 0 ? '+' + d : d})` : ''}`;
      out.status = `${complete ? '' : 'Leading: '}${leaders.join(' & ')}${leaders.length > 1 ? ' tied at ' : ' '}${val}${complete ? (leaders.length > 1 ? '' : ' wins') : ` thru ${counted.length}`}`;
    }
  }
  // ranks, ties share one
  let rank = 0, prev = null;
  out.standings.forEach((s, i) => { if (s.value !== prev) { rank = i + 1; prev = s.value; } s.rank = rank; });
  out.leaders = counted.length ? out.standings.filter((s) => s.rank === 1).map((s) => s.pid) : [];
  return out;
}

// ---- money ----------------------------------------------------------------------

// Whole-dollar split of `amount` between `n` people; any odd dollars go to the first people.
function sideSplit(amount, n) {
  const base = Math.floor(amount / n), extra = amount - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

// Net money for each player across the three Nassau bets: for each bet, the
// prize he wins minus his stake. A bet with no scores yet doesn't count.
function sideMoney(sm, calc) {
  const out = {};
  calc.players.forEach((id) => { out[id] = 0; });
  calc.segments.forEach((seg) => {
    const m = sideBetMoney(sm, calc.players, seg);
    calc.players.forEach((id) => { out[id] += m[id]; });
  });
  return out;
}

// One bet: the pot is every player's stake; winners take it (a tie splits it).
function sideBetMoney(sm, players, calc) {
  const stake = Math.max(0, Math.round(Number(sm.stake) || 0));
  const out = {};
  players.forEach((id) => { out[id] = 0; });
  if (!stake || sm.payout === 'none' || !calc.counted.length) return out;
  const pot = stake * players.length;
  const pct = sm.payout === 'places' ? [60, 30, 10].slice(0, Math.min(3, players.length)) : [100];
  const norm = pct.reduce((a, b) => a + b, 0);
  const prizes = {};
  players.forEach((id) => { prizes[id] = 0; });
  // walk the ranks; a tie pools the places it covers and splits them evenly
  let pos = 0;
  const groups = [];
  calc.standings.forEach((s) => {
    const g = groups[groups.length - 1];
    if (g && g.rank === s.rank) g.ids.push(s.pid); else groups.push({ rank: s.rank, ids: [s.pid] });
  });
  groups.forEach((g) => {
    const covered = pct.slice(pos, pos + g.ids.length);
    pos += g.ids.length;
    if (!covered.length) return;
    const pool = Math.round(pot * covered.reduce((a, b) => a + b, 0) / norm);
    sideSplit(pool, g.ids.length).forEach((share, i) => { prizes[g.ids[i]] += share; });
  });
  players.forEach((id) => { out[id] = prizes[id] - stake; });
  return out;
}

// The per-bet result, for display next to each Nassau line.
function sideBetPot(sm, calc) {
  const stake = Math.max(0, Math.round(Number(sm.stake) || 0));
  return stake * calc.players.length;
}

// ---- actions --------------------------------------------------------------------

function sideById(state, id) { return (state.sideMatches || []).find((s) => s.id === id); }

function newSideDraft(state) {
  const first = state.sessions.find((s) => s.matches.length) || state.sessions[0];
  return {
    id: null, name: '', sessionIds: [first.id], range: 'all', from: 1, to: 18, players: [], format: 'stableford', basis: 'net',
    allowance: 100, strokes: {}, points: Object.assign({}, SIDE_PRESETS.standard), stake: 10, payout: 'winner', notes: '',
  };
}

// Pull whatever is typed in the form into the draft (called before any redraw
// so toggling a button never loses typed text).
function captureSideFields() {
  const d = getState().ui.sideDraft;
  if (!d) return;
  const val = (id) => { const el = document.getElementById(id); return el ? el.value : null; };
  const set = (key, id, num) => { const v = val(id); if (v !== null) d[key] = num ? (v === '' ? '' : Number(v)) : v; };
  set('name', 'sd-name'); set('notes', 'sd-notes'); set('allowance', 'sd-allowance', true); set('stake', 'sd-stake', true);
  set('from', 'sd-from', true); set('to', 'sd-to', true);
  d.points = d.points || {};
  SIDE_POINT_KEYS.forEach(([k]) => { const v = val('sd-pt-' + k); if (v !== null && v !== '') d.points[k] = Number(v); });
  d.strokes = d.strokes || {};
  PLAYERS.forEach((p) => { const v = val('sd-strokes-' + p.id); if (v !== null && v !== '') d.strokes[p.id] = Number(v); });
}

function openSideNew() {
  update((s) => { s.ui.sideDraft = newSideDraft(s); s.ui.screen = 'sideedit'; });
}
function openSide(id) {
  update((s) => { s.ui.sideId = id; s.ui.screen = 'sidedetail'; });
}
function openSideEdit(id) {
  update((s) => {
    const sm = sideById(s, id);
    if (!sm) return;
    const d = JSON.parse(JSON.stringify(sm));
    d.points = Object.assign({}, SIDE_PRESETS.standard, d.points || {});
    d.strokes = d.strokes || {};
    s.ui.sideDraft = d;
    s.ui.screen = 'sideedit';
  });
}

function sdSet(field, value) {
  captureSideFields();
  update((s) => {
    const d = s.ui.sideDraft;
    if (!d) return;
    d[field] = value;
    if (field === 'preset' ) { d.points = Object.assign({}, SIDE_PRESETS[value]); delete d.preset; }
  });
}
function sdToggle(field, value) {
  captureSideFields();
  update((s) => {
    const d = s.ui.sideDraft;
    if (!d) return;
    const arr = d[field] || [];
    d[field] = arr.includes(value) ? arr.filter((x) => x !== value) : arr.concat(value);
  });
}
function sdPreset(name) {
  captureSideFields();
  update((s) => { if (s.ui.sideDraft) s.ui.sideDraft.points = Object.assign({}, SIDE_PRESETS[name]); });
}

function saveSide() {
  captureSideFields();
  const d = getState().ui.sideDraft;
  if (!d) return;
  const total = (d.sessionIds || []).length;
  if (!total) { showNotice('Pick at least one round for this game.'); return; }
  if (d.format === 'match' && d.players.length !== 2) { showNotice('Match play is head to head: pick exactly 2 players.'); return; }
  if (d.players.length < 2) { showNotice('Pick at least 2 players.'); return; }
  const from = Math.max(1, Math.round(Number(d.from) || 1)), to = Math.min(18, Math.round(Number(d.to) || 18));
  if (d.range === 'custom' && from > to) { showNotice('The first hole has to come before the last hole.'); return; }
  const stake = Math.max(0, Math.round(Number(d.stake) || 0));
  const allowance = Math.min(200, Math.max(0, Math.round(Number(d.allowance) || 100)));
  update((s) => {
    s.sideMatches = s.sideMatches || [];
    const clean = {
      name: (d.name || '').trim() || 'Side match', sessionIds: d.sessionIds.slice(), range: d.range, from, to,
      players: d.players.slice(), format: d.format, basis: d.basis, allowance, strokes: Object.assign({}, d.strokes),
      points: Object.assign({}, SIDE_PRESETS.standard, d.points), stake, payout: d.payout, notes: (d.notes || '').trim(),
    };
    let sm = d.id && sideById(s, d.id);
    if (sm) {
      Object.assign(sm, clean);
    } else {
      sm = Object.assign({ id: uid('sm'), ts: Date.now(), createdBy: s.ui.me || null, settled: null }, clean);
      s.sideMatches.push(sm);
    }
    s.ui.sideId = sm.id;
    s.ui.sideDraft = null;
    s.ui.screen = 'sidedetail';
  });
}

function deleteSide(id) {
  update((s) => {
    const sm = sideById(s, id);
    if (sm && sm.settled) s.ledger = s.ledger.filter((e) => e.group !== sm.settled.group);
    s.sideMatches = (s.sideMatches || []).filter((x) => x.id !== id);
    s.ui.sideId = null;
    s.ui.screen = 'side';
  });
}

function settleSide(id) {
  update((s) => {
    const sm = sideById(s, id);
    if (!sm || sm.settled) return;
    const calc = computeSide(s, sm);
    const money = sideMoney(sm, calc);
    const group = uid('sgrp'), ts = Date.now();
    const detail = `${sm.name} (Nassau)`;
    const bets = calc.segments.map((seg) => `${seg.label}: ${seg.status}`).join(' · ');
    calc.players.forEach((pid) => {
      if (money[pid]) s.ledger.push({ id: uid('ldg'), kind: 'side', group, sideId: sm.id, playerId: pid, amount: money[pid], detail, ts });
    });
    sm.settled = { group, ts, by: s.ui.me || null };
    s.feed.unshift({ id: uid('fd'), author: 'Hawks Cup', isSystem: true, ts, text: `Side match settled — ${sm.name}. ${bets}.` });
  });
}
function unsettleSide(id) {
  update((s) => {
    const sm = sideById(s, id);
    if (!sm || !sm.settled) return;
    s.ledger = s.ledger.filter((e) => e.group !== sm.settled.group);
    sm.settled = null;
  });
}

// Called from main.js's click handler; true if the action was one of ours.
function handleSideAction(a) {
  switch (a.action) {
    case 'side-new': openSideNew(); return true;
    case 'side-open': openSide(a.id); return true;
    case 'side-edit': openSideEdit(a.id); return true;
    case 'side-save': saveSide(); return true;
    case 'side-delete':
      if (confirm('Delete this side match' + ((sideById(getState(), a.id) || {}).settled ? ' and the money it posted' : '') + '?')) deleteSide(a.id);
      return true;
    case 'side-settle': {
      const sm = sideById(getState(), a.id);
      if (!sm) return true;
      const calc = computeSide(getState(), sm);
      if (!calc.segments.every((seg) => seg.complete) && !confirm('Not every bet in this Nassau is finished yet. Post the money for how they stand now?')) return true;
      settleSide(a.id);
      return true;
    }
    case 'side-unsettle':
      if (confirm('Take this game\'s money back out of the ledger?')) unsettleSide(a.id);
      return true;
    case 'sd-session': sdToggle('sessionIds', a.value); return true;
    case 'sd-player': sdToggle('players', a.value); return true;
    case 'sd-format': sdSet('format', a.value); return true;
    case 'sd-basis': sdSet('basis', a.value); return true;
    case 'sd-range': sdSet('range', a.value); return true;
    case 'sd-payout': sdSet('payout', a.value); return true;
    case 'sd-preset': sdPreset(a.value); return true;
    default: return false;
  }
}

// ---- screens ---------------------------------------------------------------------

function sideFormatName(id) { return (SIDE_FORMATS.find((f) => f.id === id) || {}).name || id; }
function sideBasisName(sm) {
  return sm.basis === 'gross' ? 'Gross' : sm.basis === 'custom' ? 'Custom strokes' : `Net${Number(sm.allowance) && Number(sm.allowance) !== 100 ? ` @ ${sm.allowance}%` : ''}`;
}
function sideRangeName(sm) {
  return sm.range === 'front' ? 'front 9' : sm.range === 'back' ? 'back 9' : sm.range === 'custom' ? `holes ${sm.from}–${sm.to}` : 'all 18';
}
function sideRoundsName(state, sm) {
  return sideSessions(state, sm).map((s) => courseFor(s).name).join(' + ') || 'No round';
}
function sideInitials(name) { return name.split(/\s+/).map((w) => w[0]).join('').toUpperCase(); }

const SD_LABEL = 'font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)';

function renderSideList(state) {
  const list = state.sideMatches || [];
  const cards = list.map((sm) => {
    const calc = computeSide(state, sm);
    const names = calc.players.map((id) => PLAYERS_BY_ID[id].name).join(', ');
    const stake = Number(sm.stake) && sm.payout !== 'none' ? ` &middot; $${sm.stake} a bet` : '';
    return `
    <button data-action="side-open" data-id="${sm.id}" style="display:block;width:100%;text-align:left;border:0;border-bottom:1px solid var(--rule);background:transparent;padding:14px 18px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">
        <div style="font-size:16px;font-weight:800;letter-spacing:-.01em">${esc(sm.name)}</div>
        <div style="font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:${sm.settled ? 'var(--muted)' : calc.complete ? 'var(--accent)' : 'var(--ink)'}">${sm.settled ? 'Paid' : calc.complete ? 'Final' : calc.thru ? 'In play' : 'Waiting'}</div>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">Nassau &middot; ${esc(sideFormatName(sm.format))} &middot; ${esc(sideBasisName(sm))} &middot; ${esc(sideRoundsName(state, sm))}, ${esc(sideRangeName(sm))}${stake}</div>
      <div style="font-size:12px;margin-top:6px">${esc(names)}</div>
      <div style="font-size:13px;font-weight:800;margin-top:4px;color:var(--accent)">${esc(calc.status)}</div>
    </button>`;
  }).join('');
  return `
  <div>
    <div style="padding:14px 18px;border-bottom:2px solid var(--rule);font-size:12px;line-height:1.5;color:rgba(10,16,48,.7)">Your own games on the side of the team event. Every one is a Nassau: three bets (front, back and overall), each scored as match play, stableford or stroke play, with a stake on each bet. The app scores them from the scores already entered in the team matches, so there is nothing extra to type.</div>
    <div style="padding:14px 18px;border-bottom:2px solid var(--rule)">
      <button data-action="side-new" class="btn btn-primary btn-block">New side match</button>
    </div>
    ${cards || `<div style="padding:22px 18px;font-size:13px;color:var(--muted)">No side matches yet. Tap "New side match" to make one.</div>`}
    <div style="height:26px"></div>
  </div>`;
}

function renderSideDetail(state) {
  const sm = sideById(state, state.ui.sideId);
  if (!sm) return `<div style="padding:22px 18px;font-size:13px;color:var(--muted)">That side match was deleted.<br><br><button data-action="go-screen" data-screen="side" class="btn btn-secondary">Back to side matches</button></div>`;
  const calc = computeSide(state, sm);
  const money = sideMoney(sm, calc);
  const stakeOn = Number(sm.stake) && sm.payout !== 'none';
  const multi = calc.holes.length && new Set(calc.holes.map((h) => h.session.id)).size > 1;

  const strokesText = (pid) => {
    if (sm.basis === 'gross') return 'no strokes';
    const parts = sideSessions(state, sm).map((s) => `${multi ? sideInitials(courseFor(s).name) + ' ' : ''}${calc.strokes[s.id][pid] || 0}`);
    return `gets ${parts.join(' / ')}`;
  };
  const metricText = (s) => {
    if (sm.format === 'match') return s.value === 0 ? 'AS' : s.value > 0 ? `${s.value} UP` : `${Math.abs(s.value)} DN`;
    if (sm.format === 'stableford') return `${s.value} pts`;
    const par = calc.tot[s.pid].par, d = s.value - par;
    return `${s.value}${par ? ` (${d === 0 ? 'E' : d > 0 ? '+' + d : d})` : ''}`;
  };
  const rows = calc.standings.map((s) => {
    const p = PLAYERS_BY_ID[s.pid];
    const m = money[s.pid];
    return `
    <div style="display:flex;align-items:center;gap:10px;padding:11px 18px;border-bottom:1px solid var(--rule)">
      <div style="width:22px;font-size:13px;font-weight:800;color:${s.rank === 1 && calc.counted.length ? 'var(--accent)' : 'var(--muted)'}">${calc.counted.length ? s.rank : '&ndash;'}</div>
      <div style="width:9px;height:9px;flex:none;background:${p.team === 'L' ? 'var(--accent)' : 'var(--team2)'}"></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:800">${esc(p.name)}</div>
        <div style="font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted)">${esc(strokesText(s.pid))}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:15px;font-weight:800">${calc.counted.length ? esc(metricText(s)) : '&ndash;'}</div>
        ${stakeOn && calc.counted.length ? `<div style="font-size:11px;font-weight:800;color:${m > 0 ? 'var(--accent)' : m < 0 ? 'var(--muted)' : 'var(--ink)'}">${fmtMoney(m)}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  // hole by hole
  const colW = 34;
  const head = calc.holes.map((h, i) => `<div style="flex:none;width:${colW}px;text-align:center;font-size:9px;font-weight:800;letter-spacing:.04em;color:var(--muted);${i && multi && calc.holes[i - 1].session.id !== h.session.id ? 'border-left:2px solid var(--rule)' : ''}">${multi ? `<div>${esc(sideInitials(h.course.name))}</div>` : ''}${h.hole.n}</div>`).join('');
  const parRow = calc.holes.map((h) => `<div style="flex:none;width:${colW}px;text-align:center;font-size:10px;color:var(--muted)">${h.hole.par}</div>`).join('');
  const tableRows = calc.players.map((pid) => {
    const p = PLAYERS_BY_ID[pid];
    const cells = calc.cells[pid].map((c, i) => {
      if (!c.has) return `<div style="flex:none;width:${colW}px;text-align:center;font-size:13px;color:var(--rule)">&middot;</div>`;
      const sub = sm.format === 'stableford' ? c.pts : c.net;
      let bg = 'transparent';
      if (sm.format === 'match' && calc.matchHoles[i] != null) {
        const r = calc.matchHoles[i];
        const won = (pid === calc.players[0] && r > 0) || (pid === calc.players[1] && r < 0);
        if (won) bg = 'rgba(11,26,90,.14)';
      }
      return `<div style="flex:none;width:${colW}px;text-align:center;background:${bg};padding:3px 0"><div style="font-size:14px;font-weight:800">${c.gross}</div><div style="font-size:9px;color:var(--muted)">${sub}</div></div>`;
    }).join('');
    return `<div style="display:flex;align-items:center"><div style="flex:none;width:64px;padding:0 6px 0 18px;font-size:12px;font-weight:800;white-space:nowrap">${esc(p.name)}</div><div style="display:flex">${cells}</div></div>`;
  }).join('');
  const subLabel = sm.format === 'stableford' ? 'small number = stableford points' : 'small number = net score';

  // The three Nassau bets, each with its own result and pot
  const pot = sideBetPot(sm, calc);
  const nassauRows = calc.segments.map((seg) => `
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:10px 18px;border-bottom:1px solid var(--rule)">
      <div style="min-width:0">
        <div style="font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:${seg.complete ? 'var(--ink)' : 'var(--muted)'}">${esc(seg.label)}${seg.complete ? ' &middot; final' : ''}</div>
        <div style="font-size:13px;font-weight:800;margin-top:2px;color:var(--accent)">${esc(seg.status)}</div>
      </div>
      ${stakeOn ? `<div style="font-size:11px;font-weight:800;color:var(--muted);white-space:nowrap">$${pot} pot</div>` : ''}
    </div>`).join('');

  const allFinal = calc.segments.every((seg) => seg.complete);
  const settleBlock = !stakeOn ? '' : `
    <div style="padding:14px 18px;border-top:2px solid var(--rule)">
      <div style="${SD_LABEL}">Money</div>
      <div style="font-size:12px;line-height:1.5;color:rgba(10,16,48,.7);margin:4px 0 10px">$${sm.stake} a bet from each player, $${pot} a pot, three bets, ${esc(SIDE_PAYOUTS.find((p) => p.id === sm.payout).name.toLowerCase())}. ${sm.settled ? 'The money is in the ledger.' : allFinal ? 'All three bets are final. Post the money to the ledger when you\'re ready.' : 'Posts to the ledger when you tap the button (best after all three bets are final).'}</div>
      ${sm.settled
        ? `<button data-action="side-unsettle" data-id="${sm.id}" class="btn btn-secondary btn-block">Take the money back out</button>`
        : `<button data-action="side-settle" data-id="${sm.id}" class="btn btn-primary btn-block">Post the money to the ledger</button>`}
    </div>`;

  return `
  <div>
    <div style="padding:14px 18px;border-bottom:2px solid var(--rule)">
      <div style="font-size:9px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)">Nassau &middot; ${esc(sideFormatName(sm.format))} &middot; ${esc(sideBasisName(sm))}</div>
      <div style="font-size:12px;line-height:1.5;color:rgba(10,16,48,.7);margin-top:3px">${esc(sideRoundsName(state, sm))}, ${esc(sideRangeName(sm))}${sm.notes ? ` &middot; ${esc(sm.notes)}` : ''}</div>
      <div style="font-size:20px;font-weight:800;letter-spacing:-.015em;margin-top:8px;color:var(--accent)">${esc(calc.status)}</div>
      <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-top:2px">${calc.thru} of ${calc.total} holes scored for everyone</div>
    </div>
    <div style="padding:12px 18px 6px;${SD_LABEL}">The three bets</div>
    ${nassauRows}
    <div style="padding:12px 18px 6px;${SD_LABEL}">Overall standings${stakeOn ? ' &middot; money across all three bets' : ''}</div>
    ${rows}
    ${calc.total ? `
    <div style="padding:14px 0 6px;border-top:2px solid var(--rule)">
      <div style="padding:0 18px 8px;${SD_LABEL}">Hole by hole <span style="text-transform:none;letter-spacing:0;font-weight:600">&middot; ${subLabel}</span></div>
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
        <div style="min-width:max-content">
          <div style="display:flex"><div style="flex:none;width:64px"></div><div style="display:flex">${head}</div></div>
          <div style="display:flex"><div style="flex:none;width:64px;padding-left:18px;font-size:9px;color:var(--muted)">PAR</div><div style="display:flex">${parRow}</div></div>
          ${tableRows}
        </div>
      </div>
    </div>` : `<div style="padding:16px 18px;font-size:13px;color:var(--muted)">No holes match this setup. Edit the game and pick a round.</div>`}
    ${settleBlock}
    <div style="display:flex;gap:8px;padding:14px 18px 28px;border-top:2px solid var(--rule)">
      <button data-action="side-edit" data-id="${sm.id}" class="btn btn-secondary" style="flex:1">Edit settings</button>
      <button data-action="side-delete" data-id="${sm.id}" class="btn btn-secondary" style="flex:1;color:var(--accent);border-color:var(--accent)">Delete</button>
    </div>
  </div>`;
}

function renderSideEdit(state) {
  const d = state.ui.sideDraft;
  if (!d) return `<div style="padding:22px 18px"><button data-action="go-screen" data-screen="side" class="btn btn-secondary">Back to side matches</button></div>`;
  const choice = (action, items, current) => `<div style="display:flex;flex-wrap:wrap;gap:1px;background:var(--rule);border:1px solid var(--rule)">${items.map((it) => {
    const on = current === it.id;
    return `<button data-action="${action}" data-value="${it.id}" style="flex:1 0 auto;border:0;background:${on ? 'var(--accent)' : 'var(--bg)'};color:${on ? '#fff' : 'var(--ink)'};font-weight:800;font-size:12px;padding:11px 12px">${esc(it.name)}</button>`;
  }).join('')}</div>`;
  const note = (text) => `<div style="font-size:11px;line-height:1.45;color:var(--muted);margin-top:6px">${esc(text)}</div>`;
  const input = (id, value, type, extra) => `<input id="${id}" class="field-input" type="${type || 'text'}" ${extra || ''} value="${esc(value == null ? '' : value)}" style="margin-top:4px">`;
  const section = (label, body) => `<div style="padding:14px 18px;border-bottom:1px solid var(--rule)"><div style="${SD_LABEL};margin-bottom:6px">${label}</div>${body}</div>`;

  const sessionItems = state.sessions.map((s) => ({ id: s.id, name: `${courseFor(s).name} · ${s.day}` }));
  const sessionChips = `<div style="display:flex;flex-direction:column;gap:1px;background:var(--rule);border:1px solid var(--rule)">${sessionItems.map((it) => {
    const on = d.sessionIds.includes(it.id);
    return `<button data-action="sd-session" data-value="${it.id}" style="display:flex;justify-content:space-between;border:0;background:${on ? 'var(--accent)' : 'var(--bg)'};color:${on ? '#fff' : 'var(--ink)'};font-weight:800;font-size:13px;padding:11px 12px;text-align:left"><span>${esc(it.name)}</span><span>${on ? '&check;' : ''}</span></button>`;
  }).join('')}</div>`;
  const playerChips = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--rule);border:1px solid var(--rule)">${PLAYERS.map((p) => {
    const on = d.players.includes(p.id);
    return `<button data-action="sd-player" data-value="${p.id}" style="display:flex;align-items:center;gap:8px;border:0;background:${on ? 'var(--accent)' : 'var(--bg)'};color:${on ? '#fff' : 'var(--ink)'};font-weight:800;font-size:13px;padding:11px 12px;text-align:left"><span style="width:8px;height:8px;flex:none;background:${on ? '#fff' : p.team === 'L' ? 'var(--accent)' : 'var(--team2)'}"></span>${esc(p.name)}</button>`;
  }).join('')}</div>`;

  const holesExtra = d.range === 'custom'
    ? `<div style="display:flex;gap:10px;margin-top:8px"><label style="flex:1;${SD_LABEL}">From hole${input('sd-from', d.from, 'number', 'min="1" max="18"')}</label><label style="flex:1;${SD_LABEL}">To hole${input('sd-to', d.to, 'number', 'min="1" max="18"')}</label></div>` : '';

  let basisExtra = '';
  if (d.basis === 'net') {
    basisExtra = `<label style="display:block;margin-top:10px;${SD_LABEL}">Handicap allowance (%)${input('sd-allowance', d.allowance, 'number', 'min="0" max="200"')}</label>${note('100 = full handicap. Each player\'s course handicap comes from the tees played that round, capped at 32.')}`;
  } else if (d.basis === 'custom') {
    basisExtra = d.players.length
      ? `<div style="margin-top:10px;${SD_LABEL}">Strokes per round</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${d.players.map((id) => `<label style="${SD_LABEL}">${esc(PLAYERS_BY_ID[id].name)}${input('sd-strokes-' + id, d.strokes[id] == null ? 0 : d.strokes[id], 'number', 'min="0" max="40"')}</label>`).join('')}</div>`
      : note('Pick the players first, then set their strokes here.');
  }

  const ptsBlock = d.format === 'stableford' ? section('Stableford points', `
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <button data-action="sd-preset" data-value="standard" class="btn btn-secondary" style="flex:1;padding:9px 6px;font-size:12px">Standard 0/1/2/3/4/5</button>
        <button data-action="sd-preset" data-value="modified" class="btn btn-secondary" style="flex:1;padding:9px 6px;font-size:12px">Modified</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">${SIDE_POINT_KEYS.map(([k, label]) => `<label style="${SD_LABEL}">${label}${input('sd-pt-' + k, (d.points || {})[k], 'number', 'step="1"')}</label>`).join('')}</div>
      ${note('Points are for the net score against par on each hole. Change any of them to make your own scoring.')}`) : '';

  const formatNote = (SIDE_FORMATS.find((f) => f.id === d.format) || {}).note;
  const basisNote = (SIDE_BASES.find((f) => f.id === d.basis) || {}).note;
  const payoutNote = (SIDE_PAYOUTS.find((f) => f.id === d.payout) || {}).note;

  return `
  <div>
    <div style="padding:12px 18px;background:var(--row-alt);border-bottom:1px solid var(--rule);font-size:12px;line-height:1.5;color:rgba(10,16,48,.75)"><strong style="letter-spacing:.08em;text-transform:uppercase;color:var(--accent)">Nassau.</strong> Every side match is three bets: the front half, the back half and the overall total of the holes you pick (front 9 / back 9 / overall for 18 holes; round 1 / round 2 / overall for two rounds), scored the way you choose below.</div>
    ${section('Name', input('sd-name', d.name, 'text', 'maxlength="40" placeholder="e.g. Lenny v Alex, Sat stableford"'))}
    ${section('Players', playerChips + note(d.format === 'match' ? 'Match play needs exactly 2 players.' : 'Two or more players.'))}
    ${section('Round(s)', sessionChips + note('Pick one, or several to play them as one game. Scores come from the team matches in those rounds.'))}
    ${section('Holes', choice('sd-range', SIDE_RANGES, d.range) + holesExtra)}
    ${section('Format', choice('sd-format', SIDE_FORMATS, d.format) + note(formatNote))}
    ${section('Scoring', choice('sd-basis', SIDE_BASES, d.basis) + note(basisNote) + basisExtra)}
    ${ptsBlock}
    ${section('Money', `<label style="${SD_LABEL}">Stake per bet, per player ($)${input('sd-stake', d.stake, 'number', 'min="0" max="1000"')}</label>${note('Every side match is a Nassau: three bets (front, back, overall). Each bet has its own pot of this stake from every player.')}<div style="${SD_LABEL};margin:12px 0 6px">Payout (each bet)</div>${choice('sd-payout', SIDE_PAYOUTS, d.payout)}${note(payoutNote + ' Nothing hits the ledger until you tap Post the money on the game.')}`)}
    ${section('Notes (optional)', input('sd-notes', d.notes, 'text', 'maxlength="80" placeholder="e.g. loser buys dinner"'))}
    <div style="display:flex;gap:8px;padding:16px 18px 30px">
      <button data-action="${d.id ? 'side-open' : 'go-screen'}" data-id="${d.id || ''}" data-screen="side" class="btn btn-secondary" style="flex:1">Cancel</button>
      <button data-action="side-save" class="btn btn-primary" style="flex:2">${d.id ? 'Save changes' : 'Create side match'}</button>
    </div>
  </div>`;
}
