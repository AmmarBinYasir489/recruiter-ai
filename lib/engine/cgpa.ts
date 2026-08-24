// CGPA -> Academics component band (0-100), from SCORING_RUBRICS doc.
// Equivalent CGPA on a 4.0 scale:
//   3.50+ -> 100, 3.00-3.49 -> 70, 2.50-2.99 -> 40, <2.50 -> 10
//   Missing CGPA -> default CGPA of 2.50 (40).

export const DEFAULT_CGPA = 2.5;

export function cgpaToAcademics(cgpa?: number): number {
  if (cgpa === undefined || cgpa === null || Number.isNaN(cgpa)) {
    return cgpaToAcademics(DEFAULT_CGPA);
  }
  if (cgpa >= 3.5) return 100;
  if (cgpa >= 3.0) return 70;
  if (cgpa >= 2.5) return 40;
  return 10;
}

// Convert any CGPA scale to a 4.0-equivalent band before scoring.
export function toFourPointScale(cgpa: number, scale = 4.0): number {
  if (scale === 4.0) return cgpa;
  return (cgpa / scale) * 4.0;
}
