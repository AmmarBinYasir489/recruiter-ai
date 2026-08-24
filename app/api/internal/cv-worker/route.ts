import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { processDueCvJobs } from "@/lib/cv/worker";

export const dynamic = "force-dynamic";

function validSecret(req: NextRequest) {
  const configured = process.env.CV_WORKER_SECRET || process.env.CRON_SECRET || "";
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!configured || configured.length !== supplied.length) return false;
  return timingSafeEqual(Buffer.from(configured), Buffer.from(supplied));
}

export async function POST(req: NextRequest) {
  if (!validSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await processDueCvJobs(10));
}

// Vercel Cron invokes routes with GET and sends CRON_SECRET as a bearer token.
export async function GET(req: NextRequest) {
  if (!validSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await processDueCvJobs(10));
}
