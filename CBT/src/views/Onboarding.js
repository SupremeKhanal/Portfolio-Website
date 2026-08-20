import { authState, refreshProfile } from "../state/auth.js";
import { upsertUserProfile } from "../lib/db.js";

export default {
  name: "OnboardingView",
  data() {
    return { mode: "IOE", saving: false };
  },
  methods: {
    async save() {
      this.saving = true;
      try {
        await upsertUserProfile(authState.user, { examMode: this.mode });
        await refreshProfile();
        this.$router.replace({ name: "dashboard" });
      } catch (err) {
        alert(err.message);
      } finally {
        this.saving = false;
      }
    }
  },
  template: `
  <div class="min-h-screen flex items-center justify-center p-6">
    <div class="w-full max-w-lg bg-zinc-900/90 border border-zinc-800 rounded-2xl p-8 space-y-5">
      <h1 class="text-2xl font-bold text-zinc-100">Choose your exam track</h1>
      <p class="text-xs text-zinc-400">This sets marking defaults and dashboard subjects. You can change it later in Settings.</p>
      <div class="space-y-2">
        <button v-for="opt in [{id:'IOE',label:'IOE Engineering Entrance'},{id:'CEE',label:'CEE Medical Entrance'},{id:'OTHER',label:'Other / General MCQ'}]" :key="opt.id" @click="mode = opt.id" :class="mode === opt.id ? 'bg-red-950 border-red-800 text-red-200' : 'bg-zinc-950 border-zinc-800 text-zinc-300'" class="w-full text-left border rounded-lg px-4 py-3 text-sm font-semibold">
          {{ opt.label }}
        </button>
      </div>
      <button :disabled="saving" @click="save" class="w-full bg-red-900 hover:bg-red-800 text-white font-bold py-3 rounded-lg text-sm border border-red-700">
        {{ saving ? 'Saving…' : 'Continue' }}
      </button>
    </div>
  </div>
  `
};
