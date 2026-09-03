// Presentation only; access always uses the verified database role.
export const AUTH_PORTALS = ["candidate", "recruiter", "reviewer", "admin"] as const;
export type AuthPortal = typeof AUTH_PORTALS[number];
export const PORTAL_LABELS: Record<AuthPortal, string> = { candidate: "Candidate", recruiter: "Recruiter", reviewer: "Reviewer", admin: "Admin" };
export function authPortal(value: unknown): AuthPortal {
  return AUTH_PORTALS.find(portal => portal === value) || "candidate";
}
