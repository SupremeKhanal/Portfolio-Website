/* ── Rate-limiter for Gemini calls ──────────────────────────────────── */
const GEMINI_WINDOW_MS = 60_000;
const MAX_GEMINI_PER_MIN = 3;
const geminiLog = [];

function isGeminiThrottled() {
  const now = Date.now();
  while (geminiLog.length && geminiLog[0] < now - GEMINI_WINDOW_MS) geminiLog.shift();
  return geminiLog.length >= MAX_GEMINI_PER_MIN;
}
function recordGeminiCall() { geminiLog.push(Date.now()); }

/* ── Helpers ───────────────────────────────────────────────────────── */

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = (error) => reject(error);
  });
}

function subjectListPrompt(examMode) {
  if (examMode === "CEE") return "Zoology, Botany, Physics, Chemistry, or MAT";
  if (examMode === "IOE") return "Mathematics, Physics, Chemistry, or English";
  return "General (use a short topic label if obvious, otherwise leave empty)";
}

function extractJsonPayload(raw) {
  let text = String(raw || "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();
  const arrayStart = text.indexOf("[");
  const objectStart = text.indexOf("{");
  if (arrayStart >= 0 && (objectStart < 0 || arrayStart < objectStart)) {
    const end = text.lastIndexOf("]");
    if (end > arrayStart) text = text.slice(arrayStart, end + 1);
  } else if (objectStart >= 0) {
    const end = text.lastIndexOf("}");
    if (end > objectStart) text = text.slice(objectStart, end + 1);
  }
  return text;
}

function repairJsonEscapes(text) {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
      continue;
    }
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      const next = text[i + 1];
      if (next && '"\\/bfnrtu'.includes(next)) {
        out += ch;
        escaped = true;
      } else {
        out += "\\\\";
      }
      continue;
    }
    if (ch === '"') {
      inString = false;
      out += ch;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      out += "\\n";
      continue;
    }
    if (ch === "\t") {
      out += "\\t";
      continue;
    }
    if (ch.charCodeAt(0) < 32) continue;
    out += ch;
  }
  return out;
}

export function parseGeminiJson(rawText) {
  const payload = extractJsonPayload(rawText);
  const attempts = [payload, repairJsonEscapes(payload)];
  let lastError = null;
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    "The AI returned invalid JSON (often from LaTeX backslashes). Try converting the same PDF again. " +
      (lastError?.message || "")
  );
}

function questionsFromParsed(parsed) {
  const questions = Array.isArray(parsed) ? parsed : parsed?.questions || [];
  return questions.filter((q) => q && (q.text || q.options));
}

/** Validate and clean API key format */
export function cleanKey(raw) {
  return String(raw || "").trim().replace(/^["']|["']$/g, "");
}

export function validateApiKey(key) {
  return Boolean(cleanKey(key));
}

/** Fetch with timeout */
async function fetchWithTimeout(url, options, timeoutMs = 120_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Quick verification to test if an API key works */
export async function testGeminiApiKey(apiKey) {
  const key = cleanKey(apiKey);
  if (!key) throw new Error("Please enter an API key first.");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Hello, reply with OK" }] }]
      })
    }
  );
  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message || "Google AI returned an error with this key.");
  }
  return "OK";
}

/* ── PDF/Image → MCQ extraction ────────────────────────────────────── */

