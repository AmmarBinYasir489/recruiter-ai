import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { processDueCvJobs } from "@/lib/cv/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function validSecret(req: NextRequest) {
  const configured = process.env.CRON_SECRET || process.env.CV_WORKER_SECRET || "";
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const expected = Buffer.from(configured), actual = Buffer.from(supplied);
  if (expected.length < 32 || expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export async function POST(req: NextRequest) {
  if (!validSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await processDueCvJobs(3));
}

// Vercel Cron invokes routes with GET and sends CRON_SECRET as a bearer token.
export async function GET(req: NextRequest) {
  if (!validSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await processDueCvJobs(3));
}
