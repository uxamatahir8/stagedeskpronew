import { z } from "zod";

/** Empty form fields become null instead of "". */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? v.trim() : v), schema.nullable());

export const kvkNumber = optional(z.string().regex(/^\d{8}$/, "invalidKvk"));
export const vatNumber = optional(
  z
    .string()
    .transform((v) => v.replace(/[\s.]/g, "").toUpperCase())
    .pipe(z.string().regex(/^NL\d{9}B\d{2}$/, "invalidVat")),
);
export const postalCode = optional(
  z
    .string()
    .transform((v) => v.replace(/\s+/g, "").toUpperCase())
    .pipe(z.string().regex(/^\d{4}[A-Z]{2}$/, "invalidPostal"))
    .transform((v) => `${v.slice(0, 4)} ${v.slice(4)}`),
);
export const brandColor = optional(z.string().regex(/^#[0-9a-fA-F]{6}$/, "invalidColor"));
export const optionalEmail = optional(z.email("invalidEmail").max(191));
export const optionalUrl = optional(z.url({ protocol: /^https?$/, error: "invalidUrl" }).max(191));
export const optionalText = (max: number) => optional(z.string().max(max));
export const requiredText = (max: number) => z.string().trim().min(1, "required").max(max);

export type FieldErrors = Record<string, string>;

export interface FormState {
  ok?: boolean;
  message?: string;
  fieldErrors?: FieldErrors;
}

/** First error per field, as the message key set in the schema. */
export function fieldErrorKeys(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    out[field] ??= issue.message;
  }
  return out;
}

/** Lowercase, dash-separated slug for URLs like /b/feestband-utrecht. */
export function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " en ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
