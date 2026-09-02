import { describe, expect, it } from "vitest";
import { extractSkillRequirementsFromJd, parseCvLocally, scoreParsedCv } from "../ai/parseCv";

describe("structured CV parser", () => {
  const cv = `
Muhammad Imran
Karachi, Pakistan
muhammad@example.com

Education
BS Computer Science, FAST University, 2026

Technical Skills
Python, Machine Learning, TensorFlow

Projects
AI Recruitment Assistant
Built a Python and TensorFlow matching system.
https://github.com/example/recruiter

Work Experience
Machine Learning Intern at Example Labs — June 2025 - August 2025
Built data pipelines and model evaluation tools.

Certifications
Machine Learning Specialization

Relevant Coursework
Data Structures, Artificial Intelligence
`;

  it("extracts priority evidence and marks missing CGPA as an assumption", () => {
    const parsed = parseCvLocally(cv);
    expect(parsed.location).toContain("Karachi");
    expect(parsed.projectDetails[0]?.name).toContain("AI Recruitment");
    expect(parsed.projectDetails[0]?.url).toContain("github.com");
    expect(parsed.experience[0]?.title).toContain("Machine Learning Intern");
    expect(parsed.experience[0]?.company).toContain("Example Labs");
    expect(parsed.experience[0]?.rawDate).toContain("2025");
    expect(parsed.certifications).toContain("Machine Learning Specialization");
    expect(parsed.gpa).toBe(2.5);
    expect(parsed.gpaAssumed).toBe(true);
  });

  it("does not award project or experience points without extracted evidence", () => {
    const parsed = parseCvLocally("Candidate Name\ncandidate@example.com\nTechnical Skills\nEnglish Speaking, Accounting");
    const scored = scoreParsedCv({ ...parsed, matchedSkills: [], missingSkills: ["python"], candidateQualityScore: 0, fitSummary: "" }, { requiredSkills: ["python"], preferredSkills: [] });
    expect(scored.components.projects).toBe(0);
    expect(scored.components.experience).toBe(0);
    expect(scored.components.skills).toBe(0);
    expect(scored.cvScore).toBeLessThan(50);
  });

  it("separates labelled required and preferred drive skills", () => {
    const requirements = extractSkillRequirementsFromJd(
      "Strong AI background. Required: Python, PyTorch, NLP. Preferred: LangChain, AWS, Computer Vision.",
    );
    expect(requirements.required).toHaveLength(3);
    expect(requirements.required).toEqual(expect.arrayContaining(["python", "pytorch", "nlp"]));
    expect(requirements.preferred).toHaveLength(3);
    expect(requirements.preferred).toEqual(expect.arrayContaining(["langchain", "aws", "computer vision"]));
  });

  it("gives zero evidence points and zero skills points when none were extracted", () => {
    const parsed = parseCvLocally("Candidate Name\ncandidate@example.com");
    const scored = scoreParsedCv(
      { ...parsed, skills: [], matchedSkills: [], missingSkills: [], candidateQualityScore: 0, fitSummary: "" },
      { requiredSkills: [], preferredSkills: [] },
    );
    expect(scored.components.skills).toBe(0);
    expect(scored.components.projects).toBe(0);
    expect(scored.components.experience).toBe(0);
    expect(scored.components.other).toBe(0);
  });
});
