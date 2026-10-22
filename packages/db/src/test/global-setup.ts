import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Points tests at <database>_test and applies all migrations to it. */
export default function setup() {
  const rootEnv = new URL("../../../../.env", import.meta.url);
  if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

  const base = process.env["TEST_DATABASE_URL"] ?? process.env["DATABASE_URL"];
  if (!base) throw new Error("DATABASE_URL is not set");
  const url = new URL(base);
  if (!url.pathname.endsWith("_test")) url.pathname = `${url.pathname}_test`;
  process.env["DATABASE_URL"] = url.toString();

  const cwd = fileURLToPath(new URL("../..", import.meta.url));
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd,
    env: process.env,
    stdio: "pipe",
    shell: process.platform === "win32",
  });
}
