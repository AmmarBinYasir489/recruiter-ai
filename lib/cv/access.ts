import crypto from "crypto";
import { prisma, getFunnel } from "@/lib/db";

const SECRET = process.env.CV_TOKEN_SECRET || "dev-cv-token-secret-change-me";

// Short-lived, user-scoped token proving a CV download link was issued by the
// server. Binds applicationId + userId + expiry so a URL cannot be shared or
// reused after it expires.
export function signCvToken(applicationId: string, userId: string, ttlSeconds = 60): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${applicationId}:${userId}:${exp}`;
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifyCvToken(token: string, applicationId: string, userId: string): boolean {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const dot = raw.lastIndexOf(".");
    const sig = raw.slice(dot + 1);
    const body = raw.slice(0, dot);
    const [appId, uid, exp] = body.split(":");
    if (!appId || !uid || !exp || !sig) return false;
    const payload = `${appId}:${uid}:${exp}`;
    const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    if (appId !== applicationId || uid !== userId) return false;
    if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}

// Role-based access to a CV. `app` must include `drive` (and ideally `funnel`)
// so owner/assignment checks resolve. Candidate: own only. Recruiter: drives
// they own. Reviewer: applications they graded or are assigned to. Admin: any.
export async function authorizeCvAccess(
  user: { id: string; role: string } | null,
  app: { id: string; candidateId: string; funnelId?: string | null; drive?: { ownerId: string } | null }
): Promise<boolean> {
  if (!user) return false;
  const role = user.role.toLowerCase();
  if (role === "candidate") return app.candidateId === user.id;
  if (role === "admin") return true;
  if (role === "recruiter") return app.drive?.ownerId === user.id;
  if (role === "reviewer") {
    const graded = await prisma.assessmentResult.findFirst({ where: { applicationId: app.id, gradedBy: user.id } });
    const funnel = app.funnelId ? await getFunnel(app.funnelId) : null;
    const assigned = Boolean(funnel?.stages.some((s) => (s.assignedReviewers || []).includes(user.id)));
    return Boolean(graded || assigned);
  }
  return false;
}
