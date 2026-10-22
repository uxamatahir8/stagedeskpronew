import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "./generated/prisma/client";

function createClient() {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env at the repo root.");

  const { hostname, port, username, password, pathname } = new URL(url);
  const adapter = new PrismaMariaDb({
    host: hostname,
    port: Number(port || 3306),
    user: decodeURIComponent(username),
    password: decodeURIComponent(password),
    database: pathname.slice(1),
    connectionLimit: 10,
    // MySQL 8 uses caching_sha2_password; locally there is no TLS.
    allowPublicKeyRetrieval: true,
  });
  return new PrismaClient({ adapter });
}

// Reuse one client across Next.js hot reloads in development.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env["NODE_ENV"] !== "production") globalForPrisma.prisma = prisma;
