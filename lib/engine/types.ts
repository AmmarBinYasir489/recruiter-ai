// Shared types for the recruitment-portal logic engine.
// Pure, framework-free. Safe to import from Next.js, scripts and Vitest.

export type Role = "admin" | "recruiter" | "reviewer" | "candidate";

export type StageType =
  | "CV_SCREENING"
  | "CCAT"
  | "MTT"
  | "ESSAY"
  | "CODING"
  | "PROMPT"
  | "RAT"
  | "ENGLISH_SPEAKING"
  | "GAMES"
  | "MANUAL_REVIEW"
  | "ONSITE"
  | "FINAL";

export type GradingMode = "AUTO" | "MANUAL" | "AUTO_APPROVAL";

export type Decision = "PASS" | "FAIL" | "PENDING" | "MANUAL_REVIEW";

export type ApplicationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "IN_PROGRESS"
  | "REJECTED"
  | "ARCHIVED"
  | "OFFERED"
  | "HIRED"
  | "HOLD";

export interface UniversityTierInfo {
  name: string;
  tier: 1 | 2 | 3 | "UNVERIFIED";
  score: number; // 0-100 contribution to the University & Degree component
}

// ---- CV component input (each sub-score is 0-100) ----
export interface CvComponentScores {
  academics: number; // from CGPA band
  universityDegree: number; // from university tier
  skills: number; // required/preferred skills matched
  projects: number;
  experience: number;
  other: number;
}

export interface CvSkillMatch {
  required: string[];
  preferred: string[];
  matched: string[];
  missing: string[];
  score: number; // 0-100
}

export interface AssessmentResult {
  type: StageType;
  rawScore: number;
  maxScore: number;
  normalized: number; // 0-100
  status: Decision;
  gradedBy?: string;
  gradedAt?: string;
  notes?: string;
}

export interface ThresholdApplication {
  id: string;
  cvScore: number; // 0-100, already computed
  cvResult: Decision; // current PASS/FAIL under old threshold
}

export interface TciComponent {
  type: StageType | "CUSTOM";
  label: string;
  score: number; // 0-100
  enabled: boolean;
  weight: number; // drive-configured weight (positive)
}

export interface CandidateFilter {
  driveId?: string;
  search?: string; // name / email / phone / application id / drive name
  status?: ApplicationStatus[];
  stage?: StageType[];
  university?: string[];
  degree?: string[];
  gradYearMin?: number;
  gradYearMax?: number;
  gpaMin?: number;
  gpaMax?: number;
  cvMin?: number;
  cvMax?: number;
  ccatMin?: number;
  ccatMax?: number;
  mttMin?: number;
  mttMax?: number;
  gameStatus?: Decision[];
  manualReviewStatus?: Decision[];
  onsiteRsvp?: ("ACCEPTED" | "DECLINED" | "PENDING")[];
  finalDecision?: Decision[];
  integrityFlag?: boolean;
}
