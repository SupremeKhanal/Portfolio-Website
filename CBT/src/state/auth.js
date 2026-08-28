import { reactive } from "vue";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { auth, googleProvider, isFirebaseConfigured } from "../firebase.js";
import { getUserProfile, upsertUserProfile } from "../lib/db.js";
import { adminUids } from "../config.js";

export const authState = reactive({
  ready: false,
  user: null,
  profile: null,
  error: ""
});

export function isAdmin() {
  return Boolean(authState.user && adminUids.includes(authState.user.uid));
}

export async function refreshProfile() {
  if (!authState.user) {
    authState.profile = null;
    return;
  }
  authState.profile = await getUserProfile(authState.user.uid);
}

if (isFirebaseConfigured() && auth) {
  onAuthStateChanged(auth, async (user) => {
    authState.user = user;
    try {
      if (user) {
        await upsertUserProfile(user);
        authState.profile = await getUserProfile(user.uid);
      } else {
        authState.profile = null;
      }
    } catch (err) {
      authState.error = err.message;
    } finally {
      authState.ready = true;
    }
  });
} else {
  authState.ready = true;
}

/* ── Login rate-limiter ─────────────────────────────────────────────── */
const LOGIN_WINDOW_MS = 60_000;   // 1 minute window
const MAX_LOGIN_ATTEMPTS = 5;     // max attempts per window
const loginLog = [];              // timestamps of recent attempts

function isLoginThrottled() {
  const now = Date.now();
  // Purge entries older than the window
  while (loginLog.length && loginLog[0] < now - LOGIN_WINDOW_MS) loginLog.shift();
  return loginLog.length >= MAX_LOGIN_ATTEMPTS;
}

function recordLoginAttempt() {
  loginLog.push(Date.now());
}

export async function signInGoogle() {
  if (!isFirebaseConfigured()) throw new Error("Firebase is not configured. Copy src/config.example.js to src/config.js.");

  if (isLoginThrottled()) {
    throw new Error("Too many sign-in attempts. Please wait a minute and try again.");
  }
  recordLoginAttempt();

  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    if (err.code === "auth/popup-blocked") {
      await signInWithRedirect(auth, googleProvider);
      return;
    }
    throw err;
  }
}

export async function signOut() {
  if (auth) await fbSignOut(auth);
}