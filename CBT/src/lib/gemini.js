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

export async function processSourceWithGemini({ apiKey, files, examMode, onStatus }) {
  if (!apiKey) throw new Error("Please enter your Gemini API Key in Settings.");
  if (!files?.length) throw new Error("Please select a PDF or up to 10 images.");

  onStatus?.("Reading files...");
  const parts = [];
  for (const file of files) {
    const data = await fileToBase64(file);
    parts.push({ inline_data: { mime_type: file.type, data } });
  }

  const prompt = `Extract all multiple choice questions (MCQs) from this exam paper into a structured JSON array.
        Each question object MUST follow this schema strictly:
        [
          {
            "number": 1,
            "subject": "One of: ${subjectListPrompt(examMode)}",
            "text": "Question statement formatted in LaTeX math wrapped inside single $ symbols like $E=mc^2$",
            "options": ["Option A statement with $math$", "Option B statement", "Option C statement", "Option D statement"],
            "correctAnswer": 0,
            "marks": 1,
            "explanation": "Short step-by-step solution, answering trick, or key formula used (e.g. Formula: $V=IR$. Shortcut trick: Double current when resistance is halved).",
            "hasImage": false,
            "imageNote": "If question references a figure/diagram, set hasImage to true and summarize the diagram visual details here briefly."
          }
        ]
        Set "correctAnswer" to 0-based index (0=A, 1=B, 2=C, 3=D).
        Return ONLY valid JSON.`;

  parts.push({ text: prompt });
  onStatus?.("Extracting MCQs & solutions...");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { response_mime_type: "application/json" }
      })
    }
  );

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error("Gemini returned an empty response.");
  const parsed = JSON.parse(rawText);
  const questions = Array.isArray(parsed) ? parsed : parsed.questions || [];
  if (!questions.length) throw new Error("No questions were extracted.");
  return questions;
}
