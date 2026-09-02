import type { CvComponentScores, CvSkillMatch, Decision } from "./types";
import { universityScore } from "./tiers";
import { cgpaToAcademics, toFourPointScale } from "./cgpa";

// CV scoring rubric (resolved current rubric), weights sum to 100.
export const CV_RUBRIC: Record<keyof CvComponentScores, number> = {
  academics: 10,
  universityDegree: 10,
  skills: 30,
  projects: 25,
  experience: 15,
  other: 10,
};

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

// Score the skills component: required skills weigh 70% of the 30% weight,
// preferred skills weigh 30%. Each required skill fully matched = 1, missing = 0.
export function scoreSkills(
  required: string[],
  preferred: string[],
  candidateSkills: string[],
): CvSkillMatch {
  const have = new Set(candidateSkills.map(norm));
  const reqMatched: string[] = [];
  const reqMissing: string[] = [];
  for (const r of required.map(norm)) {
    if (have.has(r)) reqMatched.push(r);
    else reqMissing.push(r);
  }
  const prefMatched: string[] = [];
  const prefMissing: string[] = [];
  for (const p of preferred.map(norm)) {
    if (have.has(p)) prefMatched.push(p);
    else prefMissing.push(p);
  }
  const reqScore = required.length ? reqMatched.length / required.length : 0;
  const prefScore = preferred.length ? prefMatched.length / preferred.length : 0;
  const combined = required.length && preferred.length
    ? reqScore * 0.7 + prefScore * 0.3
    : required.length
      ? reqScore
      : preferred.length
        ? prefScore
        : 0;
  const score = Math.round(clamp(combined * 100));
  return {
    required,
    preferred,
    matched: [...reqMatched, ...prefMatched],
    missing: [...reqMissing, ...prefMissing],
    score,
  };
}

// Degrees considered relevant to technical/engineering roles.
export const RELEVANT_DEGREES = [
  "computer science",
  "cs",
  "software engineering",
  "se",
  "artificial intelligence",
  "ai",
  "information technology",
  "it",
  "computer engineering",
  "ce",
  "electrical engineering",
  "ee",
];

// Score how relevant a candidate's degree is (0-100). Exact/contains match in
// the relevant list scores high; a related engineering/computing field scores
// partial; unrelated degrees score low.
export function degreeRelevance(degree?: string): number {
  if (!degree) return 0;
  const d = degree.trim().toLowerCase();
  if (RELEVANT_DEGREES.includes(d)) return 100;
  if (RELEVANT_DEGREES.some((r) => d.includes(r) || r.includes(d))) return 90;
  if (/engineer|comput|software|data|math|physics|telecom|robotics/.test(d)) return 60;
  return 20;
}

export interface CvInput {
  cgpa?: number;
  cgpaScale?: number;
  university?: string;
  universityScoreOverride?: number;
  degree?: string;
  skills?: number; // optional explicit skills score 0-100
  requiredSkills?: string[];
  preferredSkills?: string[];
  candidateSkills?: string[];
  projects?: number; // 0-100
  experience?: number; // 0-100
  other?: number; // 0-100
}

// Build the six component scores (each 0-100) from raw candidate input.
export function cvComponents(input: CvInput): CvComponentScores {
  const cgpa4 = input.cgpa !== undefined ? toFourPointScale(input.cgpa, input.cgpaScale ?? 4) : undefined;
  const academics = cgpaToAcademics(cgpa4);
  const tier = input.universityScoreOverride ?? universityScore(input.university).score;
  const deg = degreeRelevance(input.degree);
  // University & Degree relevance blends the institution tier with degree fit.
  // This component represents two pieces of extracted evidence. Do not award
  // partial points from a university tier or a degree guess when either field
  // is absent.
  const universityDegree = input.university?.trim() && input.degree?.trim()
    ? Math.round((tier + deg) / 2)
    : 0;
  const skills =
    input.skills !== undefined
      ? clamp(input.skills)
      : scoreSkills(input.requiredSkills ?? [], input.preferredSkills ?? [], input.candidateSkills ?? []).score;
  return {
    academics,
    universityDegree,
    skills,
    projects: clamp(input.projects ?? 0),
    experience: clamp(input.experience ?? 0),
    other: clamp(input.other ?? 0),
  };
}

// Weighted CV score 0-100.
export function computeCvScore(components: CvComponentScores): number {
  const total =
    components.academics * CV_RUBRIC.academics +
    components.universityDegree * CV_RUBRIC.universityDegree +
    components.skills * CV_RUBRIC.skills +
    components.projects * CV_RUBRIC.projects +
    components.experience * CV_RUBRIC.experience +
    components.other * CV_RUBRIC.other;
  // Components and weights are both percentages, so divide weighted points by
  // 100 before clamping to the public 0-100 scale.
  return Math.round(clamp(total / 100));
}

// Single-threshold decision: score >= cvPassThreshold => PASS else FAIL.
export function evaluateCv(cvScore: number, cvPassThreshold: number): Decision {
  return cvScore >= cvPassThreshold ? "PASS" : "FAIL";
}

export function explainCv(components: CvComponentScores, cvScore: number, threshold: number): string {
  const strongest = (Object.entries(components) as [keyof CvComponentScores, number][])
    .sort((a, b) => b[1] - a[1])[0];
  const decision = evaluateCv(cvScore, threshold);
  return (
    `CV scored ${cvScore}/100 against the rubric (strongest: ${strongest[0]} at ${Math.round(
      strongest[1],
    )}). Threshold is ${threshold}; result ${decision}.`
  );
}
