import "server-only";
import { type MessageFormatElement, parse, TYPE } from "@formatjs/icu-messageformat-parser";
import { cacheLife, cacheTag } from "next/cache";
import { siteTextOverrides } from "@stagedesk/db";

/**
 * Texts the platform admin changed, merged over the translation files. Saving
 * calls updateTag(TEXTS_TAG), so the next request has the new text.
 */
export const TEXTS_TAG = "site-texts";

type Messages = { [key: string]: string | Messages };

export async function textOverrides(locale: "nl" | "en") {
  "use cache";
  cacheTag(TEXTS_TAG);
  cacheLife("days");
  return siteTextOverrides(locale);
}

/** A copy of the messages with each "a.b.c" override put in place; unknown keys are skipped. */
export function mergeTexts(messages: Messages, overrides: Record<string, string>): Messages {
  if (Object.keys(overrides).length === 0) return messages;
  const out: Messages = structuredClone(messages);
  for (const [key, value] of Object.entries(overrides)) {
    const path = key.split(".");
    let node: Messages = out;
    for (const part of path.slice(0, -1)) {
      const next = node[part];
      if (!next || typeof next === "string") {
        node = {};
        break;
      }
      node = next;
    }
    const last = path.at(-1)!;
    if (typeof node[last] === "string") node[last] = value;
  }
  return out;
}

/** Every text as "namespace.key" → text. */
export function flatten(messages: Messages, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(messages)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else Object.assign(out, flatten(v, key));
  }
  return out;
}

/** Placeholder and tag names used in a message, like {count} or <b>. */
function names(elements: MessageFormatElement[], into = new Set<string>()) {
  for (const el of elements) {
    if (el.type === TYPE.argument || el.type === TYPE.number || el.type === TYPE.date || el.type === TYPE.time) into.add(`{${el.value}}`);
    if (el.type === TYPE.plural || el.type === TYPE.select) {
      into.add(`{${el.value}}`);
      for (const option of Object.values(el.options)) names(option.value, into);
    }
    if (el.type === TYPE.tag) {
      into.add(`<${el.value}>`);
      names(el.children, into);
    }
  }
  return into;
}

/**
 * Checks a changed text against the original: it must be a valid message and
 * may only use placeholders and tags the original has, or the page would fail
 * to render it. Returns the names that aren't allowed, or "syntax".
 */
export function checkText(original: string, value: string): { ok: true } | { ok: false; problem: "syntax" | "unknown"; names?: string[] } {
  let parsed: MessageFormatElement[];
  try {
    parsed = parse(value);
  } catch {
    return { ok: false, problem: "syntax" };
  }
  let allowed: Set<string>;
  try {
    allowed = names(parse(original));
  } catch {
    allowed = new Set();
  }
  const unknown = [...names(parsed)].filter((n) => !allowed.has(n));
  return unknown.length ? { ok: false, problem: "unknown", names: unknown } : { ok: true };
}

/** Placeholders and tags of the original, shown next to the field. */
export function placeholdersOf(original: string) {
  try {
    return [...names(parse(original))];
  } catch {
    return [];
  }
}
