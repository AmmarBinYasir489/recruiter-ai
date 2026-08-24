import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma, uj } from "@/lib/db";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { reviewerCanGrade } from "@/lib/reviewerAccess";

export async function GET(_: Request, { params }: { params: Promise<{ resultId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { resultId } = await params;
  const result = await prisma.assessmentResult.findUnique({ where: { id: resultId }, include: { application: { include: { drive: true, funnel: true } } } });
  if (!result || result.type !== "ENGLISH_SPEAKING") return new NextResponse("Not found", { status: 404 });
  const allowed = user.role === "admin"
    || user.role === "recruiter" && result.application.drive.ownerId === user.id
    || user.role === "reviewer" && reviewerCanGrade(user, result.type, result.application.funnel)
    || user.role === "candidate" && result.application.candidateId === user.id;
  if (!allowed) return new NextResponse("Forbidden", { status: 403 });
  const answers = uj<{ bucket?: string; storagePath?: string }>(result.answers) || {};
  if (!answers.bucket || !answers.storagePath) return new NextResponse("Recording unavailable", { status: 404 });
  const { data, error } = await getSupabaseAdmin().storage.from(answers.bucket).createSignedUrl(answers.storagePath, 60);
  if (error || !data?.signedUrl) return new NextResponse("Recording unavailable", { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
