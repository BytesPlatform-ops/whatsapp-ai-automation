import { PrismaClient } from '@prisma/client';

/**
 * Prisma client singleton — Pixie Lab app data over Supabase Postgres. Reused
 * across hot-reloads in dev (avoids exhausting the connection pool). Import ONLY
 * in server code (route handlers / server actions); never in client components.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'] });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
