import { authState } from "../state/auth.js";
import { listPyqSets, getPyqQuestions } from "../lib/db.js";
import { loadQuestions, examSession } from "../state/session.js";
import { presetParams } from "../lib/scoring.js";

export default {
  name: "PyqLibraryView",
  data() {
    return { sets: [], loading: true, error: "", filter: authState.profile?.examMode === "CEE" ? "CEE" : "IOE" };
  },
  async mounted() {
    await this.reload();
  },
  methods: {
    async reload() {
      this.loading = true;
      this.error = "";
      try {
        this.sets = await listPyqSets(this.filter);
      } catch (err) {
        this.error = err.message;
      } finally {
        this.loading = false;
      }
    },
    async startSet(set) {
      try {
        const questions = await getPyqQuestions(set.id);
        if (!questions.length) throw new Error("This set has no questions yet.");
        examSession.params = presetParams(set.examMode);
        loadQuestions(questions, { title: set.title, source: "pyq", mode: set.examMode });
        examSession.timeLeft = examSession.params.duration * 60;
        examSession.timeSpent = 0;
        this.$router.push({ name: "exam" });
      } catch (err) {
        alert(err.message);
      }
    }
  },
  watch: {
    async filter() {
      await this.reload();
    }
  },
  template: `
  <div class="max-w-6xl mx-auto px-4 py-8 space-y-6">
    <div>
      <h1 class="text-2xl font-semibold text-slate-50 tracking-tight">PYQ Bank</h1>
      <p class="text-sm text-slate-400 mt-1">Past papers from Firestore. These do not use your daily conversion quota.</p>
    </div>
    <div class="flex gap-2">
      <button v-for="m in ['IOE','CEE']" :key="m" @click="filter = m" class="px-4 py-2 text-sm rounded-xl border font-medium" :class="filter === m ? 'bg-sky-600 border-sky-500 text-white' : 'bg-slate-950 border-slate-700 text-slate-400'">{{ m }}</button>
    </div>
    <p v-if="loading" class="text-sm text-slate-400">Loading sets…</p>
    <p v-else-if="error" class="text-sm text-rose-400">{{ error }}</p>
    <p v-else-if="!sets.length" class="text-sm text-slate-500">No published sets for {{ filter }} yet.</p>
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <button v-for="s in sets" :key="s.id" @click="startSet(s)" class="text-left bg-slate-900 border border-slate-800 hover:border-sky-700 rounded-2xl p-5 space-y-2">
        <div class="text-[11px] font-semibold uppercase tracking-wide text-sky-400">{{ s.examMode }} · {{ s.year }}</div>
        <div class="font-medium text-slate-100">{{ s.title }}</div>
        <div class="text-sm text-slate-500">{{ s.label }} · {{ s.questionCount }} questions</div>
      </button>
    </div>
  </div>
  `
};
