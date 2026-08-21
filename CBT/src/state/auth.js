import { reactive } from "vue";
import {
  onAuthStateChanged,
  signInWithRedirect, // Changed from signInWithPopup
  getRedirectResult,   // Added to capture redirect data securely
  signOut as fbSignOut
} from "https://gstatic.com";
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
  // Securely listen to incoming redirect tokens when page lands back from Google
  getRedirectResult(auth)
    .then(async (result) => {
      if (result?.user) {
        await upsertUserProfile(result.user);
        authState.profile = await getUserProfile(result.user.uid);
      }
    })
    .catch((err) => {
      console.error("Authentication redirect error:", err);
      authState.error = err.message;
    });

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

export async function signInGoogle() {
  if (!isFirebaseConfigured()) throw new Error("Firebase is not configured. Copy src/config.example.js to src/config.js.");
  try {
    // Force direct page routing rather than open vulnerable/blocked popups
    await signInWithRedirect(auth, googleProvider);
  } catch (err) {
    throw err;
  }
}

export async function signOut() {
  if (auth) await fbSignOut(auth);
}
