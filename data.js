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

// Real hole-by-hole cards: par, yardage and stroke index (SI) for every hole.
// SI is what hands out handicap strokes, so it is the part that matters for
// scoring; yardages are shown on the card screen only.
function card(pars, yards, si) {
  return pars.map((par, i) => ({ n: i + 1, par, yds: yards ? yards[i] : null, si: si[i] }));
}

const COURSES = [
  {
    // GolfPass card, Blue tees. Par 71, 6,268 yds (club lists 6,354), 70.2 / 129.
    id: 'southern-pines', name: 'Southern Pines', extra: false,
    note: 'Blue tees', par: 71,
    holes: card(
      [4, 5, 3, 4, 5, 4, 3, 4, 3, 4, 4, 4, 4, 3, 5, 4, 4, 4],
      [361, 486, 197, 385, 534, 423, 163, 373, 181, 333, 312, 410, 400, 172, 476, 312, 410, 340],
      [11, 7, 13, 3, 5, 1, 17, 9, 15, 10, 14, 2, 8, 18, 6, 16, 4, 12]
    ),
  },
  {
    // OpenGolfAPI / GolfPass card, Blue tees. Par 72, 6,730 yds.
    id: 'mid-pines', name: 'Mid Pines', extra: false,
    note: 'Ross, 1921 · Blue tees', par: 72,
    holes: card(
      [4, 3, 4, 4, 5, 5, 4, 3, 4, 5, 3, 4, 3, 4, 5, 4, 4, 4],
      [405, 190, 435, 325, 480, 525, 380, 180, 335, 515, 180, 395, 235, 360, 550, 445, 390, 405],
      [5, 15, 7, 13, 9, 1, 3, 17, 11, 2, 18, 8, 10, 16, 12, 6, 14, 4]
    ),
  },
  {
    // GolfAdvisor / OpenGolfAPI card, Medal tees. Par 71, 7,035 yds, 73.5 / 135.
    id: 'pine-needles', name: 'Pine Needles', extra: false,
    note: 'US Women\u2019s Open venue · Medal tees', par: 71,
    holes: card(
      [5, 4, 3, 4, 3, 4, 4, 4, 4, 5, 4, 4, 3, 4, 5, 3, 4, 4],
      [505, 480, 145, 405, 220, 460, 455, 360, 385, 525, 415, 425, 210, 455, 530, 180, 460, 420],
      [11, 5, 17, 9, 7, 1, 3, 15, 13, 12, 14, 16, 2, 6, 18, 8, 10, 4]
    ),
  },
  {
    // GolfPass / GolfAdvisor card, Ripper (back) tees. Par 71, 6,557 yds, 72.5 / 145.
    id: 'tobacco-road', name: 'Tobacco Road', extra: false,
    note: 'Strantz, blind everything · Ripper tees', par: 71,
    holes: card(
      [5, 4, 3, 5, 4, 3, 4, 3, 4, 4, 5, 4, 5, 3, 4, 4, 3, 4],
      [558, 392, 152, 535, 333, 148, 411, 178, 427, 441, 531, 419, 573, 194, 365, 326, 142, 432],
      [3, 11, 17, 9, 15, 13, 7, 5, 1, 10, 14, 2, 8, 12, 16, 18, 4, 6]
    ),
  },
  {
    // New par-3 course at Tobacco Road (opened Aug 2026): 12 holes, 40-105 yds.
    // No hole-by-hole card is published yet, so yardages are left blank and
    // SI follows hole order. Replace with the real card when you have it.
    id: 'the-matchbox', name: 'The Matchbox', extra: true,
    note: '12 par 3s, 40\u2013105 yds · no cup points', par: 36,
    holes: card(
      [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
      null,
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    ),
  },
];

const COURSES_BY_ID = {};
COURSES.forEach((c) => { COURSES_BY_ID[c.id] = c; });

const CUP_COURSES = COURSES.filter((c) => !c.extra);
const EXTRA_COURSES = COURSES.filter((c) => c.extra);

// shape: 'team' (2v2) or 'singles' (1v1). Every format is played as a Nassau.
const GAMES = [
  { id: 'fourball', name: 'Fourball', note: 'best net ball', shape: 'team' },
  { id: 'lowhigh', name: 'Low ball / high ball', note: '2 pts a hole, net', shape: 'team' },
  { id: 'singles', name: 'Match play', note: 'net, man on man', shape: 'singles' },
];
const GAMES_BY_ID = {};
GAMES.forEach((g) => { GAMES_BY_ID[g.id] = g; });
// Formats from earlier saved trips still render (scored as best net ball).
GAMES_BY_ID.foursomes = { id: 'foursomes', name: 'Foursomes', note: '', shape: 'team' };
GAMES_BY_ID.scramble = { id: 'scramble', name: 'Scramble', note: '', shape: 'team' };
GAMES_BY_ID.netteam = { id: 'netteam', name: 'Net stroke', note: '', shape: 'team' };
GAMES_BY_ID.netsingles = { id: 'netsingles', name: 'Net stroke', note: '', shape: 'singles' };
function gameFor(session) { return GAMES_BY_ID[session.format] || GAMES[0]; }

const TAG_TYPES = ['Skin', 'Greenie', 'CTP', '3-putt', 'Lost ball', 'In the water'];

const FINE_TYPES = [
  'Lip-out sulk', 'Three-putt', 'Lost ball', 'Late to the tee', 'Air-mailed the green',
  'Whiff', 'Sandbagging confession', 'Phone in the bag',
];

const RED = '#ec3013';
const INK = '#201e1d';
