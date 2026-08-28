import { isFirebaseConfigured } from "../firebase.js";
import { signInGoogle } from "../state/auth.js";

/* Map Firebase error codes to safe, user-friendly messages */
function safifyAuthError(err) {
  const map = {
    "auth/popup-closed-by-user": "Sign-in popup was closed. Please try again.",
    "auth/cancelled-popup-request": "Another sign-in is already in progress.",
    "auth/network-request-failed": "Network error — check your internet connection.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment.",
    "auth/user-disabled": "This account has been disabled. Contact support.",
    "auth/popup-blocked": "Pop-up was blocked by your browser. Allow pop-ups and try again."
  };
  if (err.code && map[err.code]) return map[err.code];
  // Don't leak raw Firebase internals
  if (/firebase/i.test(err.message || "")) return "Authentication failed. Please try again.";
  return err.message || "An unexpected error occurred.";
}

export default {
  name: "LoginView",
  data() {
    return {
      error: "",
      loading: false,
      configured: isFirebaseConfigured()
    };
  },
  methods: {
    async login() {
      this.error = "";
      this.loading = true;
      try {
        await signInGoogle();
        window.location.reload();
      } catch (err) {
        this.error = safifyAuthError(err);
      } finally {
        this.loading = false;
      }
    }
  },
  template: `
    <div class="min-h-[80vh] flex items-center justify-center p-4">
      <div class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wider text-sky-400">CBT Portal</p>
          <h1 class="text-2xl font-semibold text-slate-50 mt-2 tracking-tight">Sign in</h1>
          <p class="text-sm text-slate-400 mt-2 leading-relaxed">Google Sign-In keeps your papers and reports on this account.</p>
        </div>
        <div v-if="!configured" class="text-sm text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
          Firebase is not configured. Add keys to <code>src/config.js</code>.
        </div>
        <p v-if="error" class="text-sm text-rose-400">{{ error }}</p>
        <button :disabled="!configured || loading" @click="login" class="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm">
          {{ loading ? 'Opening Google…' : 'Continue with Google' }}
        </button>
      </div>
    </div>
  `
};
