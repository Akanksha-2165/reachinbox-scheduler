import { PrismaClient } from '@prisma/client';

/**
 * Global PrismaClient singleton.
 *
 * WHY:
 * In development mode with hot reloaders (like tsx watch), multiple PrismaClient
 * instances can exhaust MySQL connection limits. Caching it globally prevents connection leaks.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
