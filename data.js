// Static reference data: players, courses/holes, game types.
// Edit here to re-cast the trip for a different group/venue.

const TEAM_ONE_NAME = 'The LAWDs';
const TEAM_TWO_NAME = 'The Prince’s Court Jesters';

const PLAYERS = [
  { id: 'david', name: 'David', team: 'L', hcp: 13, captain: true },
  { id: 'lenny', name: 'Lenny', team: 'L', hcp: 21 },
  { id: 'alex', name: 'Alex', team: 'L', hcp: 11 },
  { id: 'dan', name: 'Dan', team: 'L', hcp: 20 },
  { id: 'tom', name: 'Tom', team: 'T', hcp: 16, captain: true },
  { id: 'ben', name: 'Ben', team: 'T', hcp: 10 },
  { id: 'ryan', name: 'Ryan', team: 'T', hcp: 17 },
  { id: 'jamey', name: 'Jamey', team: 'T', hcp: 28 },
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

// Course data. Each course has:
//  - holes: par and stroke index (SI) per hole. SI hands out handicap strokes
//    and is the same from every tee.
//  - tees: every tee with its men's course rating and slope, which is what the
//    course-handicap conversion uses, plus per-hole yardage where published.
// Sources: GolfPass / GolfAdvisor / OpenGolfAPI scorecards (not the clubs'
// own cards). Women's-rated tees are left out except where a tee only has a
// women's rating (marked in its name).
function holesOf(pars, si) {
  return pars.map((par, i) => ({ n: i + 1, par, si: si[i] }));
}
// `par` is only needed when a tee is rated at a different par than the course.
function tee(id, name, rating, slope, yards, total, par) {
  return { id, name, rating, slope, par: par || null, yards: yards || null, total: yards ? yards.reduce((a, b) => a + b, 0) : total };
}

const COURSES = [
  {
    id: 'southern-pines', name: 'Southern Pines', extra: false, note: '', par: 71, defaultTee: 'white',
    holes: holesOf(
      [4, 5, 3, 4, 5, 4, 3, 4, 3, 4, 4, 4, 4, 3, 5, 4, 4, 4],
      [11, 7, 13, 3, 5, 1, 17, 9, 15, 10, 14, 2, 8, 18, 6, 16, 4, 12]
    ),
    tees: [
      tee('blue', 'Blue', 72.5, 142, [361, 486, 197, 385, 534, 423, 163, 373, 181, 333, 312, 410, 400, 172, 476, 312, 410, 340]),
      tee('white', 'White', 70.3, 135, [353, 474, 173, 368, 507, 405, 145, 362, 164, 322, 288, 405, 388, 162, 460, 303, 397, 329]),
      tee('gold', 'Gold', 67.9, 129, [337, 466, 153, 351, 474, 397, 140, 333, 144, 321, 274, 389, 360, 147, 443, 282, 387, 303]),
      tee('red', 'Red', 65.1, 119, [299, 438, 132, 351, 474, 390, 89, 292, 125, 295, 242, 390, 315, 136, 424, 280, 345, 301]),
      tee('baby-blue', 'Baby Blue', 60.7, 112, null, 4015),
    ],
  },
  {
    id: 'mid-pines', name: 'Mid Pines', extra: false, note: 'Ross, 1921', par: 72, defaultTee: 'regular',
    holes: holesOf(
      [4, 3, 4, 4, 5, 5, 4, 3, 4, 5, 3, 4, 3, 4, 5, 4, 4, 4],
      [5, 15, 7, 13, 9, 1, 3, 17, 11, 2, 18, 8, 10, 16, 12, 6, 14, 4]
    ),
    // Ratings and slopes: USGA National Course Rating Database (men's).
    tees: [
      tee('medal', 'Medal', 73.5, 142, [405, 190, 435, 325, 480, 525, 380, 180, 335, 515, 180, 395, 235, 360, 550, 445, 390, 405]),
      tee('ross', 'Ross', 72.3, 138, [375, 185, 405, 315, 465, 495, 375, 175, 325, 495, 165, 395, 215, 355, 535, 425, 365, 405]),
      tee('regular', 'Regular', 70.4, 136, [370, 165, 385, 310, 460, 480, 365, 165, 325, 485, 160, 365, 195, 340, 480, 385, 365, 390]),
      tee('executive', 'Executive', 67.8, 129, [350, 160, 250, 275, 440, 450, 355, 145, 310, 435, 140, 345, 150, 325, 455, 350, 350, 320]),
      tee('forward', 'Forward', 64.7, 118, [325, 115, 240, 255, 375, 380, 300, 130, 295, 380, 120, 270, 135, 275, 380, 300, 315, 315]),
    ],
  },
  {
    id: 'pine-needles', name: 'Pine Needles', extra: false, note: 'US Women’s Open venue', par: 71, defaultTee: 'ross',
    holes: holesOf(
      [5, 4, 3, 4, 3, 4, 4, 4, 4, 5, 4, 4, 3, 4, 5, 3, 4, 4],
      [11, 5, 17, 9, 7, 1, 3, 15, 13, 4, 12, 14, 16, 2, 6, 18, 8, 10]
    ),
    tees: [
      tee('medal', 'Medal', 74.7, 141, [505, 475, 145, 400, 220, 455, 450, 365, 380, 525, 415, 435, 210, 450, 535, 180, 460, 420]),
      tee('ross', 'Ross', 71.9, 138, [485, 440, 135, 385, 180, 410, 405, 355, 370, 480, 375, 350, 185, 400, 485, 170, 440, 400]),
      tee('regular', 'Regular', 70.0, 133, [470, 435, 125, 335, 170, 375, 365, 320, 350, 460, 345, 325, 160, 395, 465, 165, 415, 375]),
      tee('executive', 'Executive', 66.4, 124, [455, 410, 115, 315, 120, 315, 345, 300, 260, 440, 315, 310, 135, 375, 455, 130, 370, 330]),
      tee('forward', 'Forward', 64.4, 117, [420, 375, 110, 265, 115, 305, 315, 290, 250, 350, 290, 250, 125, 335, 395, 120, 330, 300]),
    ],
  },
  {
    id: 'tobacco-road', name: 'Tobacco Road', extra: false, note: 'Strantz, blind everything', par: 71, defaultTee: 'ripper',
    holes: holesOf(
      [5, 4, 3, 5, 4, 3, 4, 3, 4, 4, 5, 4, 5, 3, 4, 4, 3, 4],
      [3, 11, 17, 9, 15, 13, 7, 5, 1, 6, 10, 14, 2, 8, 12, 16, 18, 4]
    ),
    tees: [
      tee('ripper', 'Ripper', 72.5, 145, [558, 392, 152, 535, 333, 148, 411, 178, 427, 441, 531, 419, 573, 194, 365, 326, 142, 432]),
      tee('disc', 'Disc', 71.3, 143, [547, 377, 147, 507, 322, 143, 401, 173, 415, 421, 511, 412, 536, 178, 358, 321, 134, 414]),
      tee('disc-plow', 'Disc/Plow Hybrid', 70.0, 136, [521, 344, 147, 507, 322, 143, 383, 173, 394, 398, 511, 380, 497, 178, 358, 281, 134, 369]),
      tee('plow', 'Plow', 69.4, 132, [521, 344, 125, 478, 315, 133, 383, 152, 394, 398, 486, 380, 497, 152, 351, 281, 127, 369]),
      tee('points', 'Points', 66.9, 125, [478, 301, 112, 466, 309, 107, 353, 142, 364, 365, 361, 347, 455, 111, 311, 266, 102, 352]),
      // USGA rates this tee at par 70 (the course is par 71 from the others).
      tee('cultivator', 'Cultivator', 62.6, 117, [315, 280, 91, 368, 297, 107, 248, 132, 269, 242, 290, 291, 429, 96, 267, 248, 84, 242], null, 70),
    ],
  },
  {
    // New par-3 course at Tobacco Road (opened Aug 2026): 12 holes, 40-105 yds.
    // No hole-by-hole card or rating is published yet, so there is one
    // "Standard" tee rated at par / slope 113 (course handicap = index) and SI
    // follows hole order. Replace with the real card when you have it.
    id: 'the-matchbox', name: 'The Matchbox', extra: true, note: '12 par 3s, 40–105 yds', par: 36, defaultTee: 'standard',
    holes: holesOf(
      [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    ),
    tees: [{ id: 'standard', name: 'Standard', rating: 36, slope: 113, yards: null, total: null }],
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

// Logo palette (keep in step with the CSS variables in styles.css).
const TEAM1_COLOR = '#0b1a5a';      // navy
const TEAM2_TEXT = '#4d5262';       // darker silver, readable as text
const INK = '#0a1030';
