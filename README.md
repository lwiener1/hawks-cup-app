# The Hawks Cup — web app

Installable, offline-capable web app (PWA) for the Hawks Cup golf trip. Plain
HTML/CSS/JS: no build step, no npm. This whole folder is the deployable
site — upload its contents as-is.

## Going live (GitHub Pages + Firebase)

1. **Firebase** (free): create a project, add a Web app, create a Firestore
   database, publish the rules below, then paste the web-app config over the
   `firebaseConfig` block in `firebase-config.js`.
2. **GitHub Pages**: upload the contents of this folder to a public repo,
   Settings > Pages > deploy from `main` / root.
3. Open the Pages URL on a phone, enter the trip code, pick your name. Share
   the invite link (Teams tab > "Copy invite link") with the group.

Firestore rules (production mode):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /trips/{tripId}/docs/{docId} {
      allow read, write: if true;
    }
  }
}
```

There are no logins. The **trip code** is the only gate: data lives under
`trips/<code>/`, and nothing outside that path is readable. Pick a code that
isn't guessable, and only share the invite link with the group.

Without a Firebase config the app still works, saving on that phone only.

## How sync works

- One Firestore document per session, match, ledger entry, feed post and
  side-game event (`js/store.js` `flattenState`/`assembleState`), so two
  scorers on different matches never overwrite each other.
- A phone never writes until it has adopted what's on the server (or the
  server confirmed the trip is empty), so a stale phone can't clobber live
  scores. Writes made without signal queue and flush when it returns.
- Unposted strokes, the hole you're viewing, "who am I" and the trip code are
  per-phone (`state.ui`) and never synced. Only "Post hole" writes to the
  shared match.

## Files

- `index.html`, `styles.css`, `manifest.webmanifest`, `sw.js`, `icons/`
- `firebase-config.js` — the one file you edit to turn sync on
- `js/data.js` players, courses, game types · `js/engine.js` scoring math ·
  `js/derive.js` ledger/records/awards · `js/store.js` state + doc mapping ·
  `js/sync.js` Firestore sync · `js/actions.js` all mutations ·
  `js/render.js` UI · `js/main.js` events + boot

## Local testing

Any static file server works (`npx serve .`, `python -m http.server`), or
open `index.html` directly (sync and install need http/https).
