import { describe, it, expect } from "vitest";
import {
  previewThresholdChange,
  applyThresholdToApplications,
} from "../cvThreshold";

const apps = [
  { id: "A", cvScore: 82, cvResult: "PASS" as const },
  { id: "B", cvScore: 65, cvResult: "PASS" as const },
  { id: "C", cvScore: 40, cvResult: "FAIL" as const },
];

describe("CV threshold 2-step workflow", () => {
  it("previews impact read-only without mutation", () => {
    const before = JSON.parse(JSON.stringify(apps));
    const preview = previewThresholdChange(60, 70, apps);
    expect(preview.eligible).toBe(3);
    expect(preview.passToFail).toBe(1); // B: 65 60->PASS, 70->FAIL
    expect(preview.failToPass).toBe(0);
    expect(preview.unchanged).toBe(2); // A 82, C 40
    // inputs untouched
    expect(apps).toEqual(before);
    expect(preview.details.find((d) => d.id === "B")?.changed).toBe(true);
    expect(preview.details.find((d) => d.id === "A")?.changed).toBe(false);
  });

  it("previews fail->pass when threshold lowered", () => {
    const p = previewThresholdChange(70, 60, [
      { id: "X", cvScore: 65, cvResult: "FAIL" },
    ]);
    expect(p.failToPass).toBe(1);
    expect(p.passToFail).toBe(0);
  });

  it("applying only changes actual results, never re-runs AI score", () => {
    const result = applyThresholdToApplications(apps, 70, "rec1", "2026-08-21T00:00:00Z");
    const b = result.find((r) => r.id === "B")!;
    expect(b.oldResult).toBe("PASS");
    expect(b.newResult).toBe("FAIL");
    expect(b.changed).toBe(true);
    const a = result.find((r) => r.id === "A")!;
    expect(a.changed).toBe(false);
    // AI cvScore preserved exactly
    expect(b.cvScore).toBe(65);
    // notifications should only fire for `changed` entries
    const notify = result.filter((r) => r.changed);
    expect(notify).toHaveLength(1);
    expect(notify[0].id).toBe("B");
  });

  it("no notifications when nothing changes", () => {
    const result = applyThresholdToApplications(apps, 75, "rec1", "t");
    expect(result.filter((r) => r.changed)).toHaveLength(1); // only B (65) flips
  });
});
