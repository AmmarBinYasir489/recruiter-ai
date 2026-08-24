import { NextRequest } from "next/server";
import path from "path";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { verifyCvToken, authorizeCvAccess } from "@/lib/cv/access";
import { readCvFile } from "@/lib/cv/storage";

const CTYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  txt: "text/plain",
};

export async function GET(req: NextRequest, { params: paramsPromise }: { params: Promise<{ applicationId: string }> }) {
  const params = await paramsPromise;
  const applicationId = params.applicationId;
  const token = req.nextUrl.searchParams.get("token") || "";
  const user = await getCurrentUser();

  if (!user || !verifyCvToken(token, applicationId, user.id)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { drive: true, candidate: true },
  });
  if (!app) return new Response("Not found", { status: 404 });

  const allowed = await authorizeCvAccess(user, app);
  if (!allowed) return new Response("Forbidden", { status: 403 });

  const job = await prisma.cvJob.findFirst({
    where: { applicationId },
    orderBy: { createdAt: "desc" },
  });
  if (!job?.storagePath) {
    return new Response("CV file not available", { status: 404 });
  }

  let buf: Buffer;
  try {
    buf = await readCvFile(job.storagePath);
  } catch {
    return new Response("CV file not available", { status: 404 });
  }
  const ext = path.extname(job.fileName || job.storagePath).replace(".", "").toLowerCase();
  const ctype = CTYPES[ext] || "application/octet-stream";
  const fileName = job.fileName || `cv-${applicationId}${ext ? "." + ext : ""}`;

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": ctype,
      "Content-Disposition": `inline; filename="${fileName.replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}
