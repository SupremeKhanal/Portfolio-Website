/**
 * Copy this file to config.js and paste your Firebase web app keys.
 * Firebase console → Project settings → Your apps → SDK setup (config).
 *
 * Never commit real keys if the repo is public. The Gemini API key stays in
 * the user's browser (localStorage), not here.
 */
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

/**
 * Auth UIDs allowed to import PYQ JSON in Settings.
 * Copy the same UIDs into firestore.rules → isAdmin(), then Publish rules.
 * The Settings UI check is not enough; Firestore enforces PYQ writes.
 */
export const adminUids = [];
