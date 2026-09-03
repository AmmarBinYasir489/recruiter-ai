type IntakeDrive = { status: string; deadline: Date };

// Drives have date-only deadlines: intake closes at the next UTC midnight.
export function driveApplicationsCloseAt(deadline: Date): Date {
  return new Date(Date.UTC(deadline.getUTCFullYear(), deadline.getUTCMonth(), deadline.getUTCDate() + 1));
}

export function driveApplicationError(drive: IntakeDrive | null, now = new Date()): string | null {
  if (!drive || drive.status !== "OPEN") return "This drive is closed to new applications.";
  const closesAt = driveApplicationsCloseAt(drive.deadline).getTime();
  if (!Number.isFinite(closesAt) || now.getTime() >= closesAt) {
    return "The application deadline has passed. Existing applicants can still continue from their dashboard.";
  }
  return null;
}

export function formatDriveDeadline(deadline: Date): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(deadline);
}
