// CV parsing: tries Gemini -> Groq -> local heuristic fallback.
// Runs without any API key (heuristic) and uses real LLMs when keys are set.

export interface ParsedCv {
  name?: string;
  email?: string;
  phone?: string;
  university?: string;
  degree?: string;
  gradYear?: number;
  gpa?: number;
  gpaScale?: number;
  skills: string[];
  experienceYears?: number;
  projects?: number;
  summary?: string;
}

import { cvComponents, computeCvScore } from "../engine/cv";
import { getAiRuntimeConfig } from "@/lib/ai/config";

export interface CvParseResult extends ParsedCv {
  matchedSkills: string[];
  missingSkills: string[];
}

export const SKILL_KEYWORDS = [
  "python", "java", "javascript", "typescript", "c++", "c#", "go", "rust", "php", "ruby", "kotlin", "swift",
  "react", "angular", "vue", "next.js", "node.js", "express", "django", "flask", "fastapi", "spring", "dotnet",
  "sql", "postgresql", "mysql", "mongodb", "redis", "firebase", "supabase",
  "aws", "azure", "gcp", "docker", "kubernetes", "terraform", "ci/cd", "jenkins",
  "machine learning", "deep learning", "nlp", "computer vision", "pytorch", "tensorflow", "scikit-learn",
  "data analysis", "pandas", "numpy", "tableau", "power bi",
  "html", "css", "tailwind", "bootstrap",
  "git", "linux", "rest", "graphql", "microservices", "agile", "scrum",
  "prompt engineering", "llm", "openai", "langchain", "figma", "ui/ux",
];

// Pull required skills for a drive from its job description.
export function extractRequiredFromJd(jd: string): string[] {
  const lower = jd.toLowerCase();
  return SKILL_KEYWORDS.filter((s) => lower.includes(s.trim().toLowerCase())).map((s) => s.trim());
}

const DEGREE_KEYWORDS = [
  "computer science", "software engineering", "artificial intelligence", "information technology",
  "computer engineering", "electrical engineering", "data science", "mechanical engineering",
  "civil engineering", "mathematics", "physics", "robotics",
];

function clean(text: string): string {
  return text.replace(/ /g, " ").replace(/\r/g, "");
}

function heuristicParse(text: string): ParsedCv {
  const t = clean(text);
  const lower = t.toLowerCase();

  const email = (t.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i) || [])[0];
  const phone = (t.match(/(?:\+?\d[\d\s().-]{7,}\d)/) || [])[0]?.trim();

  // name: first line that looks like a person name (2-3 titlecase words, no @)
  const lines = t.split("\n").map((l) => l.trim()).filter(Boolean);
  let name: string | undefined;
  for (const l of lines.slice(0, 8)) {
    if (l.length < 40 && /^[A-Z][a-z]+(\s[A-Z][a-z]+){1,2}$/.test(l) && !/@/.test(l)) {
      name = l;
      break;
    }
  }

  // university
  let university: string | undefined;
  const uniMatch = t.match(/(?:university|institute|college|school) of [^\n,]+/i)
    || t.match(/[^\n,]*\b(?:university|institute|college|NUST|FAST|LUMS|GIKI|COMSATS|UET|IBA|PIEAS|NED)\b[^\n,]*/i);
  if (uniMatch) university = uniMatch[0].replace(/\s+/g, " ").trim();

  // degree
  let degree: string | undefined;
  for (const d of DEGREE_KEYWORDS) {
    if (lower.includes(d)) {
      degree = d.replace(/\b\w/g, (c) => c.toUpperCase());
      break;
    }
  }
  if (!degree) {
    const degMatch = lower.match(/(b\.?s\.?|b\.?e\.?|b\.?a\.?|m\.?s\.?|m\.?e\.?|phd|master|bachelor)[^\n,]{0,40}/);
    if (degMatch) degree = degMatch[0].trim();
  }

  const gradYear = (t.match(/\b(20(?:1\d|2\d))\b/) || [])[1] ? Number((t.match(/\b(20(?:1\d|2\d))\b/) || [])[1]) : undefined;

  // GPA
  let gpa: number | undefined;
  let gpaScale = 4.0;
  const gpaMatch = t.match(/gpa\s*:?\s*([0-4](?:\.\d{1,2})?)\s*(?:\/\s*([0-4](?:\.\d{1,2})?))?/i);
  if (gpaMatch) {
    gpa = Number(gpaMatch[1]);
    if (gpaMatch[2]) gpaScale = Number(gpaMatch[2]);
  }

  // skills
  const skills = SKILL_KEYWORDS.filter((s) => lower.includes(s.trim().toLowerCase())).map((s) => s.trim());

  // experience years
  const expMatch = t.match(/(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)/i);
  const experienceYears = expMatch ? Number(expMatch[1]) : undefined;

  // projects count
  const projMatch = t.match(/(\d+)\s*(?:\+)?\s*projects?/i);
  const projects = projMatch ? Number(projMatch[1]) : undefined;

  return {
    name, email, phone, university, degree, gradYear, gpa, gpaScale,
    skills, experienceYears, projects,
    summary: `Extracted locally from ${skills.length} detected skills.`,
  };
}

