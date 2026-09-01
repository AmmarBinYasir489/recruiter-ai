import { describe, expect, it } from "vitest";
import { collapseCandidateTracks } from "../data";
import type { CandidateRecord } from "../engine/search";

function track(overrides: Partial<CandidateRecord>): CandidateRecord {
  return {
    id: "primary",
    applicationId: "PRIMARY",
    candidateGroupKey: "candidate-1:drive-1",
    isPrimaryTrack: true,
    name: "Carol Candidate",
    email: "candidate1@portal.com",
    phone: "",
    driveId: "drive-1",
    driveName: "AI Engineer",
    status: "IN_PROGRESS",
    currentStage: "CCAT",
    trackCount: 2,
    appliedAt: "2026-08-25T00:00:00.000Z",
    ...overrides,
  };
}

describe("candidate list funnel grouping", () => {
  it("shows one row while preserving independent funnel tracks", () => {
    const collapsed = collapseCandidateTracks([
      track({ id: "secondary", applicationId: "SECONDARY", isPrimaryTrack: false, currentStage: "MTT" }),
      track({ id: "primary", applicationId: "PRIMARY", isPrimaryTrack: true, currentStage: "CCAT" }),
    ]);

    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]).toMatchObject({ id: "primary", currentStage: "CCAT", trackCount: 2 });
    expect(collapsed[0].groupRefreshKey).toContain("secondary");
  });

  it("keeps a matching secondary track when the primary was removed by filters", () => {
    const collapsed = collapseCandidateTracks([
      track({ id: "secondary", applicationId: "SECONDARY", isPrimaryTrack: false, currentStage: "MTT" }),
    ]);

    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]).toMatchObject({ id: "secondary", currentStage: "MTT", trackCount: 2 });
  });
});
