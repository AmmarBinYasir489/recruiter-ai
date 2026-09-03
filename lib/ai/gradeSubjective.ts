// AI grading for subjective assessments (ESSAY / CODING / PROMPT).
// Each question is graded SEPARATELY (like portal-v2): the model returns a
// per-question score (0..maxPoints) and brief feedback, and the final 0-100
// normalized score is the sum of question scores divided by the sum of maxes.
// Reuses the same provider configuration as parseCv.ts (Gemini -> Groq).
// Errors are surfaced to the caller so the reviewer sees a useful diagnostic;
// the caller still falls back to manual grading and never auto-advances.

import { generateAiText } from "@/lib/ai/client";
import { injectionWarnings } from "@/lib/ai/security";

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
        JSON.stringify({ questionNumber: it.number, maxPoints: it.maxScore, section: it.section, question: it.prompt, untrustedCandidateAnswer: it.answer || "(empty)" }),
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

async function callAiText(prompt: string, timeoutMs = 25000): Promise<string> {
  return generateAiText({ prompt, json: true, timeoutMs });
}

export async function gradeSubjective(type: string, items: GradingItem[]): Promise<SubjectiveGrade | null> {
  if (!items.length) return null;
  if (items.some((item) => injectionWarnings(item.answer).length)) throw new Error("Instruction-like content was detected. A human reviewer must grade this submission.");
  const text = await callAiText(buildPrompt(type, items));
  try {
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) throw new Error("AI grader returned invalid JSON");
    const parsed = JSON.parse(json);
    const scoresObj = parsed?.scores || {};
    const questions: QuestionGrade[] = [];
    let total = 0;
    let maxTotal = 0;
    for (const it of items) {
      const s = scoresObj[String(it.number)] || scoresObj[it.number] || {};
      const raw = s?.score;
      if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0 || raw > it.maxScore || typeof s.feedback !== "string") throw new Error(`Missing or invalid grade for question ${it.number}`);
      const score = it.answer.trim() ? raw : 0;
      questions.push({ number: it.number, score, maxScore: it.maxScore, feedback: s.feedback.slice(0, 1200) });
      total += score;
      maxTotal += it.maxScore;
    }
    const normalized = maxTotal ? Math.round((total / maxTotal) * 100) : 0;
    return { questions, normalized };
  } catch (error) {
    throw new Error(error instanceof Error ? `AI grading response could not be parsed: ${error.message}` : "AI grading response could not be parsed");
  }
}
