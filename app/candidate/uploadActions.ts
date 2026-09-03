"use server";

import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { prepareDirectCvUpload, ALLOWED_CV_TYPES, MAX_CV_BYTES } from "@/lib/cv/storage";
import { signUploadTicket } from "@/lib/cv/uploadTicket";
import { driveApplicationError } from "@/lib/driveApplications";
import { consumeAuthLimit } from "@/lib/authRateLimit";

export async function prepareCvUploadAction(driveId: string, file: { name: string; mime: string; size: number }) {
  const user = await requireRole("candidate");
  try {
    if (!file || typeof file.name !== "string" || file.name.length > 200 || !ALLOWED_CV_TYPES.includes(file.mime) || file.mime === "application/msword" || !Number.isInteger(file.size) || file.size <= 0 || file.size > MAX_CV_BYTES) return { error: "Upload a PDF, DOCX or TXT CV up to 10 MB." };
    const drive = await prisma.drive.findUnique({ where: { id: driveId } });
    const closed = driveApplicationError(drive);
    if (closed) return { error: closed };
    const existing = await prisma.application.findFirst({ where: { candidateId: user.id, driveId }, select: { id: true } });
    if (existing) return { error: "You already applied to this drive. Continue from your dashboard." };
    if (!(await consumeAuthLimit(`cv-upload:${user.id}`, 5))) return { error: "Too many upload attempts. Please wait 15 minutes." };
    if (!isSupabaseConfigured() && process.env.NODE_ENV !== "production") return { direct: false as const };
    const applicationId = randomUUID();
    const upload = await prepareDirectCvUpload(applicationId, file.name);
    const ticket = signUploadTicket({ applicationId, userId: user.id, driveId, storagePath: upload.storagePath, fileName: file.name, mime: file.mime, size: file.size, expiresAt: Date.now() + 20 * 60000 });
    return { direct: true as const, signedUrl: upload.signedUrl, ticket };
  } catch { return { error: "Secure upload is unavailable. Please try again shortly." }; }
}
