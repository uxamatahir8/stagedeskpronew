// Writes src/i18n/client-namespaces.json: per layout, the message namespaces
// browser code can use. Run after adding client components or messages:
//   pnpm --filter @stagedesk/web i18n:client
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { scanClientNamespaces } from "../src/i18n/client-namespaces-scan";

const src = fileURLToPath(new URL("../src", import.meta.url));
const en = JSON.parse(fs.readFileSync(fileURLToPath(new URL("../messages/en.json", import.meta.url)), "utf8")) as Record<string, unknown>;
const groups = scanClientNamespaces(src, Object.keys(en));
fs.writeFileSync(fileURLToPath(new URL("../src/i18n/client-namespaces.json", import.meta.url)), `${JSON.stringify(groups, null, 2)}\n`);
for (const [group, list] of Object.entries(groups)) console.log(`${group}: ${list.length} namespaces`);
