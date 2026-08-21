import { isFirebaseConfigured } from "../firebase.js";
import { signInGoogle, authState } from "../state/auth.js";

export default {
  name: "LoginView",
  data() {
    return { error: "", loading: false, configured: isFirebaseConfigured() };
  },
  watch: {
    'authState.user': {
      handler(newUser) {
        if (newUser) {
          // Change the loading text to let the user know it's redirecting
          this.loading = true;
          
          // Wait 1 second (1000ms) before changing pages or refreshing
          setTimeout(() => {
            // Option A: Hard refresh and go to dashboard (Recommended for your setup)
            window.location.href = window.location.origin + window.location.pathname + '#/dashboard';
            window.location.reload();
          }, 1000);
        }
      },
      immediate: true
    }
  },
  computed: {
    authState() {
      return authState;
    }
  },
  methods: {
    async login() {
      this.error = "";
      this.loading = true;
      try {
        await signInGoogle();
      } catch (err) {
        this.error = err.message;
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
        {{ loading ? 'Redirecting to Dashboard…' : 'Continue with Google' }}
      </button>
    </div>
  </div>
  `
};