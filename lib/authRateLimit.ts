import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";

// Shared database counters work across Vercel instances, unlike an in-memory Map.
// Keys contain only a digest; raw IPs and emails are not stored here.
export async function consumeAuthLimit(subject: string, limit: number, now = Date.now()): Promise<boolean> {
  const windowMs = 15 * 60 * 1000;
  const bucket = Math.floor(now / windowMs);
  const key = createHash("sha256").update(`${bucket}:${subject}`).digest("hex");
  const row = await prisma.authRateLimit.upsert({
    where: { key },
    create: { key, attempts: 1, expiresAt: new Date((bucket + 1) * windowMs) },
    update: { attempts: { increment: 1 } },
    select: { attempts: true },
  });
  // Indexed expiry cleanup; no extra cron job needed.
  await prisma.authRateLimit.deleteMany({ where: { expiresAt: { lt: new Date(now - windowMs) } } });
  return row.attempts <= limit;
}

export async function allowAuthRequest(email: string, action: "signup" | "login" | "recovery" | "reset"): Promise<boolean> {
  const requestHeaders = await headers();
  // Vercel overwrites this header at its edge. Do not trust arbitrary forwarded
  // headers on other hosts; they share a conservative fallback bucket.
  const ip = process.env.VERCEL === "1"
    ? requestHeaders.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    : "local";
  const ipAllowed = await consumeAuthLimit(`${action}:ip:${ip}`, action === "login" ? 60 : 20);
  if (!ipAllowed) return false;
  return consumeAuthLimit(`${action}:email:${email}`, action === "signup" || action === "recovery" ? 5 : 10);
}
