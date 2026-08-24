import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// SQLite has no Json type, so JSON fields are stored as String.
export const j = (v: unknown): string => JSON.stringify(v ?? null);
export const uj = <T = any>(s: string | null | undefined): T => {
  if (s === null || s === undefined) return null as unknown as T;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null as unknown as T;
  }
};

import type { Funnel, FunnelStage } from "@/lib/engine/funnel";

// Load a funnel as the engine's `Funnel` shape (parsed stages JSON).
export async function getFunnel(funnelId: string): Promise<Funnel | null> {
  const f = await prisma.funnel.findUnique({ where: { id: funnelId } });
  if (!f) return null;
  return {
    id: f.id,
    driveId: f.driveId,
    version: f.version,
    published: f.published,
    stages: (uj<FunnelStage[]>(f.stages) || []).map((s) => ({ ...s, enabled: s.enabled !== false })),
  };
}
