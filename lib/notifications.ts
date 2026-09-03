import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";

type NotificationInput = {
  userId: string;
  type: string;
  message: string;
  relatedAppId?: string | null;
};

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function createNotification(input: NotificationInput, db: DbClient = prisma) {
  const message = input.message.trim().slice(0, 1000);
  // Suppress rapid identical retries without deleting notification history.
  const recent = await db.notification.findFirst({ where: {
    userId: input.userId, type: input.type, relatedAppId: input.relatedAppId || null,
    message, createdAt: { gte: new Date(Date.now() - 60000) },
  }, orderBy: { createdAt: "desc" } });
  if (recent) return recent;
  return db.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      message,
      relatedAppId: input.relatedAppId || null,
    },
  });
}
