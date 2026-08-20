import { reactive } from "vue";
import { presetParams } from "../lib/scoring.js";

export const examSession = reactive({
  questions: [],
  title: "",
  source: "upload",
  params: presetParams("IOE"),
  userAnswers: {},
  guessedAnswers: {},
  timeLeft: 0,
  timeSpent: 0,
  timer: null
});

export function resetSession(mode) {
  stopTimer();
  examSession.questions = [];
  examSession.title = "";
  examSession.source = "upload";
  examSession.params = presetParams(mode || "IOE");
  examSession.userAnswers = {};
  examSession.guessedAnswers = {};
  examSession.timeLeft = 0;
  examSession.timeSpent = 0;
}

export function loadQuestions(questions, { title, source, mode } = {}) {
  examSession.questions = questions;
  examSession.title = title || "Untitled paper";
  examSession.source = source || "upload";
  examSession.params = { ...presetParams(mode || "IOE"), ...examSession.params };
  examSession.userAnswers = {};
  examSession.guessedAnswers = {};
}

export function stopTimer() {
  if (examSession.timer) {
    clearInterval(examSession.timer);
    examSession.timer = null;
  }
}
