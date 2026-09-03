export const FINISHED_APPLICATION_STATUSES = ["REJECTED", "OFFERED", "HIRED", "ARCHIVED", "COMPLETED"];

export function driveTransitionError(from: string, to: string, pending: { applications: number; attempts: number; jobs: number; invites: number }): string | null {
  const transitions: Record<string, string[]> = { OPEN: ["CLOSED"], CLOSED: ["OPEN", "COMPLETED"], COMPLETED: ["ARCHIVED", "CLOSED"], ARCHIVED: ["COMPLETED"] };
  if (!transitions[from]?.includes(to)) return "This drive state change is not available.";
  if (["COMPLETED", "ARCHIVED"].includes(to) && Object.values(pending).some((count) => count > 0)) {
    return `Finish pending work first: ${pending.applications} application(s), ${pending.attempts} test attempt(s), ${pending.jobs} CV job(s), ${pending.invites} onsite invitation(s). Closing applications does not interrupt existing tests.`;
  }
  return null;
}
