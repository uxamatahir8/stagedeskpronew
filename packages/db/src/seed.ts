import { existsSync } from "node:fs";

const rootEnv = new URL("../../../.env", import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const { settingKeys, settingsRegistry } = await import("@stagedesk/core");
const { prisma } = await import("./client");

// Insert defaults only where a setting doesn't exist yet, so re-running the
// seed never overwrites values the admin has changed.
for (const key of settingKeys) {
  const { defaults } = settingsRegistry[key];
  const existing = await prisma.platformSetting.findUnique({ where: { key } });
  if (existing) {
    console.log(`  kept     ${key}`);
    continue;
  }
  await prisma.platformSetting.create({ data: { key, value: defaults } });
  console.log(`  created  ${key}`);
}

// Demo accounts for every role, never in production.
if (process.env["NODE_ENV"] !== "production") {
  const { seedDemo, DEMO_PASSWORD } = await import("./seed-demo");
  await seedDemo(prisma);
  console.log(`\n  Demo accounts use the password: ${DEMO_PASSWORD}`);
}

await prisma.$disconnect();
