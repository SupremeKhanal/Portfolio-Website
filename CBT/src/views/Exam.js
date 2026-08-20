import { examSession, stopTimer } from "../state/session.js";
import { authState } from "../state/auth.js";
import { formatTime } from "../lib/scoring.js";
import { triggerMathRender } from "../lib/katex.js";
import { saveAttempt } from "../lib/db.js";

export default {
  name: "ExamView",
  data() {
    return { submitting: false };
  },
  computed: {
    session: () => examSession,
    answeredCount() {
      return Object.keys(examSession.userAnswers).length;
    },
    guessedCount() {
      return Object.values(examSession.guessedAnswers).filter(Boolean).length;
    },
    mode() {
      return authState.profile?.examMode || "IOE";
    }
  },
  methods: {
    formatTime,
    toggleGuess(idx) {
      examSession.guessedAnswers[idx] = !examSession.guessedAnswers[idx];
    },
    scrollToQuestion(idx) {
      document.getElementById("q-" + idx)?.scrollIntoView({ behavior: "smooth" });
    },
    getQuestionPaletteClass(idx) {
      if (examSession.guessedAnswers[idx]) return "bg-amber-950 border-amber-700 text-amber-200";
      if (examSession.userAnswers[idx] !== undefined) return "bg-red-950 border-red-700 text-zinc-100";
      return "bg-zinc-950 border-zinc-800 text-zinc-400";
    },
    startTimer() {
      stopTimer();
      examSession.timer = setInterval(() => {
        if (examSession.timeLeft > 0) {
          examSession.timeLeft--;
          examSession.timeSpent++;
        } else {
          this.submitExam();
        }
      }, 1000);
    },
    async submitExam() {
      if (this.submitting) return;
      this.submitting = true;
      stopTimer();
      try {
        const id = await saveAttempt({
          uid: authState.user.uid,
          examMode: this.mode,
          source: examSession.source,
          title: examSession.title,
          questions: examSession.questions,
          userAnswers: examSession.userAnswers,
          guessedAnswers: examSession.guessedAnswers,
          params: examSession.params,
          timeSpent: examSession.timeSpent
        });
        this.$router.replace({ name: "result", params: { id } });
      } catch (err) {
        alert("Could not save this attempt: " + err.message);
        this.submitting = false;
      }
    }
  },
  mounted() {
    if (!examSession.questions.length) {
      this.$router.replace({ name: "dashboard" });
      return;
    }
    this.$nextTick(() => triggerMathRender());
    this.startTimer();
  },
  unmounted() {
    stopTimer();
  },
  template: `
  <div class="min-h-screen flex flex-col bg-[#121316]">
    <header class="bg-zinc-900 border-b border-zinc-800 px-6 py-3 flex items-center justify-between sticky top-0 z-20 shadow-md">
      <div class="flex items-center gap-3">
        <span class="w-2.5 h-2.5 rounded-full bg-red-600"></span>
        <span class="font-bold text-xs tracking-wider text-zinc-300 uppercase">{{ mode }} CBT SESSION</span>
      </div>
      <div class="bg-zinc-950 border border-red-950 rounded-lg px-4 py-1.5 text-red-400 font-mono font-bold text-sm flex items-center gap-2">
        <span>⏱️</span> {{ formatTime(session.timeLeft) }}
      </div>
      <div class="flex items-center gap-4">
        <span class="text-xs text-zinc-400">Answered: <strong class="text-zinc-100">{{ answeredCount }}</strong> / {{ session.questions.length }}</span>
        <button :disabled="submitting" @click="submitExam" class="bg-red-900 hover:bg-red-800 text-white font-bold text-xs px-4 py-2 rounded-lg transition border border-red-700 disabled:opacity-50">
          {{ submitting ? 'Saving…' : 'Submit Test' }}
        </button>
      </div>
    </header>

    <div class="flex-1 flex max-w-7xl w-full mx-auto p-6 gap-6">
      <div class="flex-1 space-y-6 overflow-y-auto pr-1">
        <div v-for="(q, idx) in session.questions" :key="idx" :id="'q-' + idx" class="bg-zinc-900/90 rounded-xl border border-zinc-800 p-6 space-y-4">
          <div class="flex items-center justify-between border-b border-zinc-800/80 pb-3">
            <div class="flex items-center gap-2">
              <span class="bg-zinc-800 border border-zinc-700 text-zinc-200 font-bold text-xs px-3 py-1 rounded-md">Question {{ idx + 1 }}</span>
              <span v-if="mode !== 'OTHER' && q.subject" class="bg-zinc-950 border border-zinc-800 text-zinc-400 text-xs px-2.5 py-0.5 rounded-md">{{ q.subject }}</span>
              <span v-if="q.hasImage" class="bg-amber-950/60 border border-amber-800/80 text-amber-300 text-[11px] font-medium px-2 py-0.5 rounded-md">🖼️ Image Dependent</span>
            </div>
            <div class="flex items-center gap-3">
              <button @click="toggleGuess(idx)" :class="session.guessedAnswers[idx] ? 'bg-amber-950 border-amber-700 text-amber-300' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'" class="border px-3 py-1 rounded-md text-xs font-semibold">
                {{ session.guessedAnswers[idx] ? '🏷️ Guessed' : '🔖 Mark as Guess' }}
              </button>
              <span class="text-xs text-zinc-400 font-medium bg-zinc-950 px-2.5 py-1 rounded-md border border-zinc-800">{{ q.marks || 1 }} {{ (q.marks || 1) === 1 ? 'Mark' : 'Marks' }}</span>
            </div>
          </div>
          <div class="text-zinc-100 text-sm font-medium leading-relaxed math-content" v-html="q.text"></div>
          <div v-if="q.hasImage && q.imageNote" class="bg-zinc-950 border border-amber-900/40 p-3 rounded-lg text-xs text-amber-200/90">
            <strong class="text-amber-400 block mb-0.5">Diagram / Figure Note:</strong>
            {{ q.imageNote }}
          </div>
          <div class="grid grid-cols-1 gap-2.5 pt-2">
            <button v-for="(opt, oIdx) in q.options" :key="oIdx" @click="session.userAnswers[idx] = oIdx" :class="session.userAnswers[idx] === oIdx ? 'bg-red-950/40 border-red-800 text-zinc-100 font-medium' : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:bg-zinc-800/40'" class="border rounded-lg p-3 text-left text-xs transition flex items-center gap-3">
              <span :class="session.userAnswers[idx] === oIdx ? 'bg-red-900 text-white' : 'bg-zinc-800 text-zinc-400'" class="w-6 h-6 rounded-md text-xs font-bold flex items-center justify-center shrink-0">{{ String.fromCharCode(65 + oIdx) }}</span>
              <span class="math-content" v-html="opt"></span>
            </button>
          </div>
        </div>
      </div>
      <div class="w-64 shrink-0">
        <div class="bg-zinc-900/90 rounded-xl border border-zinc-800 p-4 sticky top-20 space-y-4">
          <div class="flex items-center justify-between border-b border-zinc-800 pb-2">
            <h4 class="text-xs font-bold uppercase tracking-wider text-zinc-300">Question Palette</h4>
            <span class="text-[10px] text-amber-400 font-semibold" v-if="guessedCount > 0">🏷️ {{ guessedCount }} Guessed</span>
          </div>
          <div class="grid grid-cols-5 gap-2 max-h-[65vh] overflow-y-auto p-1">
            <button v-for="(_, idx) in session.questions" :key="idx" @click="scrollToQuestion(idx)" :class="getQuestionPaletteClass(idx)" class="h-8 w-full rounded-md border text-xs font-bold flex items-center justify-center relative">
              {{ idx + 1 }}
              <span v-if="session.guessedAnswers[idx]" class="absolute -top-1 -right-1 w-2 h-2 bg-amber-500 rounded-full"></span>
            </button>
          </div>
          <div class="pt-2 border-t border-zinc-800/80 text-[11px] text-zinc-400 space-y-1.5">
            <div class="flex items-center gap-2"><span class="w-3 h-3 bg-red-900 border border-red-700 rounded"></span> Answered</div>
            <div class="flex items-center gap-2"><span class="w-3 h-3 bg-amber-950 border border-amber-700 rounded"></span> Marked as Guess</div>
            <div class="flex items-center gap-2"><span class="w-3 h-3 bg-zinc-950 border border-zinc-800 rounded"></span> Unattempted</div>
          </div>
        </div>
      </div>
    </div>
  </div>
  `
};
