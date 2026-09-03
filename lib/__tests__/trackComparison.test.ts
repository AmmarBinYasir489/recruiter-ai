import { describe, it, expect } from "vitest";
import { buildTrackComparison } from "../trackComparison";

const weights = { CV_SCREENING: 10, CCAT: 15, MTT: 15 };
const enabled = ["CV_SCREENING", "CCAT", "MTT"];
const online = { id: "online", candidateId: "person", driveId: "drive", funnelId: "f1", trackKey: "FUNNEL:f1", status: "HOLD", currentStage: "CCAT", scores: '{"CV_SCREENING":80,"CCAT":60}', results: [
  { type: "CCAT", mode: "ONLINE", normalized: 60, status: "PASS" },
  { type: "CCAT", mode: "ONSITE", normalized: 0, status: "PENDING" },
] };
const onsite = { ...online, id: "onsite", trackKey: "ONSITE:f1", scores: '{"CV_SCREENING":80}', results: [] };

describe("same-funnel track comparison", () => {
  it("separates legacy retests from full sessions without mixing graded counts", () => {
    const rows = buildTrackComparison(online, [online, onsite], weights, enabled);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ source: "Online track", total: 43, gradedCount: 2, selected: true });
    expect(rows[1]).toMatchObject({ source: "Onsite retests on online track", total: 20, gradedCount: 2, selected: false });
    expect(rows[2]).toMatchObject({ source: "Full onsite session", total: 20, gradedCount: 1 });
  });
  it("keeps the same comparison when switching between matching tracks", () => {
    const rows = buildTrackComparison(onsite, [online, onsite], weights, enabled);
    expect(rows.map(({ selected, ...row }) => row)).toEqual(buildTrackComparison(online, [online, onsite], weights, enabled).map(({ selected, ...row }) => row));
    expect(rows.filter((r) => r.selected).map((r) => r.applicationId)).toEqual(["onsite"]);
  });
  it("excludes different funnels, drives and candidates", () => {
    const other = [{ ...online, id: "other-funnel", funnelId: "f2" }, { ...online, id: "other-drive", driveId: "d2" }, { ...online, id: "other-person", candidateId: "p2" }];
    expect(buildTrackComparison(onsite, [onsite, ...other], weights, enabled)).toHaveLength(1);
    expect(buildTrackComparison({ ...online, funnelId: null }, [online], weights, enabled)).toEqual([]);
  });
  it("marks archived sources and never fills retests from unrelated legacy scores", () => {
    const rows = buildTrackComparison(online, [{ ...online, status: "ARCHIVED", scores: '{"CV_SCREENING":80,"CCAT":60,"MTT":100}' }], weights, enabled);
    expect(rows[1]).toMatchObject({ archived: true, gradedCount: 2, total: 20 });
  });
});
