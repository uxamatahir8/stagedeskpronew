// Node-only (reads the source tree). Used by scripts/client-namespaces.ts to
// write client-namespaces.json and by its test to check that file is current.
import fs from "node:fs";
import path from "node:path";

/**
 * Each layout that gives the browser messages, and the source it covers. The
 * browser only gets the top-level message namespaces code there can use:
 * shipping all of them made every page about 1 MB.
 */
export const messageGroups = {
  /** The locale layout's own client parts (providers, toasts, upload guard) and its not-found/error pages. */
  root: { dir: "app/[locale]", onlyFilesInDir: true },
  auth: { dir: "app/[locale]/(auth)", onlyFilesInDir: false },
  marketing: { dir: "app/[locale]/(marketing)", onlyFilesInDir: false },
  public: { dir: "app/[locale]/(public)", onlyFilesInDir: false },
  app: { dir: "app/[locale]/app", onlyFilesInDir: false },
  sites: { dir: "app/sites", onlyFilesInDir: false },
} as const;
export type MessageGroup = keyof typeof messageGroups;

const isClientFile = (s: string) => /^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(s);
const isServerActionFile = (s: string) => /^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*["']use server["']/.test(s);

function listFiles(dir: string, recursive: boolean): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) out.push(...listFiles(p, true));
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

/**
 * Follows imports from every file of a group. A file runs in the browser when
 * it says "use client" or a browser file imports it; server actions ("use
 * server") and server-only modules never do. From browser files every string
 * literal that starts with a namespace counts (t("ns.key"), keys kept in
 * config, useTranslations("ns")); from server files only namespaces handed to
 * components as props (namespace="ns"), in case one is a client component.
 * Over-counting is harmless; missing one shows as a MISSING_MESSAGE error.
 */
export function scanClientNamespaces(srcDir: string, namespaces: readonly string[]): Record<MessageGroup, string[]> {
  const known = new Set(namespaces);
  const cache = new Map<string, string>();
  const read = (f: string) => {
    if (!cache.has(f)) cache.set(f, fs.readFileSync(f, "utf8"));
    return cache.get(f)!;
  };
  const resolve = (from: string, spec: string): string | null => {
    const base = spec.startsWith("@/") ? path.join(srcDir, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
    if (!base) return null;
    for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
      if (/\.tsx?$/.test(c) && fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    }
    return null;
  };
  const importsOf = (f: string) =>
    [...read(f).matchAll(/(?:import|export)\s[^"';]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)]
      .map((m) => resolve(f, (m[1] ?? m[2])!))
      .filter((r): r is string => r !== null);
  const literal = /["'`]([A-Za-z][\w-]*)(?=\.|["'`]|\$\{)/g;
  const propLiteral = /=\s*\{?\s*["'`]([A-Za-z][\w-]*)(?=\.|["'`]|\$\{)/g;

  const result = {} as Record<MessageGroup, string[]>;
  for (const [group, { dir, onlyFilesInDir }] of Object.entries(messageGroups) as [MessageGroup, (typeof messageGroups)[MessageGroup]][]) {
    const used = new Set<string>();
    const seen = new Map<string, boolean>(); // file → visited as browser code
    const queue: [string, boolean][] = listFiles(path.join(srcDir, dir), !onlyFilesInDir).map((f) => [f, false]);
    while (queue.length) {
      const [file, fromClient] = queue.pop()!;
      const source = read(file);
      if (isServerActionFile(source) || /import\s+["']server-only["']/.test(source) && fromClient) continue;
      const client = fromClient || isClientFile(source);
      const before = seen.get(file);
      if (before === true || (before === false && !client)) continue;
      seen.set(file, client);
      for (const m of source.matchAll(client ? literal : propLiteral)) if (known.has(m[1]!)) used.add(m[1]!);
      for (const next of importsOf(file)) queue.push([next, client]);
    }
    result[group] = [...used].sort();
  }
  return result;
}
