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
  <div class="min-h-[80vh] flex items-center justify-center p-4">
    <div class="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6">
      <h1 class="text-2xl font-semibold text-slate-50 tracking-tight">Exam track</h1>
      <p class="text-sm text-slate-400 leading-relaxed">This sets marking defaults. You can change it later in Settings.</p>
      <div class="space-y-2">
        <button v-for="opt in [{id:'IOE',label:'IOE Engineering Entrance'},{id:'CEE',label:'CEE Medical Entrance'},{id:'OTHER',label:'Other / General MCQ'}]" :key="opt.id" @click="mode = opt.id" class="w-full text-left border rounded-xl px-4 py-3.5 text-sm font-medium" :class="mode === opt.id ? 'bg-sky-600/20 border-sky-500 text-sky-100' : 'bg-slate-950 border-slate-800 text-slate-300'">
          {{ opt.label }}
        </button>
      </div>
      <button :disabled="saving" @click="save" class="w-full bg-sky-600 hover:bg-sky-500 text-white font-semibold py-3 rounded-xl text-sm">
        {{ saving ? 'Saving…' : 'Continue' }}
      </button>
    </div>
  </div>
  `
};
