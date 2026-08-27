// Structured CV parsing: Gemini/Groq first, deterministic evidence-preserving fallback.
import { cvComponents, computeCvScore } from "../engine/cv";
import { DEFAULT_CGPA } from "../engine/cgpa";
import { getAiRuntimeConfig } from "@/lib/ai/config";
import { generateAiText, testAiProvider } from "@/lib/ai/client";
import { normalizeAiModel, normalizeAiProvider } from "@/lib/ai/providers";

export type CvLinkKind = "LINKEDIN" | "GITHUB" | "PORTFOLIO" | "HUGGINGFACE" | "OTHER";
export interface CvProject { name: string; description?: string; technologies: string[]; url?: string }
export interface CvExperience { title?: string; company?: string; location?: string; rawDate?: string; durationMonths?: number; description?: string }
export interface ParsedCv {
  name?: string; email?: string; phone?: string; location?: string; university?: string; degree?: string;
  gradYear?: number; gpa?: number; gpaScale?: number; gpaAssumed?: boolean;
  skills: string[]; skillCategories: Record<string, string[]>;
  experienceYears?: number; experience: CvExperience[]; projects?: number; projectDetails: CvProject[];
  certifications: string[]; coursework: string[]; links: Array<{ kind: CvLinkKind; url: string }>;
  summary?: string; extractionConfidence: number; validationWarnings: string[]; duplicateFields: string[];
  extractionMethod?: "AI_TEXT" | "AI_DOCUMENT" | "LOCAL_HEURISTIC";
}
export interface CvParseResult extends ParsedCv { matchedSkills: string[]; missingSkills: string[]; candidateQualityScore: number; fitSummary: string }

export const SKILL_KEYWORDS = [
  "python", "java", "javascript", "typescript", "c++", "c#", "go", "rust", "php", "ruby", "kotlin", "swift",
  "react", "angular", "vue", "next.js", "node.js", "express", "django", "flask", "fastapi", "spring", "dotnet",
  "sql", "postgresql", "mysql", "mongodb", "redis", "firebase", "supabase", "hadoop", "spark",
  "aws", "azure", "gcp", "docker", "kubernetes", "terraform", "ci/cd", "jenkins",
  "machine learning", "deep learning", "nlp", "computer vision", "pytorch", "tensorflow", "scikit-learn",
  "data analysis", "pandas", "numpy", "tableau", "power bi", "neural networks", "artificial intelligence", "data science",
  "html", "css", "tailwind", "bootstrap", "git", "linux", "rest", "graphql", "microservices", "agile", "scrum",
  "prompt engineering", "llm", "openai", "langchain", "figma", "ui/ux", "data structures", "algorithms", "oop",
];
const HEADINGS = ["summary", "profile", "objective", "skills", "technical skills", "experience", "work experience", "employment", "projects", "academic projects", "education", "certifications", "certificates", "coursework", "relevant coursework"];
const DATE_RANGE = /(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|\d{1,2})?[\s./-]*(?:19|20)\d{2}\s*(?:-|–|—|to)\s*(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|\d{1,2})?[\s./-]*(?:19|20)\d{2}|present|current)/i;

