"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { prisma, j } from "@/lib/db";
import { driveApplicationError } from "@/lib/driveApplications";
import { driveTransitionError, FINISHED_APPLICATION_STATUSES } from "@/lib/driveLifecycle";

export async function changeDriveStatus(driveId: string, status: string) {
  const user = await requireRole("admin", "recruiter");
  try {
    await prisma.$transaction(async (tx) => {
      const drive = await tx.drive.findUnique({ where: { id: driveId } });
      if (!drive || (user.role !== "admin" && drive.ownerId !== user.id)) throw new Error("Drive not found.");
      if (status === "OPEN" && driveApplicationError({ ...drive, status: "OPEN" })) throw new Error("The deadline has passed. Extend it before reopening applications.");
      const [applications, attempts, jobs, invites] = await Promise.all([
        tx.application.count({ where: { driveId, status: { notIn: FINISHED_APPLICATION_STATUSES } } }),
        tx.assessmentAttempt.count({ where: { application: { driveId }, status: { in: ["ACTIVE", "READY"] } } }),
        tx.cvJob.count({ where: { application: { driveId }, status: { in: ["QUEUED", "PROCESSING", "FAILED"] } } }),
        tx.onsiteInvite.count({ where: { application: { driveId }, status: { in: ["SENT", "PENDING", "ACCEPTED"] }, scheduledAt: { gte: new Date() } } }),
      ]);
      const error = driveTransitionError(drive.status, status, { applications, attempts, jobs, invites });
      if (error) throw new Error(error);
      const changed = await tx.drive.updateMany({ where: { id: driveId, status: drive.status }, data: { status } });
      if (changed.count !== 1) throw new Error("This drive changed. Refresh and try again.");
      await tx.auditLog.create({ data: { actorId: user.id, action: "DRIVE_STATUS_CHANGED", meta: j({ driveId, from: drive.status, to: status }) } });
    });
  } catch (error) { return { error: error instanceof Error ? error.message : "The drive could not be updated." }; }
  revalidatePath("/");
  revalidatePath("/admin", "layout");
  revalidatePath("/recruiter", "layout");
  revalidatePath(`/apply/${driveId}`);
  return { ok: true };
}
