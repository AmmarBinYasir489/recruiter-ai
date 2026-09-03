import { prisma } from "@/lib/db";
import { candidateReturnPath, signedInDestination } from "@/lib/publicApplications";

// Resolve the destination before returning a server-action redirect. Chaining a
// public-page redirect immediately after setting auth cookies can leave the
// App Router on an empty intermediate route.
export async function authDestination(user: { id: string; role: string }, value: unknown) {
  if (user.role !== "candidate") return signedInDestination(user.role, value);
  const path = candidateReturnPath(value);
  if (!path.startsWith("/apply/")) return "/candidate";
  const requested = path.slice("/apply/".length);
  let drive = await prisma.drive.findUnique({ where: { id: requested }, select: { id: true } });
  if (!drive) {
    const legacy = await prisma.drive.findMany({ where: { publicLink: path }, take: 2, select: { id: true } });
    if (legacy.length === 1) drive = legacy[0];
  }
  if (!drive) return "/candidate";
  const existing = await prisma.application.findFirst({ where: { candidateId: user.id, driveId: drive.id }, select: { id: true } });
  return existing ? "/candidate" : `/candidate/apply/${drive.id}`;
}
