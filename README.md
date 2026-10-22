# The Hawks Cup — web app

Installable, offline-capable web app (PWA) for the Hawks Cup golf trip. Plain
HTML/CSS/JS: no build step, no npm. Every file sits in this one flat folder
(no subfolders, so it uploads to GitHub with a single drag-and-drop).

## Going live (GitHub Pages + Firebase)

1. **Firebase** (free): create a project, add a Web app, create a Firestore
   database, publish the rules below, then paste the web-app config over the
   `firebaseConfig` block in `firebase-config.js`.
2. **GitHub Pages**: upload every file in this folder to a public repo,
   Settings > Pages > deploy from `main` / root.
3. Open the Pages URL on a phone, pick **2026 Live Tournament** (or **Practice**
   for testing), then pick your name. No code to type. Share the site link
   (Teams tab > "Copy the site link") with the group.

Firestore rules (production mode):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /trips/{tripId}/{document=**} {
      allow read, write: if true;
    }
  }
}
```

(The wider `{document=**}` path is what lets scorecard photos share between
phones. Without it everything else still works, and photos stay on the phone
that took them.)

There are no logins and no codes to type. The app has two fixed trips,
`hawks-practice` and `hawks-2026-live` (see `sync.js`), stored under
`trips/<name>/`. Anyone who has the site link can open either one, so only
share the link with the group.

Scheduled clear: on 4 or 5 Nov 2026 (before the first round) the first phone to
open a trip wipes its scores, money, chat and photos once and stamps the trip so
it never happens again (see `SCHEDULED_CLEAR` in `sync.js`). Handicaps and team
names are kept. From 6 Nov 2026 the Live Tournament can't be cleared by anyone
(`LIVE_START`); Practice can still be cleared any time.

Team-event tiebreaker: if every point is in and it is 12-12, net stableford over
the Saturday singles decides it (each player on his own handicap). If that is level
too, a playoff winner is recorded in the app. No countbacks. See
`stablefordTiebreak` in `derive.js`.

Side matches (the Side tab, `sidematch.js`): optional individual games on top of
the team event. Every one is a Nassau (front, back, overall bets, each with its own
pot). Match play, stableford or stroke play, net / gross / custom strokes, any
players, rounds and holes, a stake per bet and a payout. They are scored from
the gross scores already entered in the team matches and synced as `sm_*` docs.

Without a Firebase config the app still works, saving on that phone only.

## Scorecard photos

Rounds > **Scorecards & verify**: add photos of the paper cards, compare them
with the scores in the app (tap any score to fix it), then mark the round
verified. The stamp goes stale if a score changes afterwards. Photos are
shrunk on the phone (`photos.js`); only a tiny thumbnail rides along with the
normal sync, and the full image is fetched when someone opens it.

## How sync works

- One Firestore document per session, match, ledger entry, feed post and
  side-game event (`store.js` `flattenState`/`assembleState`), so two scorers
  on different matches never overwrite each other.
- A phone never writes until it has adopted what's on the server (or the
  server confirmed the trip is empty), so a stale phone can't clobber live
  scores. Writes made without signal queue and flush when it returns.
- Unposted strokes, the hole you're viewing, "who am I" and the trip code are
  per-phone (`state.ui`) and never synced. Only "Post hole" writes to the
  shared match.

## Files

- `index.html`, `styles.css`, `manifest.webmanifest`, `sw.js`, `icon*.png/svg`
- `firebase-config.js` — the one file you edit to turn sync on
- `data.js` players, courses, game types · `engine.js` scoring math ·
  `derive.js` ledger/records/awards · `store.js` state + doc mapping ·
  `sync.js` Firestore sync · `actions.js` all mutations · `render.js` UI ·
  `main.js` events + boot

## Local testing

Any static file server works (`npx serve .`, `python -m http.server`), or
open `index.html` directly (sync and install need http/https).
