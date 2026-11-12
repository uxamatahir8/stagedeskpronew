#!/usr/bin/env node
// Release check: validates an env file against the production rules before deploying.
// Usage: node scripts/check-env.mjs path/to/.env [web|worker]   (exit 1 on errors)
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const [file = ".env", role = "web"] = process.argv.slice(2);
const env = parseEnv(readFileSync(file, "utf8"));
// config.ts uses only erasable TypeScript, which Node 22.18+ runs directly.
const { checkProductionConfig } = await import("../packages/core/src/config.ts");
const { errors, warnings } = checkProductionConfig(env, role);
for (const w of warnings) console.warn(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
console.log(errors.length ? `${errors.length} error(s)` : "Configuration OK");
process.exit(errors.length ? 1 : 0);
