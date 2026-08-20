import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  orderBy,
  serverTimestamp,
  runTransaction,
  Timestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { db } from "../firebase.js";
import { answersToMap, computeResults, sanitizeQuestions } from "./scoring.js";

export function localDateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function upsertUserProfile(user, extra = {}) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const base = {
    displayName: user.displayName || "",
    email: user.email || "",
    photoURL: user.photoURL || "",
    updatedAt: serverTimestamp()
  };
  if (!snap.exists()) {
    await setDoc(ref, {
      ...base,
      createdAt: serverTimestamp(),
      examMode: extra.examMode || null,
      ...extra
    });
  } else {
    await updateDoc(ref, { ...base, ...extra });
  }
  const next = await getDoc(ref);
  return next.data();
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

export async function getQuotaCount(uid) {
  const date = localDateKey();
  const snap = await getDoc(doc(db, "quota", `${uid}_${date}`));
  return snap.exists() ? snap.data().count || 0 : 0;
}

export async function incrementQuota(uid) {
  const date = localDateKey();
  const ref = doc(db, "quota", `${uid}_${date}`);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const count = snap.exists() ? snap.data().count || 0 : 0;
    if (count >= 10) {
      throw new Error("Daily upload quota reached (10 conversions/day). Try again tomorrow.");
    }
    tx.set(ref, { userId: uid, date, count: count + 1 });
  });
}

export async function listAttempts(uid, examMode) {
  const q = query(
    collection(db, "attempts"),
    where("userId", "==", uid),
    where("examMode", "==", examMode),
    orderBy("createdAt", "desc")
  );
  try {
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    // Fallback if composite index is not ready yet.
    const snap = await getDocs(query(collection(db, "attempts"), where("userId", "==", uid)));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((a) => a.examMode === examMode)
      .sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() || 0;
        const tb = b.createdAt?.toMillis?.() || 0;
        return tb - ta;
      });
  }
}

export async function getAttempt(id) {
  const snap = await getDoc(doc(db, "attempts", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function getAttemptDetails(id) {
  const snap = await getDoc(doc(db, "attemptDetails", id));
  if (!snap.exists()) return null;
  return snap.data();
}

export async function saveAttempt({
  uid,
  examMode,
  source,
  title,
  questions,
  userAnswers,
  guessedAnswers,
  params,
  timeSpent
}) {
  const cleanQuestions = sanitizeQuestions(questions);
  const answersMap = answersToMap(userAnswers);
  const guessedMap = answersToMap(guessedAnswers);
  const stats = computeResults(cleanQuestions, answersMap, guessedMap, params, examMode);

  const summary = {
    userId: uid,
    examMode,
    source: source || "upload",
    title: title || "Untitled paper",
    createdAt: serverTimestamp(),
    score: stats.finalScore,
    totalMarks: stats.totalPossibleMarks,
    percent: stats.percent,
    passed: stats.passed,
    correct: stats.correctCount,
    wrong: stats.wrongCount,
    skipped: stats.skippedCount,
    guessed: stats.guessedCount,
    timeSpent: timeSpent || 0,
    questionCount: cleanQuestions.length,
    passPercent: Number(params.passPercent) || 40,
    negativeMarkingRate: Number(params.negativeMarkingRate) || 0
  };
  if (examMode === "IOE" || examMode === "CEE") {
    summary.subjectStats = stats.subjectStats;
  }

  const attemptRef = await addDoc(collection(db, "attempts"), summary);
  await setDoc(doc(db, "attemptDetails", attemptRef.id), {
    userId: uid,
    questions: cleanQuestions,
    userAnswers: answersMap,
    guessedAnswers: guessedMap,
    params: {
      duration: Number(params.duration) || 0,
      passPercent: Number(params.passPercent) || 40,
      negativeMarkingRate: Number(params.negativeMarkingRate) || 0,
      shuffle: Boolean(params.shuffle)
    },
    examMode,
    title: summary.title
  });
  return attemptRef.id;
}

export async function listPyqSets(examMode) {
  const snap = await getDocs(collection(db, "pyqSets"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => s.published !== false && (!examMode || s.examMode === examMode))
    .sort((a, b) => (b.year || 0) - (a.year || 0));
}

export async function getPyqQuestions(setId) {
  const snap = await getDoc(doc(db, "pyqSets", setId, "questions", "all"));
  if (!snap.exists()) return [];
  return sanitizeQuestions(snap.data().items || []);
}

export async function importPyqSet({ examMode, title, year, label, questions }) {
  const items = sanitizeQuestions(questions);
  const setRef = await addDoc(collection(db, "pyqSets"), {
    examMode,
    title,
    year: Number(year) || new Date().getFullYear(),
    label: label || "",
    questionCount: items.length,
    published: true,
    createdAt: serverTimestamp()
  });
  await setDoc(doc(db, "pyqSets", setRef.id, "questions", "all"), { items });
  return setRef.id;
}

export function createdAtDate(value) {
  if (!value) return new Date();
  if (value instanceof Timestamp) return value.toDate();
  if (value.toDate) return value.toDate();
  if (value.seconds) return new Date(value.seconds * 1000);
  return new Date(value);
}
