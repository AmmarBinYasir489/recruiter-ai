// Public links use the immutable drive ID, so renames and duplicate titles
// cannot send an applicant to a different drive.
export function publicApplyPath(driveId: string): string {
  return `/apply/${encodeURIComponent(driveId)}`;
}

export function candidateReturnPath(value: unknown): string {
  if (typeof value !== "string") return "/candidate";
  if (/^\/apply\/[a-zA-Z0-9_-]+$/.test(value)) return value;
  const legacy = value.match(/^\/candidate\/apply\/([a-zA-Z0-9_-]+)$/);
  return legacy ? publicApplyPath(legacy[1]) : "/candidate";
}

export function signedInDestination(role: string, returnTo: unknown): string {
  return role === "candidate" ? candidateReturnPath(returnTo) : `/${role}`;
}

export function candidatePlaceholderName(email: string): string {
  return email.split("@")[0].slice(0, 80);
}
