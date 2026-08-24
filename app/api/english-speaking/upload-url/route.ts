import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { ENGLISH_SPEAKING_MAX_BYTES, ENGLISH_SPEAKING_MIME_TYPES, isSpeakingMimeAllowed, normalizeSpeakingMime } from "@/lib/englishSpeaking";

export const runtime = "nodejs";
const BUCKET = process.env.SUPABASE_ASSESSMENT_BUCKET || "assessment-recordings";

async function ensureBucket() {
  const client = getSupabaseAdmin();
  const { data } = await client.storage.getBucket(BUCKET);
  if (data) return;
  const { error } = await client.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: ENGLISH_SPEAKING_MAX_BYTES,
    allowedMimeTypes: ENGLISH_SPEAKING_MIME_TYPES,
  });
  if (error && !/already exists/i.test(error.message)) throw error;
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "candidate") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Private assessment storage is not configured." }, { status: 503 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const applicationId = String(body?.applicationId || "");
  const attemptId = String(body?.attemptId || "");
  const mimeType = normalizeSpeakingMime(String(body?.mimeType || ""));
  const byteSize = Math.round(Number(body?.byteSize || 0));
  if (!isSpeakingMimeAllowed(mimeType)) return NextResponse.json({ error: "Unsupported audio format." }, { status: 400 });
  if (byteSize < 1 || byteSize > ENGLISH_SPEAKING_MAX_BYTES) return NextResponse.json({ error: "Recording must be 50 MB or smaller." }, { status: 400 });

  const attempt = await prisma.assessmentAttempt.findFirst({
    where: { id: attemptId, applicationId, type: "ENGLISH_SPEAKING", status: "ACTIVE", application: { candidateId: user.id, currentStage: "ENGLISH_SPEAKING", phaseReleased: true } },
  });
  if (!attempt || attempt.deadlineAt && attempt.deadlineAt < new Date()) return NextResponse.json({ error: "This assessment attempt is not active." }, { status: 409 });

  await ensureBucket();
  const extension = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mpeg") ? "mp3" : mimeType.includes("mp4") ? "m4a" : mimeType.includes("wav") ? "wav" : "webm";
  const storagePath = `applications/${applicationId}/${attemptId}/${crypto.randomUUID()}.${extension}`;
  const { data, error } = await getSupabaseAdmin().storage.from(BUCKET).createSignedUploadUrl(storagePath);
  if (error || !data?.signedUrl) return NextResponse.json({ error: "Could not prepare the secure upload." }, { status: 500 });
  return NextResponse.json({ signedUrl: data.signedUrl, storagePath, bucket: BUCKET });
}
