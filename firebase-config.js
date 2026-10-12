// LIVE SYNC SETUP
// Replace the block below with the config Firebase shows you (Project
// settings > Your apps > Web app). Keep the variable name `firebaseConfig`.
// These values are public identifiers, not passwords — it is normal for them
// to sit in a public repo. Leave the PASTE_ placeholders and the app simply
// runs on this phone only, with no sync.

const firebaseConfig = {
  apiKey: "AIzaSyAmhxKLlT4HlHrmDbrEIDelxjUw2ZmA-to",
  authDomain: "hawks-cup.firebaseapp.com",
  projectId: "hawks-cup",
  storageBucket: "hawks-cup.firebasestorage.app",
  messagingSenderId: "523740168069",
  appId: "1:523740168069:web:2c86b84fc2d2c28dbb4eec",
};

window.FIREBASE_CONFIG = window.FIREBASE_CONFIG ||
  (String(firebaseConfig.apiKey).indexOf('PASTE_') === 0 ? null : firebaseConfig);
