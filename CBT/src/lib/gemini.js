/* ── Candidate models with automatic failover ────────────────────────── */
const GEMINI_MODELS = [
  "gemini-3.6-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-2.5-flash",
  "gemini-1.5-pro"
];

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

/** Quick verification to test if an API key works across any active model */
export async function testGeminiApiKey(apiKey) {
  const key = cleanKey(apiKey);
  if (!key) throw new Error("Please enter an API key first.");

  let lastError = null;
  for (const model of GEMINI_MODELS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Respond with OK" }] }]
          })
        }
      );
      const data = await response.json();
      if (!data.error) {
        return `OK (using ${model})`;
      }
      lastError = data.error.message || `Error on ${model}`;
      if (/API_KEY_INVALID|API key not valid|key has expired/i.test(lastError)) {
        throw new Error(lastError);
      }
    } catch (err) {
      if (/API_KEY_INVALID|API key not valid|key has expired/i.test(err.message)) {
        throw err;
      }
      lastError = err.message;
    }
  }
  throw new Error(lastError || "Google AI error. Please check your API key.");
}

/* ── PDF/Image → MCQ extraction ────────────────────────────────────── */

export async function processSourceWithGemini({ apiKey, files, examMode, onStatus }) {
  const key = cleanKey(apiKey);
  if (!key) {
    throw new Error("Please enter your Gemini API key in Settings.");
  }
  if (!files?.length) throw new Error("Please select a PDF or up to 10 images.");

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

  async function callModel(model) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
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
      throw new Error(data.error.message || `Error on ${model}`);
    }
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error("Gemini returned an empty response.");
    return questionsFromParsed(parseGeminiJson(rawText));
  }

  onStatus?.("Extracting MCQs…");
  let lastErr = null;

  for (const model of GEMINI_MODELS) {
    try {
      onStatus?.(`Extracting MCQs with ${model}…`);
      const questions = await callModel(model);
      if (questions && questions.length > 0) {
        return questions;
      }
    } catch (err) {
      console.warn(`Model ${model} failed:`, err.message);
      lastErr = err;
      if (/invalid JSON|Unexpected token|Bad escaped|escaped character/i.test(err.message || "")) {
        try {
          onStatus?.(`Repairing AI response, retrying ${model}…`);
          const questions = await callModel(model);
          if (questions && questions.length > 0) return questions;
        } catch (retryErr) {
          lastErr = retryErr;
        }
      }
      if (/API_KEY_INVALID|API key not valid|key has expired/i.test(err.message)) {
        throw new Error("Invalid Gemini API key. Please check your key at aistudio.google.com/app/apikey");
      }
    }
  }

  throw new Error(lastErr?.message || "Failed to extract questions. Please try again.");
}

/* ── AI Mistake Analysis (on-demand) ───────────────────────────────── */

export async function generateMistakeAnalysis({ apiKey, stats, subjectStats, examMode, guessedCount, guessedCorrectCount, guessedWrongCount, totalQuestions }) {
  const key = cleanKey(apiKey);
  if (!key) throw new Error("Set your Gemini API key in Settings to use AI analysis.");

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

  let lastErr = null;
  for (const model of GEMINI_MODELS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
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
      if (text) return text;
    } catch (err) {
      lastErr = err;
      if (/API_KEY_INVALID|API key not valid/i.test(err.message)) throw err;
    }
  }

  throw new Error(lastErr?.message || "AI analysis is currently unavailable. Please try again in a moment.");
}