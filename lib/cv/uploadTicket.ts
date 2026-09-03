import { createHmac, timingSafeEqual } from "node:crypto";
export type CvUploadTicket = { applicationId: string; userId: string; driveId: string; storagePath: string; fileName: string; mime: string; size: number; expiresAt: number };
function secret() {
  const key = process.env.CV_TOKEN_SECRET || process.env.AI_SETTINGS_ENCRYPTION_KEY;
  if (!key || key.length < 32) throw new Error("A CV upload signing secret of at least 32 characters is required.");
  return key;
}
export function signUploadTicket(ticket: CvUploadTicket) {
  const payload = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  return `${payload}.${createHmac("sha256", secret()).update(payload).digest("hex")}`;
}
export function readUploadTicket(value: string, userId: string, driveId: string, now = Date.now()): CvUploadTicket | null {
  try {
    if (value.length > 6000) return null;
    const [payload, signature, extra] = value.split(".");
    if (extra || !/^[a-f0-9]{64}$/.test(signature || "")) return null;
    const expected = createHmac("sha256", secret()).update(payload).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) return null;
    const ticket = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as CvUploadTicket;
    if (ticket.userId !== userId || ticket.driveId !== driveId || !Number.isFinite(ticket.expiresAt) || ticket.expiresAt <= now) return null;
    if (!/^supabase:\/\/[^/]+\/applications\//.test(ticket.storagePath)) return null;
    return ticket;
  } catch { return null; }
}
