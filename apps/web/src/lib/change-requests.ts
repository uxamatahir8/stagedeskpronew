import "server-only";
import { getTranslations } from "next-intl/server";
import type { EventType, QuoteEventField } from "@stagedesk/core";
import type { getFormatter } from "./formatter";
import { eventDate } from "./format";

export interface ChangeRow {
  field: QuoteEventField;
  label: string;
  from: string;
  to: string;
}

/** A stored change request as lines people can read: which field, what it is now and what it would become. */
export async function changeRows(changes: unknown, baseline: unknown, format: Awaited<ReturnType<typeof getFormatter>>): Promise<ChangeRow[]> {
  const t = await getTranslations();
  const shown = (field: QuoteEventField, value: unknown) => {
    if (value === null || value === undefined || value === "") return "—";
    if (field === "eventType") return t(`eventTypes.${value as EventType}`);
    if (field === "eventDate") return eventDate(format, new Date(`${String(value)}T00:00:00Z`)) ?? String(value);
    return String(value);
  };
  const before = (baseline ?? {}) as Record<string, unknown>;
  return Object.entries((changes ?? {}) as Record<string, unknown>).map(([key, value]) => {
    const field = key as QuoteEventField;
    const label = t(`booking.field_${field}`);
    return { field, label: label.charAt(0).toUpperCase() + label.slice(1), from: shown(field, before[field]), to: shown(field, value) };
  });
}
