// Static reference data: players, courses/holes, game types.
// Edit here to re-cast the trip for a different group/venue.

const TEAM_ONE_NAME = 'The LAWDs';
const TEAM_TWO_NAME = 'The Shanksgiving Turkeys';

const PLAYERS = [
  { id: 'david', name: 'David', team: 'L', hcp: 4, captain: true },
  { id: 'lenny', name: 'Lenny', team: 'L', hcp: 11 },
  { id: 'alex', name: 'Alex', team: 'L', hcp: 8 },
  { id: 'dan', name: 'Dan', team: 'L', hcp: 16 },
  { id: 'tom', name: 'Tom', team: 'T', hcp: 6, captain: true },
  { id: 'ben', name: 'Ben', team: 'T', hcp: 13 },
  { id: 'ryan', name: 'Ryan', team: 'T', hcp: 2 },
  { id: 'jamey', name: 'Jamey', team: 'T', hcp: 19 },
];

const PLAYERS_BY_ID = {};
PLAYERS.forEach((p) => { PLAYERS_BY_ID[p.id] = p; });

// The numbers above are only the starting handicaps. Edits made in the app
// (Teams > tap a player) live in the shared trip as state.handicaps and are
// applied over these by applyHandicaps().
const BASE_HCP = {};
PLAYERS.forEach((p) => { BASE_HCP[p.id] = p.hcp; });

function playerNames(ids) {
  return ids.map((id) => PLAYERS_BY_ID[id].name).join(' & ');
}

// Builds 18 (or n) holes for a course: distributes yardage across the given
// par sequence so the total matches exactly, and pairs it with a fixed
// stroke-index permutation. Deterministic — no randomness — so SI/yardage
// never drifts between reloads.
function buildHoles(pars, totalYards, siOrder) {
  const baseByPar = { 3: 165, 4: 400, 5: 530 };
  const base = pars.map((p) => baseByPar[p] || 400);
  const baseSum = base.reduce((a, b) => a + b, 0);
  const scale = totalYards / baseSum;
  const yds = base.map((y) => Math.round((y * scale) / 1) );
  // fix rounding drift on the last hole so the sum is exact
  const drift = totalYards - yds.reduce((a, b) => a + b, 0);
  yds[yds.length - 1] += drift;
  return pars.map((par, i) => ({ n: i + 1, par, yds: yds[i], si: siOrder[i] }));
}

const SI_ROTATE_BASE = [7, 3, 15, 11, 9, 1, 17, 13, 5, 6, 12, 14, 4, 8, 18, 2, 16, 10];
function rotated(arr, n) { return arr.slice(n).concat(arr.slice(0, n)); }

const FRONT_A = [4, 4, 3, 5, 4, 4, 3, 4, 5]; // par 36
const FRONT_B = [4, 4, 3, 5, 4, 4, 3, 4, 4]; // par 35

const COURSES = [
  {
    id: 'mid-pines', name: 'Mid Pines', extra: false,
    note: 'Ross, 1921', par: 72,
    holes: buildHoles(FRONT_A.concat(FRONT_A), 6515, SI_ROTATE_BASE),
  },
  {
    id: 'pine-needles', name: 'Pine Needles', extra: false,
    note: 'three US Opens', par: 71,
    holes: buildHoles(FRONT_B.concat(FRONT_A), 6727, rotated(SI_ROTATE_BASE, 1).reverse()),
  },
  {
    id: 'southern-pines', name: 'Southern Pines', extra: false,
    note: 'restored 2021', par: 71,
    holes: buildHoles(FRONT_A.concat(FRONT_B), 6568, rotated(SI_ROTATE_BASE, 5)),
  },
  {
    id: 'tobacco-road', name: 'Tobacco Road', extra: false,
    note: 'Strantz, blind everything', par: 71,
    holes: buildHoles(FRONT_B.slice().reverse().concat(FRONT_A), 6554, rotated(SI_ROTATE_BASE, 10)),
  },
  {
    id: 'the-matchbox', name: 'The Matchbox', extra: true,
    note: '12 holes · individual games only, no cup points', par: 42,
    holes: buildHoles(
      [3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4],
      2450,
      [7, 3, 11, 9, 1, 5, 12, 2, 10, 6, 8, 4]
    ),
  },
];

const COURSES_BY_ID = {};
COURSES.forEach((c) => { COURSES_BY_ID[c.id] = c; });

const CUP_COURSES = COURSES.filter((c) => !c.extra);
const EXTRA_COURSES = COURSES.filter((c) => c.extra);

// shape: 'team' (2v2) or 'singles' (1v1)
const GAMES = [
  { id: 'fourball', name: 'Fourball', note: 'better ball', shape: 'team' },
  { id: 'foursomes', name: 'Foursomes', note: 'alternate shot', shape: 'team' },
  { id: 'scramble', name: 'Scramble', note: 'both play best', shape: 'team' },
  { id: 'netteam', name: 'Net stroke', note: 'low team total', shape: 'team' },
  { id: 'netsingles', name: 'Net stroke', note: 'head-to-head', shape: 'singles' },
  { id: 'singles', name: 'Match play', note: 'man on man', shape: 'singles' },
];
const GAMES_BY_ID = {};
GAMES.forEach((g) => { GAMES_BY_ID[g.id] = g; });

const TAG_TYPES = ['Skin', 'Greenie', 'CTP', '3-putt', 'Lost ball', 'In the water'];

const FINE_TYPES = [
  'Lip-out sulk', 'Three-putt', 'Lost ball', 'Late to the tee', 'Air-mailed the green',
  'Whiff', 'Sandbagging confession', 'Phone in the bag',
];

const RED = '#ec3013';
const INK = '#201e1d';
