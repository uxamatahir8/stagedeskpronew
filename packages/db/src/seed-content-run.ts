import { existsSync } from "node:fs";

// Adds the starter website content only: pnpm db:seed-content.
const rootEnv = new URL("../../../.env", import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const { prisma } = await import("./client");
const { seedContent } = await import("./seed-content");
await seedContent(prisma);
await prisma.$disconnect();
