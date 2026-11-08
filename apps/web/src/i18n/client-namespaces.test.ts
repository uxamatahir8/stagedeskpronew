import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import committed from "./client-namespaces.json";
import { scanClientNamespaces } from "./client-namespaces-scan";

describe("messages sent to the browser", () => {
  it("client-namespaces.json is current (run pnpm --filter @stagedesk/web i18n:client)", () => {
    const src = fileURLToPath(new URL("..", import.meta.url));
    expect(committed).toEqual(scanClientNamespaces(src, Object.keys(en)));
  });

  it("only lists namespaces that exist", () => {
    for (const list of Object.values(committed)) for (const ns of list) expect(Object.keys(en)).toContain(ns);
  });

  it("sends each layout far less than every message", () => {
    const all = Buffer.byteLength(JSON.stringify(en));
    const pick = (list: string[]) => Buffer.byteLength(JSON.stringify(Object.fromEntries(list.map((k) => [k, (en as Record<string, unknown>)[k]]))));
    expect(pick(committed.marketing)).toBeLessThan(all * 0.6);
    expect(pick(committed.root)).toBeLessThan(all * 0.2);
    expect(fs.existsSync(fileURLToPath(new URL("./client-messages.ts", import.meta.url)))).toBe(true);
  });
});
