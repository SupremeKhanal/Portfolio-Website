export function subjectsForMode(mode) {
  if (mode === "CEE") return ["Zoology", "Botany", "Physics", "Chemistry", "MAT"];
  if (mode === "IOE") return ["Mathematics", "Physics", "Chemistry", "English"];
  return [];
}

export function answerAt(userAnswers, index) {
  if (!userAnswers) return undefined;
  if (userAnswers[index] !== undefined && userAnswers[index] !== null) return userAnswers[index];
  const keyed = userAnswers[String(index)];
  if (keyed !== undefined && keyed !== null) return keyed;
  return undefined;
}

export function guessedAt(guessedAnswers, index) {
  if (!guessedAnswers) return false;
  return Boolean(guessedAnswers[index] || guessedAnswers[String(index)]);
}

export function normalizeSubject(raw, mode) {
  const targetSubjects = subjectsForMode(mode);
  if (!targetSubjects.length) return "";
  const rawSubj = (raw || "").trim();
  const exact = targetSubjects.find((s) => s.toLowerCase() === rawSubj.toLowerCase());
  if (exact) return exact;
  if (/zoology|zoo/i.test(rawSubj)) return "Zoology";
  if (/botany|bot/i.test(rawSubj)) return "Botany";
  if (/math/i.test(rawSubj)) return "Mathematics";
  if (/phys/i.test(rawSubj)) return "Physics";
  if (/chem/i.test(rawSubj)) return "Chemistry";
  if (/mat|aptitude|mental/i.test(rawSubj)) return "MAT";
  if (/eng/i.test(rawSubj)) return "English";
  return targetSubjects[0];
}

export function computeResults(questions = [], userAnswers = {}, guessedAnswers = {}, params = {}, examMode = "IOE") {
  const negative = Number(params.negativeMarkingRate) || 0;
  const passPercent = Number(params.passPercent) || 40;
  const totalPossibleMarks = questions.reduce((acc, q) => acc + (q.marks || 1), 0);

  let correctCount = 0;
  let wrongCount = 0;
  let guessedCount = 0;
  let guessedCorrectCount = 0;
  let guessedWrongCount = 0;
  let finalScore = 0;
  const mistakeList = [];
  const correctList = [];
  const guessedList = [];
  const unattemptedList = [];

  questions.forEach((q, i) => {
    const marks = q.marks || 1;
    const ans = answerAt(userAnswers, i);
    const guessed = guessedAt(guessedAnswers, i);
    if (guessed) {
      guessedCount++;
      guessedList.push(i + 1);
    }
    if (ans === undefined) {
      unattemptedList.push(i + 1);
      return;
    }
    if (ans === q.correctAnswer) {
      correctCount++;
      correctList.push(i + 1);
      finalScore += marks;
      if (guessed) guessedCorrectCount++;
    } else {
      wrongCount++;
      mistakeList.push(i + 1);
      finalScore -= marks * negative;
      if (guessed) guessedWrongCount++;
    }
  });

  const skippedCount = questions.length - (correctCount + wrongCount);
  const percent = totalPossibleMarks ? (finalScore / totalPossibleMarks) * 100 : 0;
  const passed = percent >= passPercent;

  const subjectStats = {};
  const targetSubjects = subjectsForMode(examMode);
  targetSubjects.forEach((s) => {
    subjectStats[s] = { totalMarks: 0, correct: 0, wrong: 0, unattempted: 0, score: 0 };
  });

  if (targetSubjects.length) {
    questions.forEach((q, idx) => {
      const subj = normalizeSubject(q.subject, examMode);
      if (!subjectStats[subj]) {
        subjectStats[subj] = { totalMarks: 0, correct: 0, wrong: 0, unattempted: 0, score: 0 };
      }
      const marks = q.marks || 1;
      subjectStats[subj].totalMarks += marks;
      const ans = answerAt(userAnswers, idx);
      if (ans === q.correctAnswer) {
        subjectStats[subj].correct++;
        subjectStats[subj].score += marks;
      } else if (ans !== undefined) {
        subjectStats[subj].wrong++;
        subjectStats[subj].score -= marks * negative;
      } else {
        subjectStats[subj].unattempted++;
      }
    });
  }

  return {
    finalScore,
    totalPossibleMarks,
    percent,
    passed,
    correctCount,
    wrongCount,
    skippedCount,
    guessedCount,
    guessedCorrectCount,
    guessedWrongCount,
    mistakeList,
    correctList,
    guessedList,
    unattemptedList,
    subjectStats
  };
}

export function formatTime(s) {
  const n = Number(s) || 0;
  return `${Math.floor(n / 60).toString().padStart(2, "0")}:${(n % 60).toString().padStart(2, "0")}`;
}

export function presetParams(mode) {
  if (mode === "CEE") return { duration: 180, passPercent: 40, negativeMarkingRate: 0.25, shuffle: false };
  if (mode === "OTHER") return { duration: 120, passPercent: 40, negativeMarkingRate: 0, shuffle: false };
  return { duration: 120, passPercent: 40, negativeMarkingRate: 0.1, shuffle: false };
}

export function sanitizeQuestions(questions) {
  return (questions || []).map((q, i) => ({
    number: q.number ?? i + 1,
    subject: q.subject || "",
    text: String(q.text || ""),
    options: (q.options || []).map((o) => String(o)),
    correctAnswer: Number(q.correctAnswer) || 0,
    marks: q.marks || 1,
    explanation: String(q.explanation || ""),
    hasImage: Boolean(q.hasImage),
    imageNote: String(q.imageNote || "")
  }));
}

export function answersToMap(obj) {
  const out = {};
  Object.keys(obj || {}).forEach((k) => {
    if (obj[k] === true || obj[k] === false) out[String(k)] = obj[k];
    else if (obj[k] !== undefined && obj[k] !== null) out[String(k)] = obj[k];
  });
  return out;
}
