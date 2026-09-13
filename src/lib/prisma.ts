import { PrismaClient } from "@prisma/client";

/**
 * Standard Next.js + Prisma singleton pattern: in dev, Next's hot-reload
 * would otherwise create a new PrismaClient (and a new connection pool)
 * on every file save. Stashing it on `globalThis` survives the reload.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
