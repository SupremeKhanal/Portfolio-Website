import { authState } from "../state/auth.js";
import { createdAtDate, firestorePermissionHint, getQuotaCount, incrementQuota, isPermissionDenied, listAttempts } from "../lib/db.js";
import { processSourceWithGemini } from "../lib/gemini.js";
import { examSession, loadQuestions } from "../state/session.js";
import { formatTime, presetParams, subjectsForMode } from "../lib/scoring.js";

const GEMINI_KEY = "cbt_gemini_key";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default {
  name: "DashboardView",
  data() {
    return {
      attempts: [],
      quota: 0,
      maxQuota: 10,
      sourceType: "pdf",
      files: [],
      isProcessing: false,
      processingStatus: "",
      loading: true
    };
  },
  computed: {
    mode() {
      return authState.profile?.examMode || "IOE";
    },
    showSubjects() {
      return this.mode === "IOE" || this.mode === "CEE";
    },
    grouped() {
      const groups = {};
      this.attempts.forEach((a) => {
        const d = createdAtDate(a.createdAt);
        const key = d.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
        if (!groups[key]) groups[key] = [];
        groups[key].push(a);
      });
      return groups;
    },
    overallAvg() {
      if (!this.attempts.length) return null;
      const sum = this.attempts.reduce((acc, a) => acc + (Number(a.percent) || 0), 0);
      return sum / this.attempts.length;
    },
    subjectAverages() {
      const names = subjectsForMode(this.mode);
      const out = {};
      names.forEach((name) => {
        const rows = this.attempts
          .map((a) => a.subjectStats?.[name])
          .filter((s) => s && s.totalMarks);
        if (!rows.length) {
          out[name] = null;
          return;
        }
        const pct = rows.reduce((acc, s) => acc + (s.score / s.totalMarks) * 100, 0) / rows.length;
        out[name] = pct;
      });
      return out;
    },
    loadedCount() {
      return examSession.questions.length;
    },
    sessionParams() {
      return examSession.params;
    }
  },
  async mounted() {
    examSession.params = { ...presetParams(this.mode), ...examSession.params };
    await this.refresh();
  },
  methods: {
    formatTime,
    async refresh() {
      this.loading = true;
      try {
        const uid = authState.user.uid;
        this.quota = await getQuotaCount(uid);
        this.attempts = await listAttempts(uid, this.mode);
      } catch (err) {
        console.error(err);
      } finally {
        this.loading = false;
      }
    },
    onFiles(e) {
      this.setFiles(Array.from(e.target.files || []));
    },
    onDrop(e) {
      this.setFiles(Array.from(e.dataTransfer.files || []));
    },
    setFiles(list) {
      if (this.sourceType === "pdf") {
        const pdf = list.find((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
        this.files = pdf ? [pdf] : [];
        return;
      }
      const images = list.filter((f) => IMAGE_TYPES.includes(f.type)).slice(0, 10);
      this.files = images;
    },
    fileLabel() {
      if (!this.files.length) return this.sourceType === "pdf" ? "PDF exam paper" : "Up to 10 images";
      if (this.files.length === 1) return this.files[0].name;
      return `${this.files.length} images`;
    },
    async convert() {
      if (this.quota >= this.maxQuota) {
        alert("Daily upload quota reached (10/day).");
        return;
      }
      const apiKey = localStorage.getItem(GEMINI_KEY) || "";
      this.isProcessing = true;
      try {
        const questions = await processSourceWithGemini({
          apiKey,
          files: this.files,
          examMode: this.mode,
          onStatus: (s) => (this.processingStatus = s)
        });
        const title = this.files.length === 1 ? this.files[0].name : `Image set (${this.files.length} files)`;
        loadQuestions(questions, { title, source: "upload", mode: this.mode });
        try {
          await incrementQuota(authState.user.uid);
          this.quota += 1;
        } catch (quotaErr) {
          console.warn(quotaErr);
          alert(`Imported ${questions.length} questions, but quota was not saved.\n\n${firestorePermissionHint(quotaErr)}`);
          return;
        }
        alert(`Imported ${questions.length} questions.`);
      } catch (err) {
        alert(isPermissionDenied(err) ? firestorePermissionHint(err) : err.message);
      } finally {
        this.isProcessing = false;
        this.processingStatus = "";
      }
    },
    startExam() {
      if (!examSession.questions.length) return alert("Convert a paper first, or pick a PYQ set.");
      if (examSession.params.shuffle) {
        examSession.questions = [...examSession.questions].sort(() => Math.random() - 0.5);
      }
      examSession.userAnswers = {};
      examSession.guessedAnswers = {};
      examSession.timeLeft = examSession.params.duration * 60;
      examSession.timeSpent = 0;
      this.$router.push({ name: "exam" });
    }
  },
  template: `
  <div class="max-w-6xl mx-auto px-4 py-6 sm:py-8">
    <div class="flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] gap-8 items-start">
      <aside class="order-1 lg:order-2 w-full space-y-4">
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-slate-300">Daily conversions</span>
            <span class="text-sm font-semibold tabular-nums" :class="quota >= maxQuota ? 'text-rose-400' : 'text-slate-100'">{{ quota }} / {{ maxQuota }}</span>
          </div>
          <div class="flex gap-2">
            <button @click="sourceType = 'pdf'" class="flex-1 py-2.5 rounded-xl text-sm font-medium border" :class="sourceType === 'pdf' ? 'bg-sky-600 border-sky-500 text-white' : 'bg-slate-950 border-slate-700 text-slate-400'">PDF</button>
            <button @click="sourceType = 'images'" class="flex-1 py-2.5 rounded-xl text-sm font-medium border" :class="sourceType === 'images' ? 'bg-sky-600 border-sky-500 text-white' : 'bg-slate-950 border-slate-700 text-slate-400'">Images</button>
          </div>
          <div @dragover.prevent @drop.prevent="onDrop" class="rounded-xl border border-dashed border-slate-700 bg-slate-950 p-4 text-center space-y-3">
            <p class="text-sm text-slate-300 break-all">{{ fileLabel() }}</p>
            <label class="inline-block cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm px-4 py-2 rounded-lg">
              Choose file
              <input type="file" class="hidden" :accept="sourceType === 'pdf' ? 'application/pdf' : 'image/jpeg,image/png,image/webp'" :multiple="sourceType === 'images'" @change="onFiles" />
            </label>
          </div>
          <button @click="convert" :disabled="isProcessing || !files.length || quota >= maxQuota" class="w-full py-3 rounded-xl text-sm font-semibold" :class="isProcessing || !files.length || quota >= maxQuota ? 'bg-slate-800 text-slate-500' : 'bg-sky-600 hover:bg-sky-500 text-white'">
            {{ isProcessing ? processingStatus : 'Convert to test' }}
          </button>
          <div class="space-y-3 text-sm text-slate-400 pt-2 border-t border-slate-800">
            <div class="flex justify-between"><span>Loaded</span><strong class="text-slate-100">{{ loadedCount }} Q</strong></div>
            <label class="flex justify-between items-center gap-3">Duration (min)<input type="number" v-model.number="sessionParams.duration" class="w-20 bg-slate-950 border border-slate-700 rounded-lg p-2 text-center text-slate-100" /></label>
            <label class="flex justify-between items-center gap-3">Pass %<input type="number" v-model.number="sessionParams.passPercent" class="w-20 bg-slate-950 border border-slate-700 rounded-lg p-2 text-center text-slate-100" /></label>
            <label class="flex justify-between items-center gap-3">Negative
              <select v-model.number="sessionParams.negativeMarkingRate" class="w-24 bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-100">
                <option :value="0">0%</option>
                <option :value="0.10">10%</option>
                <option :value="0.20">20%</option>
                <option :value="0.25">25%</option>
              </select>
            </label>
            <label class="flex justify-between items-center">Shuffle<input type="checkbox" v-model="sessionParams.shuffle" class="accent-sky-500 w-4 h-4" /></label>
            <button @click="startExam" class="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold">Start exam</button>
          </div>
        </div>
      </aside>

      <div class="order-2 lg:order-1 space-y-6 min-w-0">
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8">
          <p class="text-xs font-semibold uppercase tracking-wider text-sky-400">{{ mode }} average</p>
          <p class="mt-2 text-4xl sm:text-5xl font-semibold tracking-tight text-slate-50">{{ overallAvg == null ? '—' : overallAvg.toFixed(1) + '%' }}</p>
          <p class="text-sm text-slate-500 mt-2">{{ attempts.length }} saved attempt{{ attempts.length === 1 ? '' : 's' }}</p>
        </div>

        <div v-if="showSubjects" class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
          <div v-for="(pct, name) in subjectAverages" :key="name" class="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div class="text-[11px] uppercase tracking-wide text-slate-500">{{ name }}</div>
            <div class="text-lg font-semibold text-slate-100 mt-1">{{ pct == null ? '—' : pct.toFixed(1) + '%' }}</div>
          </div>
        </div>

        <p v-if="loading" class="text-sm text-slate-400">Loading history…</p>
        <div v-else-if="!attempts.length" class="text-sm text-slate-500 border border-dashed border-slate-800 rounded-2xl p-6 leading-relaxed">
          Convert a PDF or images above, sit the exam, and reports will appear here.
        </div>
        <div v-else class="space-y-6">
          <div v-for="(cards, date) in grouped" :key="date" class="space-y-3">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-slate-500">{{ date }}</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div v-for="a in cards" :key="a.id" class="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="text-sm font-medium text-slate-100 truncate">{{ a.title }}</div>
                    <div class="text-xs text-slate-500 mt-1">{{ a.source === 'pyq' ? 'PYQ' : 'Upload' }} · {{ a.questionCount }} Q · {{ formatTime(a.timeSpent) }}</div>
                  </div>
                  <span :class="a.passed ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'" class="text-[10px] font-semibold px-2 py-1 rounded-md shrink-0">{{ a.passed ? 'PASS' : 'FAIL' }}</span>
                </div>
                <div class="text-lg font-semibold">{{ Number(a.score).toFixed(2) }} <span class="text-slate-500 text-sm font-normal">/ {{ a.totalMarks }}</span></div>
                <router-link :to="{ name: 'result', params: { id: a.id } }" class="inline-block text-sm font-medium bg-slate-800 hover:bg-slate-700 rounded-lg px-3 py-2">View report</router-link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  `
};