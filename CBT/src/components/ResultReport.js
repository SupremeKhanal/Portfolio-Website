import {
  answerAt,
  computeResults,
  formatTime,
  guessedAt
} from "../lib/scoring.js";
import { triggerMathRender } from "../lib/katex.js";
import { generateMistakeAnalysis } from "../lib/gemini.js";

const GEMINI_KEY = "cbt_gemini_key";

export default {
  name: "ResultReport",
  props: {
    attempt: { type: Object, required: true },
    details: { type: Object, required: true }
  },
  data() {
    return {
      summaryCopied: false,
      aiAnalysis: "",
      aiLoading: false,
      aiError: ""
    };
  },
  computed: {
    questions() { return this.details.questions || []; },
    userAnswers() { return this.details.userAnswers || {}; },
    guessedAnswers() { return this.details.guessedAnswers || {}; },
    params() {
      return this.details.params || {
        passPercent: this.attempt.passPercent || 40,
        negativeMarkingRate: this.attempt.negativeMarkingRate || 0
      };
    },
    examMode() { return this.details.examMode || this.attempt.examMode || "IOE"; },
    showSubjects() { return this.examMode === "IOE" || this.examMode === "CEE"; },
    stats() {
      return computeResults(
        this.questions,
        this.userAnswers,
        this.guessedAnswers,
        this.params,
        this.examMode
      );
    },
    scorePercent() {
      return this.stats.totalPossibleMarks
        ? (this.stats.finalScore / this.stats.totalPossibleMarks) * 100
        : 0;
    },
    guessAccuracyPercent() {
      if (!this.stats.guessedCount) return null;
      return (this.stats.guessedCorrectCount / this.stats.guessedCount) * 100;
    },
    guessWarning() {
      const acc = this.guessAccuracyPercent;
      if (acc === null) return false;
      return acc < 60;
    }
  },
  methods: {
    formatTime,
    answerAt,
    guessedAt,

    /** Colour helpers */
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
    scoreBarStyle(pct) {
      return `width: ${Math.min(100, Math.max(0, pct))}%`;
    },

    stripHtml(text) {
      return String(text || "").replace(/<[^>]*>?/gm, "");
    },
    getQuestionStatusText(idx) {
      const ans = answerAt(this.userAnswers, idx);
      if (ans === undefined) return "UNATTEMPTED";
      return ans === this.questions[idx].correctAnswer ? "CORRECT" : "INCORRECT";
    },
    getQuestionStatusBadgeClass(idx) {
      const ans = answerAt(this.userAnswers, idx);
      if (ans === undefined) return "bg-slate-950 text-slate-400 border-slate-800";
      return ans === this.questions[idx].correctAnswer
        ? "bg-emerald-950 text-emerald-400 border-emerald-800"
        : "bg-red-950 text-red-400 border-red-800";
    },
    getOptionStyleClass(idx, oIdx) {
      const isCorrect = oIdx === this.questions[idx].correctAnswer;
      const isUserChoice = answerAt(this.userAnswers, idx) === oIdx;
      if (isCorrect) return "bg-emerald-950/40 border-emerald-800 text-emerald-200 font-medium";
      if (isUserChoice && !isCorrect) return "bg-red-950/40 border-red-800 text-red-200";
      return "bg-slate-950 border-slate-800 text-slate-400";
    },
    copySummary() {
      let subjDetails = "";
      if (this.showSubjects) {
        subjDetails = Object.entries(this.stats.subjectStats)
          .map(([subj, data]) => `${subj}: ${data.score.toFixed(2)}/${data.totalMarks}`)
          .join(" | ");
      }
      const text = `CBT PERFORMANCE REPORT (${this.examMode})
${this.attempt.title || ""}${this.attempt.label ? `\nLabel: ${this.attempt.label}` : ""}
Final Score: ${this.stats.finalScore.toFixed(2)} / ${this.stats.totalPossibleMarks} (${this.scorePercent.toFixed(1)}%)
${subjDetails ? `Subject Breakdown: ${subjDetails}\n` : ""}Correct: ${this.stats.correctCount} | Wrong: ${this.stats.wrongCount} | Skipped: ${this.stats.skippedCount}
Guessed Answers: ${this.stats.guessedCount} (Correct: ${this.stats.guessedCorrectCount}, Wrong: ${this.stats.guessedWrongCount})
Mistakes in Questions: ${this.stats.mistakeList.join(", ") || "None"}`;
      navigator.clipboard.writeText(text);
      this.summaryCopied = true;
      setTimeout(() => (this.summaryCopied = false), 2000);
    },

    async runAiAnalysis() {
      const apiKey = localStorage.getItem(GEMINI_KEY) || "";
      this.aiLoading = true;
      this.aiError = "";
      this.aiAnalysis = "";
      try {
        const text = await generateMistakeAnalysis({
          apiKey,
          stats: this.stats,
          subjectStats: this.showSubjects ? this.stats.subjectStats : null,
          examMode: this.examMode,
          guessedCount: this.stats.guessedCount,
          guessedCorrectCount: this.stats.guessedCorrectCount,
          guessedWrongCount: this.stats.guessedWrongCount,
          totalQuestions: this.questions.length
        });
        this.aiAnalysis = text;
      } catch (err) {
        this.aiError = err.message;
      } finally {
        this.aiLoading = false;
      }
    },

    /** Convert AI plain text to basic HTML (bold **text**, bullet lines) */
    formatAiText(text) {
      return String(text || "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/^[*\-•]\s+/gm, "• ")
        .replace(/\n/g, "<br/>");
    }
  },
  mounted() { this.$nextTick(() => triggerMathRender(this.$el)); },
  updated() { this.$nextTick(() => triggerMathRender(this.$el)); },

  template: `
  <div class="space-y-6">

    <!-- ── Score Hero ─────────────────────────────────────────────── -->
    <div class="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 text-center space-y-4">
      <p class="text-xs text-slate-500 uppercase tracking-widest">{{ attempt.title || 'Exam report' }}</p>
      <p v-if="attempt.label" class="text-xs text-sky-400 font-medium">{{ attempt.label }}</p>

      <span :class="stats.passed ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-red-950 text-red-400 border-red-800'" class="inline-block px-4 py-1 rounded-full text-xs font-bold border">
        {{ stats.passed ? 'QUALIFIED / PASSED' : 'NOT QUALIFIED / FAILED' }}
      </span>

      <!-- Big score in marks format -->
      <div>
        <div class="flex items-end justify-center gap-2">
          <span :class="scoreTextColor(scorePercent)" class="text-5xl font-black tabular-nums">{{ stats.finalScore.toFixed(1) }}</span>
          <span class="text-slate-500 text-2xl font-normal pb-1">/ {{ stats.totalPossibleMarks }}</span>
        </div>
        <p :class="scoreTextColor(scorePercent)" class="text-lg font-semibold mt-1">{{ scorePercent.toFixed(1) }}%</p>
      </div>

      <!-- Score progress bar (green/yellow/red gradient) -->
      <div class="relative h-3 bg-slate-800 rounded-full overflow-hidden mx-auto max-w-sm">
        <!-- Background gradient hint -->
        <div class="absolute inset-0 bg-gradient-to-r from-rose-900/30 via-amber-900/20 to-emerald-900/20"></div>
        <div class="absolute inset-y-0 left-0 rounded-full transition-all duration-700" :class="scoreColor(scorePercent)" :style="scoreBarStyle(scorePercent)"></div>
      </div>
      <!-- Threshold markers -->
      <div class="flex justify-between text-[10px] text-slate-600 max-w-sm mx-auto px-1">
        <span>0</span><span>Pass ({{ params.passPercent }}%)</span><span>100%</span>
      </div>

      <p class="text-xs text-slate-400">Pass requirement: {{ (stats.totalPossibleMarks * params.passPercent / 100).toFixed(1) }} marks ({{ params.passPercent }}%)</p>
    </div>

    <!-- ── Stats Grid ──────────────────────────────────────────────── -->
    <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
      <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 text-center">
        <div class="text-2xl font-bold text-emerald-400">{{ stats.correctCount }}</div>
        <div class="text-xs text-slate-400 mt-0.5">Correct</div>
      </div>
      <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 text-center">
        <div class="text-2xl font-bold text-red-400">{{ stats.wrongCount }}</div>
        <div class="text-xs text-slate-400 mt-0.5">Incorrect</div>
      </div>
      <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 text-center">
        <div class="text-2xl font-bold text-amber-400">{{ stats.guessedCount }}</div>
        <div class="text-xs text-slate-400 mt-0.5">Guessed</div>
      </div>
      <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 text-center">
        <div class="text-2xl font-bold text-slate-400">{{ stats.skippedCount }}</div>
        <div class="text-xs text-slate-400 mt-0.5">Unattempted</div>
      </div>
      <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 text-center">
        <div class="text-2xl font-bold text-slate-200">{{ formatTime(attempt.timeSpent) }}</div>
        <div class="text-xs text-slate-400 mt-0.5">Time Spent</div>
      </div>
    </div>

    <!-- ── Subject-wise Performance ──────────────────────────────── -->
    <div v-if="showSubjects" class="bg-slate-900/90 rounded-xl border border-slate-800 p-5 space-y-4">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 class="text-xs font-bold text-slate-300 uppercase tracking-wider">📚 Subject Performance ({{ examMode }})</h3>
        <span class="text-[11px] text-slate-500 font-mono">Deduction: {{ (params.negativeMarkingRate * 100).toFixed(0) }}%</span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div v-for="(s, subj) in stats.subjectStats" :key="subj" class="bg-slate-950 border border-slate-800 p-3.5 rounded-xl space-y-2">
          <div class="flex justify-between items-center">
            <span class="text-xs font-bold text-slate-200 uppercase">{{ subj }}</span>
            <span :class="scoreTextColor(s.totalMarks ? (s.score / s.totalMarks) * 100 : 0)" class="text-[11px] font-mono font-bold">{{ s.score.toFixed(1) }}/{{ s.totalMarks }}</span>
          </div>
          <!-- Subject score bar -->
          <div class="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div class="h-full rounded-full" :class="scoreColor(s.totalMarks ? (s.score / s.totalMarks) * 100 : 0)" :style="scoreBarStyle(s.totalMarks ? (s.score / s.totalMarks) * 100 : 0)"></div>
          </div>
          <div class="grid grid-cols-3 text-center text-[11px] gap-1">
            <div class="bg-emerald-950/40 border border-emerald-900/50 rounded py-1">
              <div class="font-bold text-emerald-400">{{ s.correct }}</div>
              <div class="text-[9px] text-slate-500 uppercase">Right</div>
            </div>
            <div class="bg-red-950/40 border border-red-900/50 rounded py-1">
              <div class="font-bold text-red-400">{{ s.wrong }}</div>
              <div class="text-[9px] text-slate-500 uppercase">Wrong</div>
            </div>
            <div class="bg-slate-900 border border-slate-800 rounded py-1">
              <div class="font-bold text-slate-400">{{ s.unattempted }}</div>
              <div class="text-[9px] text-slate-500 uppercase">Skipped</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Guess Analysis ─────────────────────────────────────────── -->
    <div class="bg-slate-900/90 rounded-xl border border-slate-800 p-5 space-y-3">
      <div class="flex justify-between items-center border-b border-slate-800 pb-3">
        <h3 class="text-xs font-bold text-slate-300 uppercase tracking-wider">📊 Performance & Guess Analysis</h3>
        <button @click="copySummary" class="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3 py-1.5 rounded-md font-semibold border border-slate-700">
          {{ summaryCopied ? 'Copied!' : '📋 Copy Report' }}
        </button>
      </div>

      <!-- Guess quality meter -->
      <div v-if="stats.guessedCount" class="rounded-lg border p-3 space-y-2" :class="guessWarning ? 'border-amber-700/50 bg-amber-950/20' : 'border-slate-800 bg-slate-950'">
        <div class="flex justify-between items-center">
          <span class="text-xs font-semibold" :class="guessWarning ? 'text-amber-300' : 'text-slate-300'">
            {{ guessWarning ? '⚠️' : '✓' }} Guess Accuracy
          </span>
          <span class="text-xs font-bold tabular-nums" :class="guessWarning ? 'text-amber-400' : 'text-emerald-400'">
            {{ guessAccuracyPercent.toFixed(1) }}%
            ({{ stats.guessedCorrectCount }}/{{ stats.guessedCount }} correct)
          </span>
        </div>
        <div class="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div class="h-full rounded-full transition-all" :class="guessWarning ? 'bg-amber-400' : 'bg-emerald-500'" :style="scoreBarStyle(guessAccuracyPercent)"></div>
        </div>
        <p v-if="guessWarning" class="text-[11px] text-amber-300/80 leading-relaxed">
          Your guess accuracy is below 60%. Consider only guessing when you can eliminate at least 2 options — random guessing with negative marking hurts your score.
        </p>
      </div>

      <div class="bg-slate-950 p-4 rounded-lg font-mono text-xs text-slate-300 leading-relaxed space-y-2 border border-slate-800">
        <div><strong class="text-red-400">Incorrect Questions:</strong> {{ stats.mistakeList.join(', ') || 'None' }}</div>
        <div><strong class="text-emerald-400">Correct Questions:</strong> {{ stats.correctList.join(', ') || 'None' }}</div>
        <div><strong class="text-amber-400">Guessed Questions:</strong> {{ stats.guessedList.join(', ') || 'None' }} (Correct: {{ stats.guessedCorrectCount }}, Incorrect: {{ stats.guessedWrongCount }})</div>
        <div><strong class="text-slate-500">Unattempted:</strong> {{ stats.unattemptedList.join(', ') || 'None' }}</div>
      </div>
    </div>

    <!-- ── AI Mistake Analysis ─────────────────────────────────────── -->
    <div class="bg-slate-900/90 rounded-xl border border-slate-800 p-5 space-y-4">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h3 class="text-xs font-bold text-slate-300 uppercase tracking-wider">🤖 AI Study Advisor</h3>
          <p class="text-[11px] text-slate-500 mt-1">Uses your Gemini API key to analyze your mistake patterns</p>
        </div>
        <button
          @click="runAiAnalysis"
          :disabled="aiLoading"
          class="text-xs font-semibold px-3 py-2 rounded-lg transition-all disabled:opacity-50"
          :class="aiAnalysis ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700' : 'bg-sky-600 hover:bg-sky-500 text-white'"
        >
          {{ aiLoading ? 'Analysing…' : aiAnalysis ? '↺ Re-analyse' : '✨ Generate AI Analysis' }}
        </button>
      </div>

      <div v-if="aiLoading" class="flex items-center gap-3 py-4">
        <div class="w-4 h-4 rounded-full border-2 border-sky-500 border-t-transparent animate-spin"></div>
        <span class="text-sm text-slate-400">Analysing your performance with AI…</span>
      </div>

      <div v-else-if="aiError" class="bg-rose-950/30 border border-rose-800/50 rounded-lg p-4">
        <p class="text-xs text-rose-400">{{ aiError }}</p>
        <p class="text-[11px] text-rose-500/70 mt-1">Make sure your Gemini API key is set in Settings.</p>
      </div>

      <div v-else-if="aiAnalysis" class="bg-slate-950 rounded-lg border border-slate-800 p-4 text-sm text-slate-300 leading-relaxed space-y-2">
        <div v-html="formatAiText(aiAnalysis)"></div>
      </div>

      <div v-else class="py-2 text-center">
        <p class="text-xs text-slate-600">Click the button above to get personalised study recommendations based on your mistake patterns.</p>
      </div>
    </div>

    <!-- ── Question-by-Question Review ───────────────────────────── -->
    <div class="space-y-5">
      <h3 class="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2">
        📝 Question-by-Question Review, Solutions & Formula Tricks
      </h3>
      <div v-for="(q, idx) in questions" :key="idx" class="bg-slate-900/90 rounded-xl border border-slate-800 p-5 space-y-3">
        <div class="flex justify-between items-center border-b border-slate-800 pb-3">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs font-bold text-slate-200">Question {{ idx + 1 }}</span>
            <span v-if="showSubjects && q.subject" class="bg-slate-950 border border-slate-800 text-slate-400 text-[10px] px-2 py-0.5 rounded-md">{{ q.subject }}</span>
            <span v-if="guessedAt(guessedAnswers, idx)" class="bg-amber-950/80 border border-amber-800 text-amber-300 text-[10px] px-2 py-0.5 rounded-md font-semibold">🏷️ Marked as Guess</span>
          </div>
          <span :class="getQuestionStatusBadgeClass(idx)" class="text-[10px] font-bold px-3 py-1 rounded-md border tracking-wider">
            {{ getQuestionStatusText(idx) }}
          </span>
        </div>
        <div class="text-xs font-medium text-slate-100 math-content leading-relaxed" v-html="q.text"></div>
        <div class="grid grid-cols-1 gap-2 pt-1 text-xs">
          <div v-for="(opt, oIdx) in q.options" :key="oIdx" :class="getOptionStyleClass(idx, oIdx)" class="p-2.5 rounded-lg border flex items-center justify-between transition">
            <div class="flex items-center gap-2.5">
              <strong class="text-slate-400">{{ String.fromCharCode(65 + oIdx) }}.</strong>
              <span class="math-content" v-html="opt"></span>
            </div>
            <span v-if="oIdx === q.correctAnswer" class="text-emerald-400 font-bold text-[11px]">✓ Correct Answer</span>
            <span v-else-if="answerAt(userAnswers, idx) === oIdx && oIdx !== q.correctAnswer" class="text-red-400 font-bold text-[11px]">✕ Your Answer</span>
          </div>
        </div>
        <div class="mt-3 p-3.5 bg-slate-950 rounded-lg border border-slate-800 space-y-1.5 text-xs">
          <div class="font-bold text-red-400">💡 Short Explanation & Solution Trick:</div>
          <div class="text-slate-300 math-content leading-relaxed text-[11px]" v-html="q.explanation || 'No detailed explanation provided for this question.'"></div>
        </div>
        <div class="pt-1 flex justify-end">
          <a :href="'https://www.google.com/search?q=' + encodeURIComponent(stripHtml(q.text))" target="_blank" class="text-slate-400 hover:text-slate-200 text-[11px]">🔍 Search on Google ↗</a>
        </div>
      </div>
    </div>
  </div>
  `
};