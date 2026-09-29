import { PrismaClient } from "@prisma/client";

let prisma: PrismaClient | undefined;

export function getDatabase(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    throw Object.assign(new Error("DATABASE_URL is not configured. Set it to a PostgreSQL connection string before connecting repositories."), { status: 503 });
  }
  prisma ??= new PrismaClient();
  return prisma;
}

export async function disconnectDatabase(): Promise<void> {
  if (prisma) await prisma.$disconnect();
}
