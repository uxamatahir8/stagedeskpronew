import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { requireEquipmentAccess } from "@/lib/equipment-access";
import { equipmentWorkspace } from "@/lib/equipment-view";
import { getFormatter } from "@/lib/formatter";
import { PrintButton } from "./print-button";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/bookings/[code]/equipment/print">): Promise<Metadata> {
  const { locale, code } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "equipment" });
  return { title: `${t("packingList")} · ${code.toUpperCase()}` };
}

export default function PrintPage({ params }: PageProps<"/[locale]/app/bookings/[code]/equipment/print">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Print params={params} />
    </Suspense>
  );
}

/** A printable packing list: grouped by case and category, with codes, quantities, power and tick boxes. */
async function Print({ params }: Pick<PageProps<"/[locale]/app/bookings/[code]/equipment/print">, "params">) {
  await connection();
  const { locale, code } = await params;
  setRequestLocale(locale as Locale);
  const access = await requireEquipmentAccess(code, "desk");
  const [t, ti, format] = await Promise.all([getTranslations("equipment"), getTranslations("inventory"), getFormatter()]);
  const data = await equipmentWorkspace(access, { kind: (k) => ti(`kind_${k as "case"}`), status: (s) => ti(`status_${s as "lost"}`) });
  if (!data) notFound();
  const { view, props } = data;
  const containers = new Map(props.containers.map((c) => [c.id, c]));
  const groups = new Map<string, { title: string; order: number; lines: typeof props.lines }>();
  for (const line of props.lines) {
    const container = line.viaContainerId ? containers.get(line.viaContainerId) : undefined;
    const key = container ? `c:${container.id}` : `k:${line.category ?? ""}`;
    if (!groups.has(key)) groups.set(key, { title: container ? `${container.code} · ${container.name}` : (line.category ?? t("otherEquipment")), order: container ? -1 : line.category ? line.categoryPosition : 1e6, lines: [] });
    groups.get(key)!.lines.push(line);
  }
  const sorted = [...groups.values()].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  const b = view.booking;
  const date = b.eventDate ? format.dateTime(b.eventDate, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : t("noDate");

  return (
    <div className="print-sheet mx-auto grid max-w-3xl gap-6 bg-background p-2 text-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold">{t("packingList")}</h1>
          <p>
            <span className="font-mono font-medium">{b.trackingCode}</span> · {date}
            {b.startTime ? ` · ${b.startTime}${b.endTime ? `–${b.endTime}` : ""}` : ""}
          </p>
          {(b.venueName || b.venueCity) && <p className="text-muted-foreground">{[b.venueName, b.venueCity].filter(Boolean).join(", ")}</p>}
        </div>
        <PrintButton label={t("print")} />
      </div>
      {sorted.map((g) => (
        <section key={g.title} className="break-inside-avoid">
          <h2 className="border-b pb-1 font-medium">{g.title}</h2>
          <table className="w-full">
            <tbody>
              {g.lines.map((l) => (
                <tr key={l.id} className="border-b border-dashed">
                  <td className="w-6 py-1.5 align-top">
                    <span className="inline-block size-4 rounded-sm border border-foreground" aria-hidden />
                  </td>
                  <td className="w-12 py-1.5 tabular-nums">{l.quantity}×</td>
                  <td className="w-32 py-1.5 font-mono">{l.code}</td>
                  <td className="py-1.5">{l.name}</td>
                  <td className="py-1.5 text-right text-muted-foreground tabular-nums">{l.powerWatts ? `${l.powerWatts * l.quantity} W` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <p className="flex justify-between border-t pt-2 font-medium">
        <span>{t("printTotals", { lines: props.lines.length, units: props.lines.reduce((s, l) => s + l.quantity, 0) })}</span>
        {props.power > 0 && <span>{t("powerTotal", { watts: props.power })}</span>}
      </p>
    </div>
  );
}
