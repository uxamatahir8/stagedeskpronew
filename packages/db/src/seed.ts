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

// Starting plans (edited afterwards in the admin screens).
const { seedPlans } = await import("./seed-plans");
await seedPlans(prisma);

// Starter website pages (the legal pages), edited afterwards in the page builder.
const { seedPages } = await import("./seed-pages");
await seedPages(prisma);

// Demo accounts for every role, never in production.
if (process.env["NODE_ENV"] !== "production") {
  const { seedDemo, DEMO_PASSWORD } = await import("./seed-demo");
  await seedDemo(prisma);
  // Every demo agency starts on a trial, like a real sign-up.
  const { startTrial } = await import("./billing");
  for (const org of await prisma.organization.findMany({ select: { id: true } })) await startTrial(org.id);
  const { seedAffiliates } = await import("./seed-affiliates");
  await seedAffiliates(prisma);
  console.log(`\n  Demo accounts use the password: ${DEMO_PASSWORD}`);
}

await prisma.$disconnect();
