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

export async function processSourceWithGemini({ apiKey, files, examMode, onStatus }) {
  if (!apiKey) throw new Error("Please enter your Gemini API Key in Settings.");
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

  async function callOnce() {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
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
    if (data.error) throw new Error(data.error.message);
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
