/**
 * What the admin sees for a failed event or operation: one readable line, never a stack or a
 * query dump (the whole error is in the server log).
 */
export function shortError(error: unknown): string {
  const e = error as { code?: string; name?: string; message?: string; meta?: { constraint?: unknown; field_name?: unknown } };
  if (typeof e?.code === "string" && /^P\d{4}$/.test(e.code)) {
    const detail = e.code === "P2003" ? "foreign key constraint" : e.code === "P2002" ? "duplicate record" : e.code === "P2025" ? "record not found" : "query failed";
    return `Database error ${e.code}: ${detail}`;
  }
  const message = (e?.message ?? String(error)).split("\n").map((l) => l.trim()).find(Boolean) ?? "Unknown error";
  return `${e?.name && e.name !== "Error" ? `${e.name}: ` : ""}${message}`.slice(0, 300);
}
