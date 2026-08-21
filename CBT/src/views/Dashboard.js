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
        const pdf = list.find((f) => f.type === "application/pdf");
        this.files = pdf ? [pdf] : [];
        return;
      }
      const images = list.filter((f) => IMAGE_TYPES.includes(f.type)).slice(0, 10);
      this.files = images;
    },
    fileLabel() {
      if (!this.files.length) return this.sourceType === "pdf" ? "Select or drop exam PDF" : "Select or drop up to 10 images";
      if (this.files.length === 1) return this.files[0].name;
      return `${this.files.length} images selected`;
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
          alert(
            `Imported ${questions.length} questions, but daily quota was not saved in Firebase.\n\n${firestorePermissionHint(quotaErr)}`
          );
          return;
        }
        alert(`Imported ${questions.length} questions with solutions.`);
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
  <div class="max-w-7xl mx-auto p-6">
    <div class="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
      <div class="space-y-6">
        <div class="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-6">
          <div class="text-xs font-bold text-red-500 uppercase tracking-widest">{{ mode }} average</div>
          <div class="mt-2 text-5xl font-black text-zinc-100">{{ overallAvg == null ? '—' : overallAvg.toFixed(1) + '%' }}</div>
          <p class="text-xs text-zinc-500 mt-2">{{ attempts.length }} saved attempt{{ attempts.length === 1 ? '' : 's' }} in this track</p>
        </div>

        <div v-if="showSubjects" class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          <div v-for="(pct, name) in subjectAverages" :key="name" class="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4">
            <div class="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">{{ name }}</div>
            <div class="text-xl font-bold text-zinc-100 mt-1">{{ pct == null ? '—' : pct.toFixed(1) + '%' }}</div>
          </div>
        </div>

        <div v-if="loading" class="text-sm text-zinc-400">Loading history…</div>
        <div v-else-if="!attempts.length" class="text-sm text-zinc-500 border border-dashed border-zinc-800 rounded-xl p-6">
          No saved papers yet. Convert a PDF or images on the right, sit the exam, and the full question review will stay on these cards.
        </div>
        <div v-else class="space-y-6">
          <div v-for="(cards, date) in grouped" :key="date" class="space-y-3">
            <h3 class="text-xs font-bold uppercase tracking-widest text-zinc-500">{{ date }}</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div v-for="a in cards" :key="a.id" class="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 space-y-3">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <div class="text-sm font-bold text-zinc-100">{{ a.title }}</div>
                    <div class="text-[11px] text-zinc-500 mt-0.5">{{ a.source === 'pyq' ? 'PYQ' : 'Upload' }} · {{ a.questionCount }} Q · {{ formatTime(a.timeSpent) }}</div>
                  </div>
                  <span :class="a.passed ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-red-950 text-red-400 border-red-800'" class="text-[10px] font-bold px-2 py-1 rounded-md border shrink-0">
                    {{ a.passed ? 'PASS' : 'FAIL' }}
                  </span>
                </div>
                <div class="text-lg font-black text-zinc-200">{{ Number(a.score).toFixed(2) }} <span class="text-zinc-500 text-sm font-normal">/ {{ a.totalMarks }}</span></div>
                <router-link :to="{ name: 'result', params: { id: a.id } }" class="inline-block text-xs font-bold bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg px-3 py-2">
                  View full report
                </router-link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside class="lg:sticky lg:top-20 space-y-4">
        <div class="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 space-y-4">
          <div class="flex items-center justify-between">
            <div class="text-xs font-bold uppercase tracking-wider text-zinc-300">Daily quota</div>
            <div class="text-sm font-bold" :class="quota >= maxQuota ? 'text-red-500' : 'text-zinc-100'">{{ quota }} / {{ maxQuota }}</div>
          </div>
          <div class="flex gap-2">
            <button @click="sourceType = 'pdf'" :class="sourceType === 'pdf' ? 'bg-red-950 border-red-800 text-red-200' : 'bg-zinc-950 border-zinc-800 text-zinc-400'" class="flex-1 text-xs font-bold py-2 rounded-lg border">PDF</button>
            <button @click="sourceType = 'images'" :class="sourceType === 'images' ? 'bg-red-950 border-red-800 text-red-200' : 'bg-zinc-950 border-zinc-800 text-zinc-400'" class="flex-1 text-xs font-bold py-2 rounded-lg border">Images (max 10)</button>
          </div>
          <div @dragover.prevent @drop.prevent="onDrop" class="bg-zinc-950 rounded-lg p-4 border border-dashed border-zinc-800 text-center space-y-2">
            <div class="text-xs text-zinc-300">{{ fileLabel() }}</div>
            <label class="inline-block cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs px-3 py-1.5 rounded-lg border border-zinc-700">
              Browse
              <input type="file" class="hidden" :accept="sourceType === 'pdf' ? 'application/pdf' : 'image/jpeg,image/png,image/webp'" :multiple="sourceType === 'images'" @change="onFiles" />
            </label>
          </div>
          <button @click="convert" :disabled="isProcessing || !files.length || quota >= maxQuota" :class="isProcessing || !files.length || quota >= maxQuota ? 'opacity-50 cursor-not-allowed bg-zinc-800 text-zinc-500' : 'bg-red-900 hover:bg-red-800 text-white'" class="w-full font-bold py-2.5 rounded-lg text-xs border border-red-700/50">
            {{ isProcessing ? processingStatus : 'Convert to test paper' }}
          </button>
          <div class="border-t border-zinc-800 pt-3 space-y-2 text-xs">
            <div class="flex justify-between text-zinc-400"><span>Loaded</span><strong class="text-zinc-100">{{ loadedCount }} Q</strong></div>
            <div class="flex justify-between items-center"><span class="text-zinc-400">Duration (min)</span><input type="number" v-model.number="sessionParams.duration" class="w-20 bg-zinc-950 border border-zinc-800 rounded p-1 text-center" /></div>
            <div class="flex justify-between items-center"><span class="text-zinc-400">Pass %</span><input type="number" v-model.number="sessionParams.passPercent" class="w-20 bg-zinc-950 border border-zinc-800 rounded p-1 text-center" /></div>
            <div class="flex justify-between items-center">
              <span class="text-zinc-400">Negative</span>
              <select v-model.number="sessionParams.negativeMarkingRate" class="w-28 bg-zinc-950 border border-zinc-800 text-red-400 rounded p-1">
                <option :value="0">0%</option>
                <option :value="0.10">10%</option>
                <option :value="0.20">20%</option>
                <option :value="0.25">25%</option>
              </select>
            </div>
            <label class="flex items-center justify-between text-zinc-400"><span>Shuffle</span><input type="checkbox" v-model="sessionParams.shuffle" class="accent-red-700" /></label>
            <button @click="startExam" class="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold py-2.5 rounded-lg border border-zinc-700">▶ Start exam</button>
          </div>
        </div>
      </aside>
    </div>
  </div>
  `
};