function clean(text: string) { return text.replace(/ /g, " ").replace(/\r/g, "").replace(/[ \t]+/g, " ").trim() }
function unique(values: string[]) {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const normalized = value.trim().replace(/^[•·▪\-*]+\s*/, "").replace(/[;,|]+$/, "");
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return [];
    seen.add(key); return [normalized];
  });
}
function section(text: string, names: string[]) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => names.includes(line.trim().replace(/:$/, "").toLowerCase()));
  if (start < 0) return "";
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (HEADINGS.includes(line.trim().replace(/:$/, "").toLowerCase())) break;
    body.push(line);
  }
  return body.join("\n").trim();
}
function splitList(body: string) { return unique(body.split(/\n|,|\||•|·/).filter((item) => item.trim().length > 1 && item.trim().length < 120)) }
function extractLinks(text: string): ParsedCv["links"] {
  return unique(text.match(/(?:https?:\/\/|www\.)[^\s)\]}>]+/gi) || []).map((raw) => {
    const url = raw.replace(/[.,;:]$/, ""); const lower = url.toLowerCase();
    const kind: CvLinkKind = lower.includes("linkedin.com") ? "LINKEDIN" : lower.includes("github.com") ? "GITHUB" : lower.includes("huggingface.co") ? "HUGGINGFACE" : /portfolio|behance|dribbble/.test(lower) ? "PORTFOLIO" : "OTHER";
    return { kind, url: /^https?:\/\//i.test(url) ? url : `https://${url}` };
  });
}
function monthsFromRange(raw?: string) {
  if (!raw) return undefined;
  const years = raw.match(/\b(?:19|20)\d{2}\b/g)?.map(Number) || [];
  if (!years.length) return undefined;
  const end = /present|current/i.test(raw) ? new Date().getFullYear() : years.at(-1)!;
  return Math.max(1, (end - years[0]) * 12 || 1);
}
function extractExperience(body: string): CvExperience[] {
  if (!body) return [];
  return body.split(/\n\s*\n|(?=^\s*[•▪*-]\s+)/m).map((block) => block.trim()).filter(Boolean).slice(0, 20).flatMap((block) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const rawDate = (block.match(DATE_RANGE) || [])[0];
    if (!rawDate && lines.length < 2) return [];
    const parts = lines[0].replace(rawDate || "", "").split(/\s+(?:at|@|\||—|–|-|,)\s+/i).filter(Boolean);
    return [{ title: parts[0]?.trim(), company: parts[1]?.trim(), rawDate, durationMonths: monthsFromRange(rawDate), description: lines.slice(1).join(" ") || undefined }];
  });
}
function extractProjects(body: string): CvProject[] {
  if (!body) return [];
  return body.split(/\n\s*\n|(?=^\s*[•▪*-]\s+)/m).map((block) => block.trim()).filter(Boolean).slice(0, 30).map((block) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean); const url = extractLinks(block)[0]?.url; const lower = block.toLowerCase();
    return { name: lines[0].replace(/^[•▪*-]\s*/, "").replace(url || "", "").trim().slice(0, 160) || "Project", description: lines.slice(1).join(" ").replace(url || "", "").trim() || undefined, technologies: SKILL_KEYWORDS.filter((skill) => lower.includes(skill)), url };
  });
}
function confidence(parsed: Partial<ParsedCv>) {
  const fields = [parsed.name, parsed.email, parsed.phone, parsed.location, parsed.university, parsed.degree, parsed.skills?.length, parsed.projectDetails?.length, parsed.experience?.length, parsed.certifications?.length];
  return Math.round(fields.filter(Boolean).length / fields.length * 100);
}
function heuristicParse(text: string): ParsedCv {
  const t = clean(text); const lower = t.toLowerCase(); const lines = t.split("\n").map((line) => line.trim()).filter(Boolean);
  const gpaMatch = t.match(/(?:c?gpa)\s*:?\s*([0-9](?:\.\d{1,2})?)\s*(?:\/\s*([0-9](?:\.\d{1,2})?))?/i);
  const projects = extractProjects(section(t, ["projects", "academic projects"]));
  const experience = extractExperience(section(t, ["experience", "work experience", "employment"]));
  const skillsBody = section(t, ["skills", "technical skills"]);
  const skills = unique([...splitList(skillsBody), ...SKILL_KEYWORDS.filter((skill) => lower.includes(skill))]);
  const months = experience.reduce((sum, item) => sum + (item.durationMonths || 0), 0);
  const result: ParsedCv = {
    name: lines.slice(0, 8).find((line) => line.length < 50 && /^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3}$/.test(line) && !/@|university|resume/i.test(line)),
    email: (t.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i) || [])[0], phone: (t.match(/(?:\+?\d[\d\s().-]{7,}\d)/) || [])[0]?.trim(),
    location: lines.slice(0, 15).find((line) => /karachi|lahore|islamabad|rawalpindi|peshawar|quetta|faisalabad|multan|pakistan|remote/i.test(line)),
    university: t.match(/[^\n,]*\b(?:university|institute|college|NUST|FAST|LUMS|GIKI|COMSATS|UET|IBA|PIEAS|NED)\b[^\n,]*/i)?.[0]?.trim(),
    degree: t.match(/(?:bachelor|master|ph\.?d|b\.?s\.?|m\.?s\.?|b\.?e\.?)\s*(?:of|in)?\s*[^\n,;]{2,60}/i)?.[0]?.trim(),
    gradYear: Number((section(t, ["education"]).match(/\b(20(?:1\d|2\d))\b/) || [])[1]) || undefined,
    gpa: gpaMatch ? Number(gpaMatch[1]) : DEFAULT_CGPA, gpaScale: gpaMatch?.[2] ? Number(gpaMatch[2]) : 4, gpaAssumed: !gpaMatch,
    skills, skillCategories: skillsBody ? { "CV skills": splitList(skillsBody) } : skills.length ? { Detected: skills } : {},
    experienceYears: months ? Math.round(months / 12 * 10) / 10 : undefined, experience, projects: projects.length, projectDetails: projects,
    certifications: splitList(section(t, ["certifications", "certificates"])), coursework: splitList(section(t, ["coursework", "relevant coursework"])), links: extractLinks(t),
    summary: section(t, ["summary", "profile", "objective"]).replace(/\n/g, " ").slice(0, 700) || undefined,
    extractionConfidence: 0, validationWarnings: [], duplicateFields: [],
  };
  result.extractionConfidence = confidence(result);
  if (result.gpaAssumed) result.validationWarnings.push("CGPA was not found; 2.50/4.00 was used for rubric scoring.");
  if (!projects.length) result.validationWarnings.push("No project evidence was extracted.");
  if (!experience.length) result.validationWarnings.push("No work experience evidence was extracted.");
  result.extractionMethod = "LOCAL_HEURISTIC";
  return result;
}
export function parseCvLocally(text: string): ParsedCv {
  return heuristicParse(text);
}
function normalizeCategories(value: unknown, skills: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return skills.length ? { General: skills } : {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([key, list]) => Array.isArray(list) ? [[key, unique(list.map(String))]] : []));
}
function normalizeLlm(o: Record<string, any>): ParsedCv {
  const skills = unique(Array.isArray(o.skills) ? o.skills.map(String) : []);
  const experience: CvExperience[] = Array.isArray(o.experience) ? o.experience.slice(0, 30).map((item: any) => ({ title: item?.title || undefined, company: item?.company || undefined, location: item?.location || undefined, rawDate: item?.rawDate || undefined, durationMonths: Number(item?.durationMonths) || monthsFromRange(item?.rawDate), description: item?.description ? String(item.description).slice(0, 1000) : undefined })) : [];
  const projectDetails: CvProject[] = Array.isArray(o.projectDetails) ? o.projectDetails.slice(0, 40).map((item: any) => ({ name: String(item?.name || "Project").slice(0, 160), description: item?.description ? String(item.description).slice(0, 1200) : undefined, technologies: unique(Array.isArray(item?.technologies) ? item.technologies.map(String) : []), url: item?.url || undefined })) : [];
  const explicitGpa = Number(o.gpa); const gpaAssumed = !Number.isFinite(explicitGpa) || Boolean(o.gpaAssumed);
  const result: ParsedCv = {
    name: o.name || undefined, email: o.email || undefined, phone: o.phone || undefined, location: o.location || undefined, university: o.university || undefined, degree: o.degree || undefined,
    gradYear: Number(o.gradYear) || undefined, gpa: gpaAssumed ? DEFAULT_CGPA : explicitGpa, gpaScale: Number(o.gpaScale) || 4, gpaAssumed,
    skills, skillCategories: normalizeCategories(o.skillCategories, skills), experienceYears: Number(o.experienceYears) || undefined, experience,
    projects: Number.isFinite(Number(o.projects)) ? Number(o.projects) : projectDetails.length, projectDetails,
    certifications: unique(Array.isArray(o.certifications) ? o.certifications.map(String) : []), coursework: unique(Array.isArray(o.coursework) ? o.coursework.map(String) : []),
    links: Array.isArray(o.links) ? o.links.flatMap((item: any) => item?.url ? [{ kind: (["LINKEDIN", "GITHUB", "PORTFOLIO", "HUGGINGFACE"].includes(String(item.kind).toUpperCase()) ? String(item.kind).toUpperCase() : "OTHER") as CvLinkKind, url: String(item.url) }] : []) : [],
    summary: o.summary ? String(o.summary).slice(0, 1000) : undefined, extractionConfidence: Math.max(0, Math.min(100, Number(o.extractionConfidence) || 0)),
    validationWarnings: unique(Array.isArray(o.validationWarnings) ? o.validationWarnings.map(String) : []), duplicateFields: unique(Array.isArray(o.duplicateFields) ? o.duplicateFields.map(String) : []),
  };
  if (!result.extractionConfidence) result.extractionConfidence = confidence(result);
  if (result.gpaAssumed && !result.validationWarnings.some((warning) => /gpa|cgpa/i.test(warning))) result.validationWarnings.push("CGPA was not found; 2.50/4.00 was used for rubric scoring.");
  return result;
}
async function llmParse(text: string, document?: { mime: string; base64: string }): Promise<ParsedCv | null> {
  const config = await getAiRuntimeConfig(); if (!config.apiKey) return null;
  const prompt = `Extract this CV as strict JSON. Never invent missing evidence. Preserve raw dates and URLs. Fields: name,email,phone,location,university,degree,gradYear,gpa,gpaScale,gpaAssumed,skills[],skillCategories(object of arrays),experienceYears,experience[{title,company,location,rawDate,durationMonths,description}],projects,projectDetails[{name,description,technologies[],url}],certifications[],coursework[],links[{kind,url}],summary,extractionConfidence(0-100),validationWarnings[],duplicateFields[]. If GPA is absent use 2.5/4 and gpaAssumed=true. JSON only.\nCV:\n${text.slice(0, 16000)}`;
  try {
    const output = await generateAiText({ prompt, json: true, document: config.provider === "gemini" ? document : undefined, config });
    const json = output.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return null;
    return { ...normalizeLlm(JSON.parse(json)), extractionMethod: document ? "AI_DOCUMENT" : "AI_TEXT" };
  } catch { return null }
}

