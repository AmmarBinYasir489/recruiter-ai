import { describe, expect, it } from "vitest";
import { driveApplicationError, driveApplicationsCloseAt, formatDriveDeadline } from "../driveApplications";

describe("drive intake deadline", () => {
  const drive = { status: "OPEN", deadline: new Date("2026-09-02T00:00:00.000Z") };

  it("allows applications through the entire UTC deadline date", () => {
    expect(driveApplicationError(drive, new Date("2026-09-02T23:59:59.999Z"))).toBeNull();
    expect(driveApplicationsCloseAt(drive.deadline).toISOString()).toBe("2026-09-03T00:00:00.000Z");
  });

  it("blocks exactly at the next UTC midnight and afterwards", () => {
    expect(driveApplicationError(drive, new Date("2026-09-03T00:00:00.000Z"))).toContain("deadline has passed");
  });

  it("fails closed for missing, closed, or invalid drives", () => {
    expect(driveApplicationError(null)).toBeTruthy();
    expect(driveApplicationError({ ...drive, status: "CLOSED" }, new Date("2026-09-01"))).toBeTruthy();
    expect(driveApplicationError({ ...drive, deadline: new Date("invalid") })).toBeTruthy();
  });

  it("displays the same date regardless of server timezone", () => {
    expect(formatDriveDeadline(drive.deadline)).toBe("Sep 2, 2026");
  });
});