async function llmParse(text: string): Promise<ParsedCv | null> {
  const { provider, apiKey, model } = await getAiRuntimeConfig();
  if (!apiKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const prompt = `Extract structured candidate data from this CV as JSON with fields: name, email, phone, university, degree, gradYear, gpa, gpaScale, skills (array), experienceYears, projects, summary. CV:\n${text.slice(0, 8000)}`;
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
      if (!res.ok) return null;
      const data = await res.json();
      const part = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const json = part.match(/\{[\s\S]*\}/)?.[0];
      if (!json) return null;
      return normalizeLlm(JSON.parse(json));
    } else {
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
      if (!res.ok) return null;
      const data = await res.json();
      const part = data?.choices?.[0]?.message?.content || "";
      return normalizeLlm(JSON.parse(part));
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeLlm(o: any): ParsedCv {
  return {
    name: o.name, email: o.email, phone: o.phone, university: o.university,
    degree: o.degree, gradYear: o.gradYear ? Number(o.gradYear) : undefined,
    gpa: o.gpa ? Number(o.gpa) : undefined, gpaScale: o.gpaScale ? Number(o.gpaScale) : 4.0,
    skills: Array.isArray(o.skills) ? o.skills.map(String) : [],
    experienceYears: o.experienceYears ? Number(o.experienceYears) : undefined,
    projects: o.projects ? Number(o.projects) : undefined, summary: o.summary,
  };
}

export async function parseCv(
  resumeText: string,
  requiredSkills: string[] = [],
  preferredSkills: string[] = [],
): Promise<CvParseResult> {
  const base = (await llmParse(resumeText)) || heuristicParse(resumeText);
  const have = new Set(base.skills.map((s) => s.toLowerCase()));
  const matchedSkills = requiredSkills.filter((s) => have.has(s.toLowerCase()));
  const missingSkills = requiredSkills.filter((s) => !have.has(s.toLowerCase()));
  return { ...base, matchedSkills, missingSkills };
}

// Test an AI provider connection with a minimal request.
export async function testProvider(provider: string, apiKey: string): Promise<{ ok: boolean; message: string }> {
  if (!apiKey) return { ok: false, message: "No API key provided." };
  try {
    if (provider === "gemini") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || "gemini-1.5-flash"}:generateContent?key=${apiKey}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: "Say OK." }] }] }) },
      );
      return res.ok ? { ok: true, message: "Gemini connected." } : { ok: false, message: `Gemini error ${res.status}` };
    }
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: "user", content: "Say OK." }] }),
    });
    return res.ok ? { ok: true, message: "Groq connected." } : { ok: false, message: `Groq error ${res.status}` };
  } catch (e: any) {
    return { ok: false, message: e?.message || "Connection failed." };
  }
}

// Score a parsed CV against a drive (uses the engine).
export function scoreParsedCv(parsed: CvParseResult, driveConfig: {
  requiredSkills: string[];
  preferredSkills: string[];
  universityScoreOverride?: number;
}): { components: ReturnType<typeof cvComponents>; cvScore: number } {
  const components = cvComponents({
    cgpa: parsed.gpa,
    cgpaScale: parsed.gpaScale,
    university: parsed.university,
    universityScoreOverride: driveConfig.universityScoreOverride,
    degree: parsed.degree,
    requiredSkills: driveConfig.requiredSkills,
    preferredSkills: driveConfig.preferredSkills,
    candidateSkills: parsed.skills,
    projects: parsed.projects !== undefined ? Math.min(100, parsed.projects * 20) : 0,
    experience: parsed.experienceYears !== undefined ? Math.min(100, parsed.experienceYears * 20) : 0,
    other: 50,
  });
  return { components, cvScore: computeCvScore(components) };
}
