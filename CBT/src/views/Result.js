import ResultReport from "../components/ResultReport.js";
import { getAttempt, getAttemptDetails } from "../lib/db.js";
import { authState } from "../state/auth.js";

export default {
  name: "ResultView",
  components: { ResultReport },
  data() {
    return {
      loading: true,
      error: "",
      attempt: null,
      details: null
    };
  },
  watch: {
    "$route.params.id": {
      immediate: true,
      handler: "load"
    }
  },
  methods: {
    async load() {
      this.loading = true;
      this.error = "";
      this.attempt = null;
      this.details = null;
      const id = this.$route.params.id;
      if (!id) {
        this.error = "Missing report id.";
        this.loading = false;
        return;
      }
      try {
        const attempt = await getAttempt(id);
        if (!attempt) throw new Error("This report no longer exists.");
        if (attempt.userId !== authState.user?.uid) throw new Error("You cannot open this report.");
        const details = await getAttemptDetails(id);
        if (!details || !details.questions?.length) {
          throw new Error("Full question review was not saved for this attempt.");
        }
        this.attempt = attempt;
        this.details = details;
      } catch (err) {
        this.error = err.message;
      } finally {
        this.loading = false;
      }
    }
  },
  template: `
  <div class="max-w-6xl mx-auto p-6 space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <div class="text-xs font-bold text-red-500 uppercase tracking-widest">Saved examination report</div>
        <h1 class="text-xl font-bold text-zinc-100 mt-1">Question review</h1>
      </div>
      <router-link to="/dashboard" class="bg-red-900 hover:bg-red-800 text-white px-5 py-2.5 rounded-lg font-bold text-xs border border-red-700">← Dashboard</router-link>
    </div>
    <div v-if="loading" class="text-sm text-zinc-400">Loading full paper, answers, and explanations…</div>
    <div v-else-if="error" class="bg-red-950/40 border border-red-900 text-red-300 text-sm rounded-xl p-4">{{ error }}</div>
    <ResultReport v-else :attempt="attempt" :details="details" />
  </div>
  `
};
