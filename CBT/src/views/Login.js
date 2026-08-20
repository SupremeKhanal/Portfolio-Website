import { isFirebaseConfigured } from "../firebase.js";
import { signInGoogle } from "../state/auth.js";

export default {
  name: "LoginView",
  data() {
    return { error: "", loading: false, configured: isFirebaseConfigured() };
  },
  methods: {
    async login() {
      this.error = "";
      this.loading = true;
      try {
        await signInGoogle();
      } catch (err) {
        this.error = err.message;
      } finally {
        this.loading = false;
      }
    }
  },
  template: `
  <div class="min-h-screen flex items-center justify-center p-6">
    <div class="w-full max-w-md bg-zinc-900/90 border border-zinc-800 rounded-2xl p-8 space-y-5">
      <div>
        <div class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-red-700"></span>
          <span class="text-xs font-bold text-red-500 uppercase tracking-widest">CBT Examination Engine</span>
        </div>
        <h1 class="text-2xl font-bold text-zinc-100 mt-2">Sign in to continue</h1>
        <p class="text-xs text-zinc-400 mt-2">Google Sign-In creates your account. Past exam reports stay attached to you, including full question review.</p>
      </div>
      <div v-if="!configured" class="text-xs text-amber-300 bg-amber-950/40 border border-amber-900 rounded-lg p-3">
        Firebase is not configured. Copy <code>src/config.example.js</code> values into <code>src/config.js</code> from the Firebase console.
      </div>
      <p v-if="error" class="text-xs text-red-400">{{ error }}</p>
      <button :disabled="!configured || loading" @click="login" class="w-full bg-red-900 hover:bg-red-800 disabled:opacity-50 text-white font-bold py-3 rounded-lg text-sm border border-red-700">
        {{ loading ? 'Opening Google…' : 'Continue with Google' }}
      </button>
    </div>
  </div>
  `
};
