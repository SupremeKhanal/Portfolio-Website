import {
  answerAt,
  computeResults,
  formatTime,
  guessedAt
} from "../lib/scoring.js";
import { triggerMathRender } from "../lib/katex.js";

export default {
  name: "ResultReport",
  props: {
    attempt: { type: Object, required: true },
    details: { type: Object, required: true }
  },
  computed: {
    questions() {
      return this.details.questions || [];
    },
    userAnswers() {
      return this.details.userAnswers || {};
    },
    guessedAnswers() {
      return this.details.guessedAnswers || {};
    },
    params() {
      return this.details.params || {
        passPercent: this.attempt.passPercent || 40,
        negativeMarkingRate: this.attempt.negativeMarkingRate || 0
      };
    },
    examMode() {
      return this.details.examMode || this.attempt.examMode || "IOE";
    },
    showSubjects() {
      return this.examMode === "IOE" || this.examMode === "CEE";
    },
    stats() {
      return computeResults(
        this.questions,
        this.userAnswers,
        this.guessedAnswers,
        this.params,
        this.examMode
      );
    }
  },
  methods: {
    formatTime,
    answerAt,
    guessedAt,
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
      if (ans === undefined) return "bg-zinc-950 text-zinc-400 border-zinc-800";
      return ans === this.questions[idx].correctAnswer
        ? "bg-emerald-950 text-emerald-400 border-emerald-800"
        : "bg-red-950 text-red-400 border-red-800";
    },
    getOptionStyleClass(idx, oIdx) {
      const isCorrect = oIdx === this.questions[idx].correctAnswer;
      const isUserChoice = answerAt(this.userAnswers, idx) === oIdx;
      if (isCorrect) return "bg-emerald-950/40 border-emerald-800 text-emerald-200 font-medium";
      if (isUserChoice && !isCorrect) return "bg-red-950/40 border-red-800 text-red-200";
      return "bg-zinc-950 border-zinc-800 text-zinc-400";
    },
    copySummary() {
      let subjDetails = "";
      if (this.showSubjects) {
        subjDetails = Object.entries(this.stats.subjectStats)
          .map(([subj, data]) => `${subj}: ${data.score.toFixed(2)}/${data.totalMarks}`)
          .join(" | ");
      }
      const text = `CBT PERFORMANCE REPORT (${this.examMode})
${this.attempt.title || ""}
Final Score: ${this.stats.finalScore.toFixed(2)} / ${this.stats.totalPossibleMarks}
${subjDetails ? `Subject Breakdown: ${subjDetails}\n` : ""}Correct: ${this.stats.correctCount} | Wrong: ${this.stats.wrongCount} | Skipped: ${this.stats.skippedCount}
Guessed Answers: ${this.stats.guessedCount} (Correct: ${this.stats.guessedCorrectCount}, Wrong: ${this.stats.guessedWrongCount})
Mistakes in Questions: ${this.stats.mistakeList.join(", ") || "None"}`;
      navigator.clipboard.writeText(text);
      this.summaryCopied = true;
      setTimeout(() => (this.summaryCopied = false), 2000);
    }
  },
  data() {
    return { summaryCopied: false };
  },
  mounted() {
    this.$nextTick(() => triggerMathRender(this.$el));
  },
  updated() {
    this.$nextTick(() => triggerMathRender(this.$el));
  },
  template: `
  <div class="space-y-6">
    <div class="bg-zinc-900/90 rounded-xl border border-zinc-800 p-6 text-center space-y-3">
      <p class="text-xs text-zinc-500 uppercase tracking-widest">{{ attempt.title || 'Exam report' }}</p>
      <span :class="stats.passed ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-red-950 text-red-400 border-red-800'" class="px-4 py-1 rounded-full text-xs font-bold border">
        {{ stats.passed ? 'QUALIFIED / PASSED' : 'NOT QUALIFIED / FAILED' }}
      </span>
      <h1 class="text-4xl font-black text-zinc-100">
        {{ stats.finalScore.toFixed(2) }} <span class="text-zinc-500 text-2xl font-normal">/ {{ stats.totalPossibleMarks }}</span>
      </h1>
      <p class="text-xs text-zinc-400">Pass requirement: {{ (stats.totalPossibleMarks * params.passPercent / 100).toFixed(1) }} marks ({{ params.passPercent }}%)</p>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
      <div class="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3.5 text-center">
        <div class="text-2xl font-bold text-emerald-400">{{ stats.correctCount }}</div>
        <div class="text-xs text-zinc-400 mt-0.5">Correct</div>
      </div>
      <div class="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3.5 text-center">
        <div class="text-2xl font-bold text-red-400">{{ stats.wrongCount }}</div>
        <div class="text-xs text-zinc-400 mt-0.5">Incorrect</div>
      </div>
      <div class="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3.5 text-center">
        <div class="text-2xl font-bold text-amber-400">{{ stats.guessedCount }}</div>
        <div class="text-xs text-zinc-400 mt-0.5">Guessed Answers</div>
      </div>
      <div class="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3.5 text-center">
        <div class="text-2xl font-bold text-zinc-400">{{ stats.skippedCount }}</div>
        <div class="text-xs text-zinc-400 mt-0.5">Unattempted</div>
      </div>
      <div class="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3.5 text-center">
        <div class="text-2xl font-bold text-zinc-200">{{ formatTime(attempt.timeSpent) }}</div>
        <div class="text-xs text-zinc-400 mt-0.5">Time Spent</div>
      </div>
    </div>

    <div v-if="showSubjects" class="bg-zinc-900/90 rounded-xl border border-zinc-800 p-5 space-y-4">
      <div class="flex items-center justify-between border-b border-zinc-800 pb-3">
        <h3 class="text-xs font-bold text-red-400 uppercase tracking-wider">📚 Subject-Wise Performance Analysis ({{ examMode }})</h3>
        <span class="text-[11px] text-zinc-500 font-mono">Deduction Rate: {{ (params.negativeMarkingRate * 100).toFixed(0) }}%</span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div v-for="(s, subj) in stats.subjectStats" :key="subj" class="bg-zinc-950 border border-zinc-800 p-3.5 rounded-lg space-y-2">
          <div class="flex justify-between items-center border-b border-zinc-800/80 pb-1.5">
            <span class="text-xs font-bold text-zinc-200 uppercase">{{ subj }}</span>
            <span class="text-[11px] font-mono text-zinc-400">{{ s.score.toFixed(2) }} / {{ s.totalMarks }} Marks</span>
          </div>
          <div class="grid grid-cols-3 text-center text-[11px] gap-1 pt-1">
            <div class="bg-emerald-950/40 border border-emerald-900/50 rounded py-1">
              <div class="font-bold text-emerald-400">{{ s.correct }}</div>
              <div class="text-[9px] text-zinc-500 uppercase">Right</div>
            </div>
            <div class="bg-red-950/40 border border-red-900/50 rounded py-1">
              <div class="font-bold text-red-400">{{ s.wrong }}</div>
              <div class="text-[9px] text-zinc-500 uppercase">Wrong</div>
            </div>
            <div class="bg-zinc-900 border border-zinc-800 rounded py-1">
              <div class="font-bold text-zinc-400">{{ s.unattempted }}</div>
              <div class="text-[9px] text-zinc-500 uppercase">Skipped</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="bg-zinc-900/90 rounded-xl border border-zinc-800 p-5 space-y-3">
      <div class="flex justify-between items-center border-b border-zinc-800 pb-3">
        <h3 class="text-xs font-bold text-zinc-300 uppercase tracking-wider">📊 Exam Performance & Guess Analysis</h3>
        <button @click="copySummary" class="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs px-3 py-1.5 rounded-md font-semibold transition border border-zinc-700">
          {{ summaryCopied ? 'Copied!' : '📋 Copy Performance Report' }}
        </button>
      </div>
      <div class="bg-zinc-950 p-4 rounded-lg font-mono text-xs text-zinc-300 leading-relaxed space-y-2 border border-zinc-800">
        <div><strong class="text-red-400">Incorrect Questions:</strong> {{ stats.mistakeList.join(', ') || 'None' }}</div>
        <div><strong class="text-emerald-400">Correct Questions:</strong> {{ stats.correctList.join(', ') || 'None' }}</div>
        <div><strong class="text-amber-400">Guessed Questions:</strong> {{ stats.guessedList.join(', ') || 'None' }} (Correct: {{ stats.guessedCorrectCount }}, Incorrect: {{ stats.guessedWrongCount }})</div>
        <div><strong class="text-zinc-500">Unattempted Questions:</strong> {{ stats.unattemptedList.join(', ') || 'None' }}</div>
      </div>
    </div>

    <div class="space-y-5">
      <h3 class="text-xs font-bold text-zinc-300 uppercase tracking-wider border-b border-zinc-800 pb-2">
        📝 Question-by-Question Review, Solutions & Formula Tricks
      </h3>
      <div v-for="(q, idx) in questions" :key="idx" class="bg-zinc-900/90 rounded-xl border border-zinc-800 p-5 space-y-3">
        <div class="flex justify-between items-center border-b border-zinc-800 pb-3">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs font-bold text-zinc-200">Question {{ idx + 1 }}</span>
            <span v-if="showSubjects && q.subject" class="bg-zinc-950 border border-zinc-800 text-zinc-400 text-[10px] px-2 py-0.5 rounded-md">{{ q.subject }}</span>
            <span v-if="guessedAt(guessedAnswers, idx)" class="bg-amber-950/80 border border-amber-800 text-amber-300 text-[10px] px-2 py-0.5 rounded-md font-semibold">🏷️ Marked as Guess</span>
          </div>
          <span :class="getQuestionStatusBadgeClass(idx)" class="text-[10px] font-bold px-3 py-1 rounded-md border tracking-wider">
            {{ getQuestionStatusText(idx) }}
          </span>
        </div>
        <div class="text-xs font-medium text-zinc-100 math-content leading-relaxed" v-html="q.text"></div>
        <div class="grid grid-cols-1 gap-2 pt-1 text-xs">
          <div v-for="(opt, oIdx) in q.options" :key="oIdx" :class="getOptionStyleClass(idx, oIdx)" class="p-2.5 rounded-lg border flex items-center justify-between transition">
            <div class="flex items-center gap-2.5">
              <strong class="text-zinc-400">{{ String.fromCharCode(65 + oIdx) }}.</strong>
              <span class="math-content" v-html="opt"></span>
            </div>
            <span v-if="oIdx === q.correctAnswer" class="text-emerald-400 font-bold text-[11px]">✓ Correct Answer</span>
            <span v-else-if="answerAt(userAnswers, idx) === oIdx && oIdx !== q.correctAnswer" class="text-red-400 font-bold text-[11px]">✕ Selected Answer</span>
          </div>
        </div>
        <div class="mt-3 p-3.5 bg-zinc-950 rounded-lg border border-zinc-800 space-y-1.5 text-xs">
          <div class="font-bold text-red-400">💡 Short Explanation & Solution Trick:</div>
          <div class="text-zinc-300 math-content leading-relaxed text-[11px]" v-html="q.explanation || 'No detailed explanation provided for this question.'"></div>
        </div>
        <div class="pt-1 flex justify-end">
          <a :href="'https://www.google.com/search?q=' + encodeURIComponent(stripHtml(q.text))" target="_blank" class="text-zinc-400 hover:text-zinc-200 text-[11px]">🔍 Search question on Google ↗</a>
        </div>
      </div>
    </div>
  </div>
  `
};
