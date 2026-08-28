import { authState } from "../state/auth.js";
import {
  createdAtDate,
  firestorePermissionHint,
  getAttemptDetails,
  getQuotaCount,
  incrementQuota,
  isPermissionDenied,
  listAttempts,
  updateAttemptLabel
} from "../lib/db.js";
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
      loading: true,
      showUpload: false,
      examLabel: "",
      editingLabelId: null,
      editingLabelValue: "",
      regivingId: null
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
    overallAvgMarks() {
      if (!this.attempts.length) return null;
      const totalScore = this.attempts.reduce((acc, a) => acc + (Number(a.score) || 0), 0);
      const totalPossible = this.attempts.reduce((acc, a) => acc + (Number(a.totalMarks) || 0), 0);
      if (!totalPossible) return null;
      return { score: totalScore / this.attempts.length, total: totalPossible / this.attempts.length };
    },
    overallAvgPercent() {
      if (!this.attempts.length) return null;
      return this.attempts.reduce((acc, a) => acc + (Number(a.percent) || 0), 0) / this.attempts.length;
    },
    latestAttempt() {
      return this.attempts[0] || null;
    },
    subjectAverages() {
      const names = subjectsForMode(this.mode);
      const out = {};
      names.forEach((name) => {
        const rows = this.attempts
          .map((a) => a.subjectStats?.[name])
          .filter((s) => s && s.totalMarks);
        if (!rows.length) { out[name] = null; return; }
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

    /** Score-bar colour based on percentage */
    scoreColor(pct) {
      if (pct >= 70) return "bg-emerald-500";
      if (pct >= 40) return "bg-amber-400";
      return "bg-rose-500";
    },
    scoreTextColor(pct) {
      if (pct >= 70) return "text-emerald-400";
      if (pct >= 40) return "text-amber-400";
      return "text-rose-400";
    },
    /** Gradient for score bar stripe */
    scoreBarStyle(pct) {
      const clamped = Math.min(100, Math.max(0, pct));
      return `width: ${clamped}%`;
    },

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

    onFiles(e) { this.setFiles(Array.from(e.target.files || [])); },
    onDrop(e) { this.setFiles(Array.from(e.dataTransfer.files || [])); },
    setFiles(list) {
      if (this.sourceType === "pdf") {
        const pdf = list.find((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
        this.files = pdf ? [pdf] : [];
        return;
      }
      this.files = list.filter((f) => IMAGE_TYPES.includes(f.type)).slice(0, 10);
    },
    fileLabel() {
      if (!this.files.length) return this.sourceType === "pdf" ? "Drop PDF here or choose file" : "Up to 10 images";
      if (this.files.length === 1) return this.files[0].name;
      return `${this.files.length} images selected`;
    },

    async convert() {
      if (this.quota >= this.maxQuota) { alert("Daily upload quota reached (10/day)."); return; }
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
        loadQuestions(questions, { title, source: "upload", mode: this.mode, label: this.examLabel });
        try {
          await incrementQuota(authState.user.uid);
          this.quota += 1;
        } catch (quotaErr) {
          console.warn(quotaErr);
          alert(`Imported ${questions.length} questions, but quota was not saved.\n\n${firestorePermissionHint(quotaErr)}`);
          return;
        }
        alert(`Imported ${questions.length} questions. Click "Start exam" to begin.`);
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
    },

    /** Re-give a past attempt with the same questions */
    async regiveAttempt(attempt) {
      this.regivingId = attempt.id;
      try {
        const details = await getAttemptDetails(attempt.id);
        if (!details || !details.questions?.length) throw new Error("Could not load questions for this attempt.");
        loadQuestions(details.questions, {
          title: attempt.title,
          source: attempt.source || "upload",
          mode: attempt.examMode,
          label: attempt.label ? `Re: ${attempt.label}` : `Re-give`
        });
        examSession.params = {
          duration: details.params?.duration || presetParams(attempt.examMode).duration,
          passPercent: details.params?.passPercent || 40,
          negativeMarkingRate: details.params?.negativeMarkingRate || 0,
          shuffle: false
        };
        examSession.userAnswers = {};
        examSession.guessedAnswers = {};
        examSession.timeLeft = examSession.params.duration * 60;
        examSession.timeSpent = 0;
        this.$router.push({ name: "exam" });
      } catch (err) {
        alert(err.message);
      } finally {
        this.regivingId = null;
      }
    },

    /** Inline label editing */
    startEditLabel(attempt) {
      this.editingLabelId = attempt.id;
      this.editingLabelValue = attempt.label || "";
    },
    async saveLabel(attempt) {
      try {
        await updateAttemptLabel(attempt.id, this.editingLabelValue);
        attempt.label = this.editingLabelValue;
      } catch (err) {
        alert("Could not save label: " + err.message);
      } finally {
        this.editingLabelId = null;
        this.editingLabelValue = "";
      }
    },
    cancelEditLabel() {
      this.editingLabelId = null;
      this.editingLabelValue = "";
    }
  },

  template: `
  <div class="max-w-6xl mx-auto px-4 py-5 sm:py-8 space-y-6">

    <!-- ── Top Stats Row ─────────────────────────────────────────── -->
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">

      <!-- Overall average in marks format -->
      <div class="col-span-2 sm:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6">
        <p class="text-[11px] font-semibold uppercase tracking-wider text-sky-400">{{ mode }} — Avg Score</p>
        <div class="mt-2 flex items-end gap-2 flex-wrap">
          <span class="text-4xl sm:text-5xl font-black text-slate-50 tabular-nums">
            {{ overallAvgMarks ? overallAvgMarks.score.toFixed(1) : '—' }}
          </span>
          <span v-if="overallAvgMarks" class="text-xl text-slate-500 font-normal pb-1">/ {{ overallAvgMarks.total.toFixed(0) }}</span>
        </div>
        <p v-if="overallAvgPercent != null" :class="scoreTextColor(overallAvgPercent)" class="text-sm font-semibold mt-1">
          {{ overallAvgPercent.toFixed(1) }}%
        </p>
        <!-- Overall avg bar -->
        <div v-if="overallAvgPercent != null" class="mt-3 h-2 bg-slate-800 rounded-full overflow-hidden">
          <div class="h-full rounded-full transition-all duration-700" :class="scoreColor(overallAvgPercent)" :style="scoreBarStyle(overallAvgPercent)"></div>
        </div>
        <p class="text-xs text-slate-500 mt-2">{{ attempts.length }} saved attempt{{ attempts.length === 1 ? '' : 's' }}</p>
      </div>

      <!-- Latest exam mini-card -->
      <div class="col-span-2 sm:col-span-1 bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
        <p class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Latest Exam</p>
        <template v-if="latestAttempt">
          <div class="mt-2">
            <p class="text-xs text-slate-400 truncate">{{ latestAttempt.title }}</p>
            <p v-if="latestAttempt.label" class="text-[10px] text-sky-400 truncate mt-0.5">{{ latestAttempt.label }}</p>
          </div>
          <div>
            <div class="flex items-baseline gap-1 mt-2">
              <span :class="scoreTextColor(latestAttempt.percent)" class="text-2xl font-black tabular-nums">
                {{ Number(latestAttempt.score).toFixed(1) }}
              </span>
              <span class="text-slate-500 text-sm">/ {{ latestAttempt.totalMarks }}</span>
            </div>
            <div class="mt-2 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div class="h-full rounded-full" :class="scoreColor(latestAttempt.percent)" :style="scoreBarStyle(latestAttempt.percent)"></div>
            </div>
          </div>
        </template>
        <p v-else class="text-sm text-slate-600 mt-2">No exams yet</p>
      </div>
    </div>

    <!-- ── Subject Averages ──────────────────────────────────────── -->
    <div v-if="showSubjects && Object.keys(subjectAverages).length" class="space-y-2">
      <p class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Subject Averages</p>
      <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        <div v-for="(pct, name) in subjectAverages" :key="name" class="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
          <div class="flex justify-between items-center">
            <span class="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{{ name }}</span>
            <span v-if="pct != null" :class="scoreTextColor(pct)" class="text-xs font-bold tabular-nums">{{ pct.toFixed(0) }}%</span>
            <span v-else class="text-xs text-slate-600">—</span>
          </div>
          <div class="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div v-if="pct != null" class="h-full rounded-full transition-all duration-500" :class="scoreColor(pct)" :style="scoreBarStyle(pct)"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Give Exam CTA ─────────────────────────────────────────── -->
    <div class="flex items-center gap-3">
      <button
        @click="showUpload = !showUpload"
        class="flex items-center gap-2 bg-sky-600 hover:bg-sky-500 active:scale-95 text-white font-semibold px-5 py-3 rounded-xl text-sm transition-all shadow-lg shadow-sky-900/30"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
        Give Exam
      </button>
      <button v-if="loadedCount" @click="startExam" class="bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold px-5 py-3 rounded-xl text-sm transition-all">
        Start ({{ loadedCount }} Q loaded)
      </button>
      <router-link to="/pyq" class="text-sm text-sky-400 hover:text-sky-300 underline underline-offset-2">PYQ Bank</router-link>
    </div>

    <!-- ── Upload Panel (collapsible) ───────────────────────────── -->
    <div v-if="showUpload" class="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold text-slate-200">Upload Exam Paper</h2>
        <span class="text-xs text-slate-500">{{ quota }}/{{ maxQuota }} conversions today</span>
      </div>

      <!-- Label input -->
      <div>
        <label class="text-xs text-slate-400 mb-1 block">Exam Label <span class="text-slate-600">(optional, e.g. "Mock Test 3")</span></label>
        <input
          v-model="examLabel"
          type="text"
          maxlength="60"
          placeholder="e.g. Chapter 5 Practice, Mock Test 3"
          class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500"
        />
      </div>

      <!-- PDF / Image toggle -->
      <div class="flex gap-2">
        <button @click="sourceType = 'pdf'" class="flex-1 py-2.5 rounded-xl text-sm font-medium border" :class="sourceType === 'pdf' ? 'bg-sky-600 border-sky-500 text-white' : 'bg-slate-950 border-slate-700 text-slate-400'">PDF</button>
        <button @click="sourceType = 'images'" class="flex-1 py-2.5 rounded-xl text-sm font-medium border" :class="sourceType === 'images' ? 'bg-sky-600 border-sky-500 text-white' : 'bg-slate-950 border-slate-700 text-slate-400'">Images</button>
      </div>

      <!-- Drop zone -->
      <div @dragover.prevent @drop.prevent="onDrop" class="rounded-xl border-2 border-dashed border-slate-700 bg-slate-950/50 p-5 text-center space-y-3 hover:border-slate-500 transition-colors">
        <svg class="w-8 h-8 text-slate-600 mx-auto" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>
        <p class="text-sm text-slate-400 break-all">{{ fileLabel() }}</p>
        <label class="inline-block cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm px-4 py-2 rounded-lg">
          Choose file
          <input type="file" class="hidden" :accept="sourceType === 'pdf' ? 'application/pdf' : 'image/jpeg,image/png,image/webp'" :multiple="sourceType === 'images'" @change="onFiles" />
        </label>
      </div>

      <!-- Exam params -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm text-slate-400 border-t border-slate-800 pt-4">
        <label class="flex flex-col gap-1">Duration (min)<input type="number" v-model.number="sessionParams.duration" class="mt-1 bg-slate-950 border border-slate-700 rounded-lg p-2 text-center text-slate-100 w-full" /></label>
        <label class="flex flex-col gap-1">Pass %<input type="number" v-model.number="sessionParams.passPercent" class="mt-1 bg-slate-950 border border-slate-700 rounded-lg p-2 text-center text-slate-100 w-full" /></label>
        <label class="flex flex-col gap-1">Negative
          <select v-model.number="sessionParams.negativeMarkingRate" class="mt-1 bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-100 w-full">
            <option :value="0">0%</option>
            <option :value="0.10">10%</option>
            <option :value="0.20">20%</option>
            <option :value="0.25">25%</option>
          </select>
        </label>
        <label class="flex items-center gap-2 pt-5">Shuffle<input type="checkbox" v-model="sessionParams.shuffle" class="accent-sky-500 w-4 h-4 ml-auto" /></label>
      </div>

      <!-- Action buttons -->
      <div class="flex gap-3">
        <button @click="convert" :disabled="isProcessing || !files.length || quota >= maxQuota" class="flex-1 py-3 rounded-xl text-sm font-semibold" :class="isProcessing || !files.length || quota >= maxQuota ? 'bg-slate-800 text-slate-500' : 'bg-sky-600 hover:bg-sky-500 text-white'">
          {{ isProcessing ? processingStatus : 'Convert to test' }}
        </button>
        <button v-if="loadedCount" @click="startExam" class="flex-1 py-3 rounded-xl text-sm font-semibold bg-emerald-700 hover:bg-emerald-600 text-white">
          Start exam ({{ loadedCount }} Q)
        </button>
      </div>
    </div>

    <!-- ── Attempt History ───────────────────────────────────────── -->
    <div class="space-y-2">
      <p class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Your Progress</p>

      <p v-if="loading" class="text-sm text-slate-400 py-4">Loading history…</p>

      <div v-else-if="!attempts.length" class="text-sm text-slate-500 border border-dashed border-slate-800 rounded-2xl p-8 text-center leading-relaxed">
        <svg class="w-8 h-8 text-slate-700 mx-auto mb-3" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>
        Click <strong class="text-sky-400">Give Exam</strong> above, upload a PDF and sit an exam — your reports will appear here.
      </div>

      <div v-else class="space-y-5">
        <div v-for="(cards, date) in grouped" :key="date" class="space-y-3">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-slate-500 pt-2">{{ date }}</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div v-for="a in cards" :key="a.id" class="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">

              <!-- Title + pass/fail -->
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-medium text-slate-100 truncate">{{ a.title }}</div>

                  <!-- Label row -->
                  <div v-if="editingLabelId === a.id" class="flex gap-1.5 mt-1.5">
                    <input
                      v-model="editingLabelValue"
                      @keyup.enter="saveLabel(a)"
                      @keyup.escape="cancelEditLabel"
                      maxlength="60"
                      class="flex-1 bg-slate-950 border border-sky-600 rounded-lg px-2 py-1 text-xs text-slate-100 focus:outline-none"
                      placeholder="Add label…"
                    />
                    <button @click="saveLabel(a)" class="text-[10px] bg-sky-600 hover:bg-sky-500 text-white px-2 py-1 rounded-lg">Save</button>
                    <button @click="cancelEditLabel" class="text-[10px] text-slate-400 px-1.5 py-1 rounded-lg hover:text-slate-200">✕</button>
                  </div>
                  <div v-else class="flex items-center gap-1.5 mt-1">
                    <span v-if="a.label" class="text-[10px] bg-sky-900/50 border border-sky-700/50 text-sky-300 px-2 py-0.5 rounded-full">{{ a.label }}</span>
                    <button @click="startEditLabel(a)" class="text-[10px] text-slate-600 hover:text-slate-400">{{ a.label ? '✎' : '+ label' }}</button>
                  </div>

                  <div class="text-xs text-slate-500 mt-1">{{ a.source === 'pyq' ? 'PYQ' : 'Upload' }} · {{ a.questionCount }} Q · {{ formatTime(a.timeSpent) }}</div>
                </div>
                <span :class="a.passed ? 'text-emerald-400 bg-emerald-500/10 border-emerald-700/50' : 'text-rose-400 bg-rose-500/10 border-rose-700/50'" class="text-[10px] font-bold px-2 py-1 rounded-md shrink-0 border">{{ a.passed ? 'PASS' : 'FAIL' }}</span>
              </div>

              <!-- Score in marks format -->
              <div class="flex items-baseline gap-1">
                <span :class="scoreTextColor(a.percent)" class="text-2xl font-black tabular-nums">{{ Number(a.score).toFixed(1) }}</span>
                <span class="text-slate-500 text-sm font-normal">/ {{ a.totalMarks }}</span>
                <span :class="scoreTextColor(a.percent)" class="text-xs ml-auto font-semibold">{{ Number(a.percent).toFixed(1) }}%</span>
              </div>

              <!-- Score progress bar (green/yellow/red) -->
              <div class="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all duration-500" :class="scoreColor(a.percent)" :style="scoreBarStyle(a.percent)"></div>
              </div>

              <!-- Action buttons -->
              <div class="flex gap-2 pt-1">
                <router-link :to="{ name: 'result', params: { id: a.id } }" class="flex-1 text-center text-xs font-medium bg-slate-800 hover:bg-slate-700 rounded-lg px-3 py-2">View report</router-link>
                <button
                  @click="regiveAttempt(a)"
                  :disabled="regivingId === a.id"
                  class="flex-1 text-xs font-medium border border-slate-700 hover:border-sky-600 hover:text-sky-300 text-slate-400 rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
                >
                  {{ regivingId === a.id ? 'Loading…' : '↺ Re-give' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  `
};