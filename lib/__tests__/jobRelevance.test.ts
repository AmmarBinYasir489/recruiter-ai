import { describe, it, expect } from "vitest";
import { cleanSkills, evidenceMatches } from "../jobSkills";
import { parseCvLocally, scoreParsedCv } from "../ai/parseCv";

describe("job-relevant CV evidence", () => {
  const base = { ...parseCvLocally("Example Candidate\nSkills\nReact, JavaScript\n"), matchedSkills: [], missingSkills: [], candidateQualityScore: 0, fitSummary: "" };
  it("gives unrelated circuit projects and accounting work zero web-development credit", () => {
    const result = scoreParsedCv({ ...base,
      projectDetails: [{ name: "DLD circuit", technologies: ["Verilog"], description: "Built a logic circuit", url: "https://example.com" }],
      experience: [{ title: "Accountant", description: "Bookkeeping and audit", durationMonths: 48 }],
      certifications: ["Accounting certificate"], coursework: ["Digital logic circuits"], links: [{ kind: "GITHUB", url: "https://github.com/example" }],
    }, { jobTitle: "Web Developer", requiredSkills: ["react", "javascript"], preferredSkills: [] });
    expect(result.components).toMatchObject({ projects: 0, experience: 0, other: 0 });
    expect(result.relevance.projects[0].matched).toEqual([]);
  });
  it("credits extracted related evidence and explains partial relevance", () => {
    const result = scoreParsedCv({ ...base, projectDetails: [{ name: "React dashboard", technologies: ["React", "JavaScript"], description: "Built a responsive web app" }], experience: [{ title: "Frontend developer", description: "React web applications", durationMonths: 18 }] }, { jobTitle: "Web Developer", requiredSkills: ["react", "javascript"], preferredSkills: [] });
    expect(result.components.projects).toBeGreaterThan(0);
    expect(result.components.experience).toBe(50);
    expect(result.relevance.projects[0].relevance).toBe(1);
  });
  it("has no substring matches and normalizes explicit requirements", () => {
    expect(evidenceMatches("JavaScript programming", ["java", "go", "javascript"])).toEqual(["javascript"]);
    expect(cleanSkills("React, react; JavaScript\nCSS")).toEqual(["react", "javascript", "css"]);
  });
});
