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
  <div class="max-w-6xl mx-auto px-4 py-6 space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wider text-sky-400">Examination report</p>
        <h1 class="text-xl font-semibold text-slate-50 mt-1">Question review</h1>
      </div>
      <router-link to="/dashboard" class="bg-slate-800 hover:bg-slate-700 text-slate-100 px-4 py-2.5 rounded-xl font-medium text-sm">Dashboard</router-link>
    </div>
    <div v-if="loading" class="text-sm text-slate-400">Loading report…</div>
    <div v-else-if="error" class="bg-rose-500/10 border border-rose-500/30 text-rose-200 text-sm rounded-2xl p-4">{{ error }}</div>
    <ResultReport v-else :attempt="attempt" :details="details" />
  </div>
  `
};
