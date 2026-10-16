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
3. Open the Pages URL on a phone, enter the trip code, pick your name. Share
   the invite link (Teams tab > "Copy invite link") with the group.

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

There are no logins. The **trip code** is the only gate: data lives under
`trips/<code>/`, and nothing outside that path is readable. Pick a code that
isn't guessable, and only share the invite link with the group.

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
