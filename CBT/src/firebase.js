import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app-check.js";
import { firebaseConfig } from "./config.js";

export function isFirebaseConfigured() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
}

let app = null;
export let auth = null;
export let db = null;
export let appCheck = null;
export const googleProvider = new GoogleAuthProvider();

if (isFirebaseConfigured()) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    // Initialize Firebase App Check if reCAPTCHA v3 site key is provided
    if (firebaseConfig.recaptchaSiteKey) {
      try {
        // Enable debug token for localhost / 127.0.0.1 testing
        if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
          self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
        }
        appCheck = initializeAppCheck(app, {
          provider: new ReCaptchaV3Provider(firebaseConfig.recaptchaSiteKey),
          isTokenAutoRefreshEnabled: true
        });
      } catch (appCheckErr) {
        console.warn("App Check initialization skipped or failed:", appCheckErr.message);
      }
    }
  } catch (err) {
    console.error("Firebase failed to start:", err);
    app = null;
    auth = null;
    db = null;
    appCheck = null;
  }
}