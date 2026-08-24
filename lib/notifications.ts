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
  return db.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      message: input.message.trim().slice(0, 1000),
      relatedAppId: input.relatedAppId || null,
    },
  });
}
