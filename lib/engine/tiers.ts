import type { UniversityTierInfo } from "./types";

// University tier configuration from SCORING_RUBRICS_AND_UNIVERSITY_TIERS.md
// Internal hiring policy (NOT an HEC ranking).
// Tier 1 = 85, Tier 2 = 100, Tier 3 = 70 (per approved recruitment policy).

export const TIER_SCORE: Record<1 | 2 | 3, number> = {
  1: 85,
  2: 100,
  3: 70,
};

export const TIER1: string[] = [
  "FAST-NUCES",
  "NUST",
  "LUMS",
  "COMSATS University Islamabad",
  "Ghulam Ishaq Khan Institute (GIKI)",
];

export const TIER2: string[] = [
  "UET Lahore",
  "NED University",
  "IBA Karachi",
  "Air University",
  "Bahria University",
  "PIEAS",
  "UET Peshawar",
  "Mehran University (MUET)",
  "Information Technology University Lahore",
  "Habib University",
  "Sukkur IBA University",
  "BUITEMS Quetta",
  // Additional HEC-recognised CS / engineering universities
  "Sir Syed CASE Institute of Technology",
  "Riphah International University",
  "Capital University of Science and Technology",
  "University of Central Punjab",
  "COMSATS University Wah",
  "National University of Technology",
  "University of Engineering and Technology, Peshawar",
  "NUST School of Electrical Engineering",
];

export const TIER3: string[] = [
  "University of the Punjab",
  "Quaid-i-Azam University",
  "International Islamic University Islamabad",
  "UET Taxila",
  "University of Karachi",
  "University of Peshawar",
  "UET Mardan",
  "NUTECH",
  "Institute of Space Technology",
  "Khwaja Fareed University of Engineering and Information Technology",
  "University of Gujrat",
  "Government College University Faisalabad",
  "Government College University Lahore",
  "DHA Suffa University",
  "Iqra University",
  "Karakoram International University",
  "Mirpur University of Science and Technology",
  // Additional HEC-recognised universities with CS programmes
  "Bahauddin Zakariya University",
  "Islamia University of Bahawalpur",
  "University of Sargodha",
  "University of Education, Lahore",
  "Virtual University of Pakistan",
  "National Textile University",
  "Gomal University",
  "University of Malakand",
  "SZABIST",
  "Lahore College for Women University",
  "University of Okara",
  "University of Sahiwal",
  "Abdul Wali Khan University Mardan",
  "Shaheed Zulfikar Ali Bhutto Institute of Science and Technology",
  "University of Engineering and Technology, Mardan",
];

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

const TIER_INDEX: Record<string, 1 | 2 | 3> = (() => {
  const map: Record<string, 1 | 2 | 3> = {};
  for (const n of TIER1) map[normalize(n)] = 1;
  for (const n of TIER2) map[normalize(n)] = 2;
  for (const n of TIER3) map[normalize(n)] = 3;
  return map;
})();

export function universityTier(name?: string): 1 | 2 | 3 | "UNVERIFIED" {
  if (!name) return "UNVERIFIED";
  const key = normalize(name);
  if (TIER_INDEX[key]) return TIER_INDEX[key];
  // loose contains match so "LUMS" matches "Lahore University of Management Sciences (LUMS)"
  for (const [k, t] of Object.entries(TIER_INDEX)) {
    if (key.includes(k) || k.includes(key)) return t as 1 | 2 | 3;
  }
  return "UNVERIFIED";
}

export function universityScore(name?: string): UniversityTierInfo {
  const tier = universityTier(name);
  if (tier === "UNVERIFIED") {
    return { name: name ?? "", tier, score: 0 };
  }
  return { name: name ?? "", tier, score: TIER_SCORE[tier] };
}
