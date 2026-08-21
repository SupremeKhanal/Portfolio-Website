import { examSession, stopTimer } from "../state/session.js";
import { authState } from "../state/auth.js";
import { formatTime } from "../lib/scoring.js";
import { triggerMathRender } from "../lib/katex.js";
import { saveAttempt } from "../lib/db.js";

export default {
  name: "ExamView",

  data() {
    return {
      submitting: false,
      showMobilePalette: false
    };
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
      examSession.guessedAnswers[idx] =
        !examSession.guessedAnswers[idx];
    },

    scrollToQuestion(idx) {
      this.showMobilePalette = false;

      this.$nextTick(() => {
        document
          .getElementById("q-" + idx)
          ?.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
      });
    },

    getQuestionPaletteClass(idx) {
      if (examSession.guessedAnswers[idx])
        return "bg-amber-950 border-amber-700 text-amber-200";

      if (examSession.userAnswers[idx] !== undefined)
        return "bg-red-950 border-red-700 text-zinc-100";

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

        this.$router.replace({
          name: "result",
          params: { id }
        });

      } catch (err) {
        alert(
          "Could not save this attempt: " +
            (
              err.code === "permission-denied" ||
              /insufficient permissions/i.test(err.message || "")
                ? "Firestore rules are blocking writes. Paste CBT/firestore.rules into Firebase Console → Firestore → Rules and Publish."
                : err.message
            )
        );

        this.submitting = false;
      }
    }
  },

  mounted() {
    if (!examSession.questions.length) {
      this.$router.replace({
        name: "dashboard"
      });
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

    <!-- =====================================================
         HEADER
    ====================================================== -->

    <header
      class="bg-zinc-900
             border-b border-zinc-800
             sticky top-0
             z-40
             shadow-md"
    >

      <div
        class="max-w-7xl
               mx-auto
               w-full
               px-3
               sm:px-4
               md:px-6
               py-2.5
               sm:py-3"
      >

        <!-- TOP HEADER -->

        <div
          class="flex
                 items-center
                 justify-between
                 gap-2
                 sm:gap-4"
        >

          <!-- LOGO / SESSION -->

          <div
            class="flex
                   items-center
                   gap-2
                   min-w-0
                   flex-1"
          >

            <span
              class="w-2.5
                     h-2.5
                     rounded-full
                     bg-red-600
                     shrink-0"
            ></span>

            <span
              class="font-bold
                     text-[10px]
                     sm:text-xs
                     tracking-wider
                     text-zinc-300
                     uppercase
                     leading-tight"
            >
              {{ mode }} CBT SESSION
            </span>

          </div>


          <!-- TIMER -->

          <div
            class="bg-zinc-950
                   border
                   border-red-950
                   rounded-lg
                   px-2.5
                   sm:px-4
                   py-1.5
                   text-red-400
                   font-mono
                   font-bold
                   text-xs
                   sm:text-sm
                   flex
                   items-center
                   gap-1.5
                   sm:gap-2
                   shrink-0"
          >

            <span>
              ⏱️
            </span>

            <span>
              {{ formatTime(session.timeLeft) }}
            </span>

          </div>


          <!-- DESKTOP ANSWERED -->

          <div
            class="hidden
                   sm:flex
                   items-center
                   gap-3
                   shrink-0"
          >

            <span
              class="text-xs
                     text-zinc-400"
            >
              Answered:

              <strong
                class="text-zinc-100"
              >
                {{ answeredCount }}
              </strong>

              /
              {{ session.questions.length }}
            </span>


            <!-- DESKTOP SUBMIT -->

            <button
              :disabled="submitting"
              @click="submitExam"

              class="bg-red-900
                     hover:bg-red-800
                     active:bg-red-950
                     text-white
                     font-bold
                     text-xs
                     px-4
                     py-2
                     rounded-lg
                     transition
                     border
                     border-red-700
                     disabled:opacity-50"
            >
              {{ submitting ? 'Saving…' : 'Submit Test' }}
            </button>

          </div>


          <!-- MOBILE PALETTE BUTTON -->

          <button
            @click="showMobilePalette = true"

            class="md:hidden
                   bg-zinc-800
                   hover:bg-zinc-700
                   active:bg-zinc-950
                   border
                   border-zinc-700
                   text-zinc-200
                   font-bold
                   text-[10px]
                   px-2.5
                   py-1.5
                   rounded-lg
                   shrink-0"
          >
            📋
            <span class="hidden xs:inline">
              Questions
            </span>
          </button>


          <!-- MOBILE SUBMIT -->

          <button
            :disabled="submitting"
            @click="submitExam"

            class="sm:hidden
                   bg-red-900
                   active:bg-red-950
                   text-white
                   font-bold
                   text-[10px]
                   px-2.5
                   py-1.5
                   rounded-lg
                   border
                   border-red-700
                   disabled:opacity-50
                   shrink-0"
          >
            {{ submitting ? 'Saving…' : 'Submit' }}
          </button>

        </div>


        <!-- MOBILE PROGRESS -->

        <div
          class="sm:hidden
                 flex
                 items-center
                 justify-between
                 mt-2
                 pt-2
                 border-t
                 border-zinc-800"
        >

          <span
            class="text-[11px]
                   text-zinc-400"
          >
            Answered:

            <strong
              class="text-zinc-100"
            >
              {{ answeredCount }}
            </strong>

            /
            {{ session.questions.length }}
          </span>


          <span
            v-if="guessedCount > 0"

            class="text-[10px]
                   text-amber-400
                   font-semibold"
          >
            🏷️
            {{ guessedCount }}
            Guessed
          </span>

        </div>

      </div>

    </header>



    <!-- =====================================================
         MOBILE PALETTE OVERLAY

         COMPLETELY HIDDEN UNTIL SHOW BUTTON IS PRESSED
    ====================================================== -->

    <div
      v-if="showMobilePalette"

      class="md:hidden
             fixed
             inset-0
             z-50
             bg-[#121316]"
    >

      <!-- MOBILE PALETTE HEADER -->

      <div
        class="sticky
               top-0
               z-10
               bg-zinc-900
               border-b
               border-zinc-800
               px-4
               py-3
               flex
               items-center
               justify-between"
      >

        <div>

          <h3
            class="text-sm
                   font-bold
                   uppercase
                   tracking-wider
                   text-zinc-200"
          >
            Question Palette
          </h3>

          <p
            class="text-[10px]
                   text-zinc-500
                   mt-0.5"
          >
            {{ answeredCount }} / {{ session.questions.length }} Answered
          </p>

        </div>


        <!-- CLOSE BUTTON -->

        <button
          @click="showMobilePalette = false"

          class="bg-red-900
                 hover:bg-red-800
                 active:bg-red-950
                 text-white
                 border
                 border-red-700
                 rounded-lg
                 px-3
                 py-2
                 text-xs
                 font-bold"
        >
          ✕ Close
        </button>

      </div>


      <!-- MOBILE PALETTE CONTENT -->

      <div
        class="p-4
               overflow-y-auto
               h-[calc(100vh-65px)]"
      >

        <div
          class="grid
                 grid-cols-5
                 sm:grid-cols-6
                 gap-2
                 max-w-xl
                 mx-auto"
        >

          <button
            v-for="(_, idx) in session.questions"
            :key="idx"

            @click="scrollToQuestion(idx)"

            :class="getQuestionPaletteClass(idx)"

            class="h-11
                   w-full
                   rounded-lg
                   border
                   text-xs
                   font-bold
                   flex
                   items-center
                   justify-center
                   relative
                   active:scale-95
                   transition"
          >

            {{ idx + 1 }}


            <span
              v-if="session.guessedAnswers[idx]"

              class="absolute
                     -top-1
                     -right-1
                     w-2.5
                     h-2.5
                     bg-amber-500
                     rounded-full"
            ></span>

          </button>

        </div>


        <!-- LEGEND -->

        <div
          class="max-w-xl
                 mx-auto
                 mt-6
                 pt-4
                 border-t
                 border-zinc-800
                 grid
                 grid-cols-3
                 gap-2
                 text-[10px]
                 text-zinc-400"
        >

          <div
            class="flex
                   items-center
                   gap-1.5"
          >

            <span
              class="w-3
                     h-3
                     bg-red-900
                     border
                     border-red-700
                     rounded"
            ></span>

            Answered

          </div>


          <div
            class="flex
                   items-center
                   gap-1.5"
          >

            <span
              class="w-3
                     h-3
                     bg-amber-950
                     border
                     border-amber-700
                     rounded"
            ></span>

            Guess

          </div>


          <div
            class="flex
                   items-center
                   gap-1.5"
          >

            <span
              class="w-3
                     h-3
                     bg-zinc-950
                     border
                     border-zinc-800
                     rounded"
            ></span>

            Unattempted

          </div>

        </div>

      </div>

    </div>



    <!-- =====================================================
         MAIN CONTENT
    ====================================================== -->

    <div
      class="flex-1
             max-w-7xl
             w-full
             mx-auto
             p-3
             sm:p-4
             md:p-6
             flex
             flex-col
             md:flex-row
             gap-3
             sm:gap-4
             md:gap-6"
    >


      <!-- ===================================================
           QUESTIONS
      ==================================================== -->

      <div
        class="flex-1
               min-w-0
               space-y-3
               sm:space-y-4
               md:space-y-6
               md:overflow-y-auto
               md:pr-1"
      >

        <!-- QUESTION -->

        <div
          v-for="(q, idx) in session.questions"
          :key="idx"
          :id="'q-' + idx"

          class="bg-zinc-900/90
                 rounded-xl
                 border
                 border-zinc-800
                 p-3.5
                 sm:p-5
                 md:p-6
                 space-y-3
                 sm:space-y-4"
        >


          <!-- QUESTION HEADER -->

          <div
            class="flex
                   flex-col
                   sm:flex-row
                   sm:items-center
                   sm:justify-between
                   gap-3
                   border-b
                   border-zinc-800/80
                   pb-3"
          >

            <!-- QUESTION NUMBER -->

            <div
              class="flex
                     items-center
                     gap-1.5
                     sm:gap-2
                     flex-wrap"
            >

              <span
                class="bg-zinc-800
                       border
                       border-zinc-700
                       text-zinc-200
                       font-bold
                       text-[10px]
                       sm:text-xs
                       px-2.5
                       sm:px-3
                       py-1.5
                       sm:py-1
                       rounded-md"
              >
                Question {{ idx + 1 }}
              </span>


              <!-- SUBJECT -->

              <span
                v-if="mode !== 'OTHER' && q.subject"

                class="bg-zinc-950
                       border
                       border-zinc-800
                       text-zinc-400
                       text-[10px]
                       sm:text-xs
                       px-2
                       sm:px-2.5
                       py-1
                       rounded-md"
              >
                {{ q.subject }}
              </span>


              <!-- IMAGE -->

              <span
                v-if="q.hasImage"

                class="bg-amber-950/60
                       border
                       border-amber-800/80
                       text-amber-300
                       text-[9px]
                       sm:text-[11px]
                       font-medium
                       px-2
                       py-1
                       rounded-md"
              >
                🖼️ Image Dependent
              </span>

            </div>


            <!-- QUESTION ACTIONS -->

            <div
              class="flex
                     items-center
                     justify-between
                     sm:justify-end
                     gap-2
                     sm:gap-3
                     w-full
                     sm:w-auto"
            >

              <!-- GUESS -->

              <button
                @click="toggleGuess(idx)"

                :class="
                  session.guessedAnswers[idx]
                    ? 'bg-amber-950 border-amber-700 text-amber-300'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                "

                class="border
                       px-2.5
                       sm:px-3
                       py-1.5
                       sm:py-1
                       rounded-md
                       text-[10px]
                       sm:text-xs
                       font-semibold
                       min-h-[34px]
                       transition"
              >

                {{
                  session.guessedAnswers[idx]
                    ? '🏷️ Guessed'
                    : '🔖 Mark as Guess'
                }}

              </button>


              <!-- MARKS -->

              <span
                class="text-[10px]
                       sm:text-xs
                       text-zinc-400
                       font-medium
                       bg-zinc-950
                       px-2
                       sm:px-2.5
                       py-1.5
                       sm:py-1
                       rounded-md
                       border
                       border-zinc-800
                       whitespace-nowrap"
              >

                {{ q.marks || 1 }}

                {{
                  (q.marks || 1) === 1
                    ? 'Mark'
                    : 'Marks'
                }}

              </span>

            </div>

          </div>



          <!-- QUESTION TEXT -->

          <div
            class="text-zinc-100
                   text-[13px]
                   sm:text-sm
                   font-medium
                   leading-6
                   sm:leading-relaxed
                   math-content
                   overflow-x-auto
                   break-words"
            v-html="q.text"
          ></div>



          <!-- IMAGE NOTE -->

          <div
            v-if="q.hasImage && q.imageNote"

            class="bg-zinc-950
                   border
                   border-amber-900/40
                   p-2.5
                   sm:p-3
                   rounded-lg
                   text-[11px]
                   sm:text-xs
                   text-amber-200/90
                   leading-relaxed"
          >

            <strong
              class="text-amber-400
                     block
                     mb-0.5"
            >
              Diagram / Figure Note:
            </strong>

            {{ q.imageNote }}

          </div>



          <!-- ANSWER OPTIONS -->

          <div
            class="grid
                   grid-cols-1
                   gap-2
                   pt-1
                   sm:pt-2"
          >

            <button
              v-for="(opt, oIdx) in q.options"
              :key="oIdx"

              @click="session.userAnswers[idx] = oIdx"

              :class="
                session.userAnswers[idx] === oIdx
                  ? 'bg-red-950/40 border-red-800 text-zinc-100 font-medium'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:bg-zinc-800/40'
              "

              class="border
                     rounded-lg
                     p-3
                     min-h-[48px]
                     sm:min-h-[46px]
                     text-left
                     text-[12px]
                     sm:text-xs
                     transition
                     flex
                     items-center
                     gap-3
                     active:scale-[0.99]"
            >

              <!-- A B C D -->

              <span
                :class="
                  session.userAnswers[idx] === oIdx
                    ? 'bg-red-900 text-white'
                    : 'bg-zinc-800 text-zinc-400'
                "

                class="w-7
                       h-7
                       sm:w-6
                       sm:h-6
                       rounded-md
                       text-xs
                       font-bold
                       flex
                       items-center
                       justify-center
                       shrink-0"
              >
                {{ String.fromCharCode(65 + oIdx) }}
              </span>


              <!-- OPTION -->

              <span
                class="math-content
                       leading-relaxed
                       min-w-0
                       overflow-x-auto"
                v-html="opt"
              ></span>

            </button>

          </div>

        </div>

      </div>



      <!-- ===================================================
           DESKTOP QUESTION PALETTE

           IMPORTANT:
           hidden on mobile
      ==================================================== -->

      <div
        class="hidden
               md:block
               md:w-64
               shrink-0"
      >

        <div
          class="bg-zinc-900/90
                 rounded-xl
                 border
                 border-zinc-800
                 p-4
                 sticky
                 top-20
                 space-y-4"
        >

          <!-- TITLE -->

          <div
            class="flex
                   items-center
                   justify-between
                   border-b
                   border-zinc-800
                   pb-2"
          >

            <h4
              class="text-xs
                     font-bold
                     uppercase
                     tracking-wider
                     text-zinc-300"
            >
              Question Palette
            </h4>


            <span
              v-if="guessedCount > 0"

              class="text-[10px]
                     text-amber-400
                     font-semibold"
            >
              🏷️
              {{ guessedCount }}
              Guessed
            </span>

          </div>


          <!-- QUESTIONS -->

          <div
            class="grid
                   grid-cols-5
                   gap-2
                   max-h-[65vh]
                   overflow-y-auto
                   p-1"
          >

            <button
              v-for="(_, idx) in session.questions"
              :key="idx"

              @click="scrollToQuestion(idx)"

              :class="getQuestionPaletteClass(idx)"

              class="h-8
                     w-full
                     rounded-md
                     border
                     text-xs
                     font-bold
                     flex
                     items-center
                     justify-center
                     relative"
            >

              {{ idx + 1 }}


              <span
                v-if="session.guessedAnswers[idx]"

                class="absolute
                       -top-1
                       -right-1
                       w-2
                       h-2
                       bg-amber-500
                       rounded-full"
              ></span>

            </button>

          </div>


          <!-- LEGEND -->

          <div
            class="pt-2
                   border-t
                   border-zinc-800/80
                   text-[11px]
                   text-zinc-400
                   space-y-1.5"
          >

            <div
              class="flex
                     items-center
                     gap-2"
            >

              <span
                class="w-3
                       h-3
                       bg-red-900
                       border
                       border-red-700
                       rounded"
              ></span>

              Answered

            </div>


            <div
              class="flex
                     items-center
                     gap-2"
            >

              <span
                class="w-3
                       h-3
                       bg-amber-950
                       border
                       border-amber-700
                       rounded"
              ></span>

              Marked as Guess

            </div>


            <div
              class="flex
                     items-center
                     gap-2"
            >

              <span
                class="w-3
                       h-3
                       bg-zinc-950
                       border
                       border-zinc-800
                       rounded"
              ></span>

              Unattempted

            </div>

          </div>

        </div>

      </div>

    </div>

  </div>

  `
};