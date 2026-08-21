import { examSession, stopTimer } from "../state/session.js";
import { authState } from "../state/auth.js";
import { formatTime } from "../lib/scoring.js";
import { triggerMathRender } from "../lib/katex.js";
import { saveAttempt } from "../lib/db.js";

export default {
  name: "ExamView",
  data() {
    return { submitting: false, paletteOpen: false };
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
      this.paletteOpen = false;
      this.$nextTick(() => {
        document.getElementById("q-" + idx)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    paletteClass(idx) {
      if (examSession.guessedAnswers[idx]) return "bg-amber-500/20 border-amber-500/50 text-amber-200";
      if (examSession.userAnswers[idx] !== undefined) return "bg-sky-500/20 border-sky-500/50 text-sky-100";
      return "bg-slate-900 border-slate-700 text-slate-400";
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
        alert(
          "Could not save this attempt: " +
            (err.code === "permission-denied" || /insufficient permissions/i.test(err.message || "")
              ? "Firestore rules are blocking writes. Publish CBT/firestore.rules in Firebase Console."
              : err.message)
        );
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
  <div class="min-h-screen flex flex-col bg-slate-950">
    <header class="sticky top-0 z-20 bg-slate-950/95 backdrop-blur border-b border-slate-800">
      <div class="max-w-6xl mx-auto px-3 sm:px-4 py-2.5 flex flex-wrap items-center gap-2 sm:gap-3">
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <span class="w-2 h-2 rounded-full bg-sky-400 shrink-0"></span>
          <span class="text-xs font-semibold uppercase tracking-wide text-slate-400 truncate">{{ mode }} exam</span>
        </div>
        <div class="font-mono text-sm font-semibold text-sky-300 tabular-nums px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800">
          {{ formatTime(session.timeLeft) }}
        </div>
        <div class="text-xs text-slate-400">
          {{ answeredCount }}/{{ session.questions.length }}
        </div>
        <button :disabled="submitting" @click="submitExam" class="ml-auto sm:ml-0 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-lg">
          {{ submitting ? 'Saving…' : 'Submit' }}
        </button>
      </div>
    </header>

    <div class="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-4 py-4 sm:py-6 flex gap-6 pb-24 lg:pb-8">
      <div class="flex-1 min-w-0 space-y-4">
        <article v-for="(q, idx) in session.questions" :key="idx" :id="'q-' + idx" class="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4 scroll-mt-20">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs font-semibold bg-slate-800 text-slate-200 px-2.5 py-1 rounded-md">Q{{ idx + 1 }}</span>
            <span v-if="mode !== 'OTHER' && q.subject" class="text-[11px] text-slate-400">{{ q.subject }}</span>
            <span class="text-[11px] text-slate-500 ml-auto">{{ q.marks || 1 }} mark{{ (q.marks || 1) === 1 ? '' : 's' }}</span>
            <button @click="toggleGuess(idx)" class="text-[11px] px-2.5 py-1 rounded-md border" :class="session.guessedAnswers[idx] ? 'border-amber-500/50 bg-amber-500/10 text-amber-200' : 'border-slate-700 text-slate-400'">
              {{ session.guessedAnswers[idx] ? 'Guessed' : 'Mark guess' }}
            </button>
          </div>
          <div class="text-[15px] sm:text-base text-slate-100 leading-relaxed math-content" v-html="q.text"></div>
          <p v-if="q.hasImage && q.imageNote" class="text-xs text-amber-200/90 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">{{ q.imageNote }}</p>
          <div class="grid gap-2">
            <button v-for="(opt, oIdx) in q.options" :key="oIdx" @click="session.userAnswers[idx] = oIdx" class="text-left rounded-xl border p-3 text-sm flex items-start gap-3 min-h-[48px]" :class="session.userAnswers[idx] === oIdx ? 'border-sky-500 bg-sky-500/10 text-slate-50' : 'border-slate-800 bg-slate-950 text-slate-300'">
              <span class="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold shrink-0" :class="session.userAnswers[idx] === oIdx ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400'">{{ String.fromCharCode(65 + oIdx) }}</span>
              <span class="math-content pt-0.5" v-html="opt"></span>
            </button>
          </div>
        </article>
      </div>

      <aside class="hidden lg:block w-56 shrink-0">
        <div class="sticky top-20 bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-400">Palette</h4>
          <div class="grid grid-cols-5 gap-1.5">
            <button v-for="(_, idx) in session.questions" :key="'d'+idx" @click="scrollToQuestion(idx)" :class="paletteClass(idx)" class="h-8 rounded-md border text-[11px] font-semibold">{{ idx + 1 }}</button>
          </div>
          <div class="text-[11px] text-slate-500 space-y-1 pt-2 border-t border-slate-800">
            <p><span class="inline-block w-2.5 h-2.5 rounded-sm bg-sky-500/40 border border-sky-500/50 align-middle"></span> Answered</p>
            <p><span class="inline-block w-2.5 h-2.5 rounded-sm bg-amber-500/30 border border-amber-500/50 align-middle"></span> Guess</p>
            <p v-if="guessedCount">{{ guessedCount }} marked as guess</p>
          </div>
        </div>
      </aside>
    </div>

    <div class="lg:hidden fixed inset-x-0 bottom-0 z-30 p-3 bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent">
      <button @click="paletteOpen = true" class="w-full h-12 rounded-xl bg-slate-800 border border-slate-700 text-sm font-semibold text-slate-100">
        Question palette · {{ answeredCount }}/{{ session.questions.length }}
      </button>
    </div>

    <div v-if="paletteOpen" class="lg:hidden fixed inset-0 z-40">
      <button class="absolute inset-0 bg-black/60" @click="paletteOpen = false" aria-label="Close palette"></button>
      <div class="absolute inset-x-0 bottom-0 max-h-[70vh] bg-slate-900 border-t border-slate-700 rounded-t-3xl p-4 overflow-y-auto">
        <div class="flex items-center justify-between mb-3">
          <h4 class="text-sm font-semibold">Jump to question</h4>
          <button @click="paletteOpen = false" class="text-slate-400 text-sm px-2 py-1">Close</button>
        </div>
        <div class="grid grid-cols-6 sm:grid-cols-8 gap-2">
          <button v-for="(_, idx) in session.questions" :key="'m'+idx" @click="scrollToQuestion(idx)" :class="paletteClass(idx)" class="h-10 rounded-lg border text-xs font-semibold">{{ idx + 1 }}</button>
        </div>
      </div>
    </div>
  </div>
  `
};