export function extractRequiredFromJd(jd: string) {
  const lower = jd.toLowerCase(); const labelled = jd.match(/(?:required skills?|requirements?)\s*:?([^\n]{1,300})/i)?.[1] || "";
  return unique([...SKILL_KEYWORDS.filter((skill) => lower.includes(skill)), ...labelled.split(/,|\||•/).filter((item) => item.trim().length > 1 && item.trim().length < 60)]);
}
export async function parseCv(text: string, requiredSkills: string[] = [], _preferredSkills: string[] = []): Promise<CvParseResult> {
  return completeParse(await llmParse(text) || heuristicParse(text), requiredSkills);
}
export async function parseCvDocument(buffer: Buffer, mime: string, extractedText: string, requiredSkills: string[] = []): Promise<CvParseResult> {
  const canSendDocument = mime === "application/pdf" || mime.startsWith("image/");
  const parsed = await llmParse(extractedText, canSendDocument ? { mime, base64: buffer.toString("base64") } : undefined) || heuristicParse(extractedText);
  return completeParse(parsed, requiredSkills);
}
function completeParse(parsed: ParsedCv, requiredSkills: string[]): CvParseResult {
  const have = new Set(parsed.skills.map((skill) => skill.toLowerCase()));
  const matchedSkills = requiredSkills.filter((skill) => have.has(skill.toLowerCase())); const missingSkills = requiredSkills.filter((skill) => !have.has(skill.toLowerCase()));
  const ratio = requiredSkills.length ? matchedSkills.length / requiredSkills.length : 1;
  const evidence = Math.min(100, parsed.projectDetails.length * 15 + parsed.experience.length * 20 + parsed.certifications.length * 5);
  const candidateQualityScore = Math.round(ratio * 60 + evidence * .25 + parsed.extractionConfidence * .15);
  const fitSummary = requiredSkills.length ? `${matchedSkills.length} of ${requiredSkills.length} required skills matched. ${missingSkills.length ? `Missing evidence for: ${missingSkills.join(", ")}.` : "All detected requirements are represented."} ${parsed.projectDetails.length} project(s) and ${parsed.experience.length} work experience entries were verified from the CV.` : `No explicit drive skills were detected. Review ${parsed.projectDetails.length} project(s) and ${parsed.experience.length} experience entries manually.`;
  return { ...parsed, matchedSkills, missingSkills, candidateQualityScore, fitSummary };
}
export async function testProvider(providerValue: string, apiKey: string, modelValue?: string) {
  const provider = normalizeAiProvider(providerValue);
  const model = normalizeAiModel(provider, modelValue);
  return testAiProvider({ provider, model, apiKey, fallbackApiKey: "" });
}
export function scoreParsedCv(parsed: CvParseResult, config: { requiredSkills: string[]; preferredSkills: string[]; universityScoreOverride?: number }) {
  const projects = parsed.projectDetails.length ? Math.min(100, parsed.projectDetails.reduce((sum, project) => sum + 12 + Math.min(8, project.technologies.length * 2) + (project.description ? 5 : 0) + (project.url ? 5 : 0), 0)) : 0;
  const months = parsed.experience.reduce((sum, item) => sum + (item.durationMonths || 0), 0); const experience = months ? Math.min(100, Math.round(months / 36 * 100)) : 0;
  const other = Math.min(100, parsed.certifications.length * 15 + parsed.coursework.length * 3 + parsed.links.length * 5);
  const components = cvComponents({ cgpa: parsed.gpa, cgpaScale: parsed.gpaScale, university: parsed.university, universityScoreOverride: config.universityScoreOverride, degree: parsed.degree, requiredSkills: config.requiredSkills, preferredSkills: config.preferredSkills, candidateSkills: parsed.skills, projects, experience, other });
  return { components, cvScore: computeCvScore(components) };
}