export async function processSourceWithGemini({ apiKey, files, examMode, onStatus }) {
  const key = cleanKey(apiKey);
  if (!key) {
    throw new Error("Please enter your Gemini API key in Settings.");
  }
  if (!files?.length) throw new Error("Please select a PDF or up to 10 images.");
  if (isGeminiThrottled()) throw new Error("Too many AI requests. Please wait a moment before trying again.");

  recordGeminiCall();
  onStatus?.("Reading files...");
  const parts = [];
  for (const file of files) {
    const data = await fileToBase64(file);
    parts.push({ inline_data: { mime_type: file.type || "application/pdf", data } });
  }

  const prompt = `Extract all multiple choice questions (MCQs) from this exam paper into a JSON array.
Each object MUST use this schema:
[
  {
    "number": 1,
    "subject": "One of: ${subjectListPrompt(examMode)}",
    "text": "Question text. Put LaTeX in $...$ using DOUBLE backslashes, e.g. $E=mc^2$ or $\\\\frac{a}{b}$.",
    "options": ["A", "B", "C", "D"],
    "correctAnswer": 0,
    "marks": 1,
    "explanation": "Short solution. Escape LaTeX the same way.",
    "hasImage": false,
    "imageNote": ""
  }
]
Rules:
- Return ONLY JSON. No markdown fences, no commentary.
- Every string must be valid JSON: escape quotes as \\", backslashes as \\\\, and never put raw line breaks inside strings.
- correctAnswer is 0-based (0=A, 1=B, 2=C, 3=D).`;

  parts.push({ text: prompt });

  async function callOnce() {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { response_mime_type: "application/json", temperature: 0.1 }
        })
      }
    );
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message || "Google AI error.");
    }
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error("Gemini returned an empty response.");
    return questionsFromParsed(parseGeminiJson(rawText));
  }

  onStatus?.("Extracting MCQs…");
  try {
    const questions = await callOnce();
    if (!questions.length) throw new Error("No questions were extracted.");
    return questions;
  } catch (err) {
    if (/invalid JSON|Unexpected token|Bad escaped|escaped character/i.test(err.message || "")) {
      onStatus?.("Repairing AI JSON, retrying…");
      const questions = await callOnce();
      if (!questions.length) throw new Error("No questions were extracted.");
      return questions;
    }
    throw err;
  }
}

/* ── AI Mistake Analysis (on-demand) ───────────────────────────────── */

export async function generateMistakeAnalysis({ apiKey, stats, subjectStats, examMode, guessedCount, guessedCorrectCount, guessedWrongCount, totalQuestions }) {
  const key = cleanKey(apiKey);
  if (!key) throw new Error("Set your Gemini API key in Settings to use AI analysis.");
  if (isGeminiThrottled()) throw new Error("Too many AI requests. Please wait a moment.");

  recordGeminiCall();

  const guessAccuracy = guessedCount > 0 ? ((guessedCorrectCount / guessedCount) * 100).toFixed(1) : "N/A";

  let subjectBreakdown = "";
  if (subjectStats && Object.keys(subjectStats).length) {
    subjectBreakdown = Object.entries(subjectStats)
      .map(([subj, s]) => `${subj}: ${s.correct} correct, ${s.wrong} wrong, ${s.unattempted} skipped out of ${s.totalMarks} marks`)
      .join("\n");
  }

  const prompt = `You are an exam performance analyst for a ${examMode} entrance exam student. Analyze this exam result and provide:

1. **Mistake Pattern Analysis**: Identify which subjects/areas are weakest based on the data.
2. **Guess Quality**: The student guessed on ${guessedCount} questions with ${guessAccuracy}% accuracy.${guessedCount > 0 && (guessedCorrectCount / guessedCount) < 0.6 ? " WARNING: Guess accuracy is below 60% — they should guess less or improve elimination strategy." : ""}
3. **Actionable Study Recommendations**: Specific, prioritized advice on what to study next.
4. **Positive Reinforcement**: Note what they did well.

Exam Data:
- Score: ${stats.finalScore}/${stats.totalPossibleMarks} (${stats.percent.toFixed(1)}%)
- Correct: ${stats.correctCount}, Wrong: ${stats.wrongCount}, Skipped: ${stats.skippedCount}
- Total Questions: ${totalQuestions}
- Guessed: ${guessedCount} (Correct: ${guessedCorrectCount}, Wrong: ${guessedWrongCount})
${subjectBreakdown ? `\nSubject Breakdown:\n${subjectBreakdown}` : ""}

Keep your response concise (under 250 words). Use bullet points. Be encouraging but honest.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7 }
      })
    }
  );

  const data = await response.json();
  if (data.error) throw new Error(data.error.message || "Google AI error.");
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("AI returned an empty analysis.");
  return text;
}