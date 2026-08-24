// AI grading for subjective assessments (ESSAY / CODING / PROMPT).
// Each question is graded SEPARATELY (like portal-v2): the model returns a
// per-question score (0..maxPoints) and brief feedback, and the final 0-100
// normalized score is the sum of question scores divided by the sum of maxes.
// Reuses the same provider configuration as parseCv.ts (Gemini -> Groq).
// Returns null when no API key is configured or the call fails, so callers can
// fall back to manual reviewer grading.

import { getAiRuntimeConfig } from "@/lib/ai/config";

const PER_QUESTION_MAX: Record<string, number> = {
  CODING: 10,
  PROMPT: 10,
  ESSAY: 10, // overridden by section (DESCRIPTIVE = 20)
};

export function questionMaxScore(type: string, section?: string | null): number {
  if (type === "ESSAY") return section === "DESCRIPTIVE" ? 20 : 10;
  return PER_QUESTION_MAX[type] || 10;
}

export interface QuestionGrade {
  number: number;
  score: number;
  maxScore: number;
  feedback: string;
}

export interface SubjectiveGrade {
  questions: QuestionGrade[];
  normalized: number;
}

interface GradingItem {
  number: number;
  section?: string | null;
  prompt: string;
  answer: string;
  maxScore: number;
}

function buildPrompt(type: string, items: GradingItem[]): string {
  const typeName = type === "ESSAY" ? "essay" : type === "CODING" ? "coding" : "prompt engineering";
  const list = items
    .map(
      (it) =>
        `Question ${it.number} (max ${it.maxScore} pts)${it.section ? ` [${it.section}]` : ""}:\n${it.prompt}\nCandidate answer:\n${it.answer || "(empty)"}`,
    )
    .join("\n\n---\n\n");
  const keys = items.map((it) => `"${it.number}": { "score": <0..${it.maxScore}>, "feedback": "one sentence" }`).join(", ");
  return `You are an expert hiring assessor grading a candidate's ${typeName} submission, QUESTION BY QUESTION.
For EACH question assign an integer score from 0 to its max points and a one-sentence feedback.
Be strict but fair; reward clear reasoning, original thinking, and correct/working solutions.

${list}

Return ONLY a JSON object of this exact shape:
{ "scores": { ${keys} } }`;
}

async function callAiText(prompt: string, timeoutMs = 25000): Promise<string | null> {
  const { provider, apiKey, model } = await getAiRuntimeConfig();
  if (!apiKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (provider === "gemini") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          signal: controller.signal,
        },
      );
      const data = await res.json();
      return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    }
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt + "\nReturn only JSON." }],
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function gradeSubjective(type: string, items: GradingItem[]): Promise<SubjectiveGrade | null> {
  if (!items.length) return null;
  const text = await callAiText(buildPrompt(type, items));
  if (!text) return null;
  try {
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return null;
    const parsed = JSON.parse(json);
    const scoresObj = parsed?.scores || {};
    const questions: QuestionGrade[] = [];
    let total = 0;
    let maxTotal = 0;
    for (const it of items) {
      const s = scoresObj[String(it.number)] || scoresObj[it.number] || {};
      const raw = Number(s?.score);
      const score = Number.isFinite(raw) ? Math.max(0, Math.min(it.maxScore, Math.round(raw))) : 0;
      questions.push({ number: it.number, score, maxScore: it.maxScore, feedback: String(s?.feedback || "") });
      total += score;
      maxTotal += it.maxScore;
    }
    const normalized = maxTotal ? Math.round((total / maxTotal) * 100) : 0;
    return { questions, normalized };
  } catch {
    return null;
  }
}
