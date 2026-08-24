import type { SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function canManage(user: SessionUser, ownerId: string) {
  return user.role.toLowerCase() === "admin" || ownerId === user.id;
}

export async function requireManagedDrive(user: SessionUser, driveId: string) {
  const drive = await prisma.drive.findUnique({ where: { id: driveId } });
  if (!drive || !canManage(user, drive.ownerId)) throw new Error("FORBIDDEN");
  return drive;
}

export async function requireManagedFunnel(user: SessionUser, funnelId: string) {
  const funnel = await prisma.funnel.findUnique({ where: { id: funnelId }, include: { drive: true } });
  if (!funnel || !canManage(user, funnel.drive.ownerId)) throw new Error("FORBIDDEN");
  return funnel;
}

export async function requireManagedApplication(user: SessionUser, applicationId: string) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { drive: true, funnel: true },
  });
  if (!application || !canManage(user, application.drive.ownerId)) throw new Error("FORBIDDEN");
  return application;
}

export async function managedApplicationIds(user: SessionUser, applicationIds: string[]) {
  const unique = [...new Set(applicationIds)].slice(0, 500);
  const rows = await prisma.application.findMany({
    where: {
      id: { in: unique },
      ...(user.role.toLowerCase() === "admin" ? {} : { drive: { ownerId: user.id } }),
    },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}
