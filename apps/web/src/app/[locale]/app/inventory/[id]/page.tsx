import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { type BookingStatus, outstandingOf } from "@stagedesk/core";
import { itemDetail, listCategories } from "@stagedesk/db";
import { ContentsEditor, ItemActions } from "@/components/inventory/item-actions";
import { ItemFormDialog } from "@/components/inventory/item-form-dialog";
import { EquipmentStatusPill } from "@/components/inventory/labels";
import { PageHeader } from "@/components/page-header";
import { BookingStatusBadge, Pill } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getFormatter } from "@/lib/formatter";
import { requireAgency, viewerCan } from "@/lib/viewer";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/inventory/[id]">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "inventory" });
  return { title: t("itemTitle") };
}

export default function ItemPage({ params }: PageProps<"/[locale]/app/inventory/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Item params={params} />
    </Suspense>
  );
}

async function Item({ params }: Pick<PageProps<"/[locale]/app/inventory/[id]">, "params">) {
  await connection();
  const { locale, id } = await params;
  setRequestLocale(locale as Locale);
  const { viewer, organization, db } = await requireAgency("agency.inventory");
  const detail = await itemDetail(organization.id, id.slice(0, 64));
  if (!detail) notFound();
  const { item, events, lines, packages } = detail;
  const [t, format, categories] = await Promise.all([getTranslations("inventory"), getFormatter(), listCategories(organization.id)]);
  const canManage = viewerCan(viewer, "agency.inventory.manage");
  const [containers, candidates] = await Promise.all([
    db.equipmentItem.findMany({ where: { kind: { in: ["case", "set"] }, status: { not: "retired" } }, select: { id: true, code: true, name: true, kind: true }, orderBy: { code: "asc" } }),
    item.kind !== "item" && canManage
      ? db.equipmentItem.findMany({ where: { kind: "item", tracking: "unit", containerId: null, status: { not: "retired" } }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } })
      : Promise.resolve([]),
  ]);
  const out = lines.reduce((sum, l) => sum + Math.max(0, outstandingOf(l)), 0);
  const day = (d: Date | null) => (d ? format.dateTime(d, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—");
  const when = (d: Date) => format.dateTime(d, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const eventText = (e: (typeof events)[number]) => {
    const data = (e.data ?? {}) as Record<string, unknown>;
    const key = `event_${e.type}` as "event_created";
    const values = {
      quantity: Number(data["quantity"] ?? 1),
      from: String(data["from"] ?? ""),
      to: String(data["to"] ?? ""),
      fields: Array.isArray(data["fields"]) ? (data["fields"] as string[]).join(", ") : "",
    };
    return t.has(key) ? t(key, values) : e.type;
  };

  const facts: [string, React.ReactNode][] = [
    [t("kind"), t(`kind_${item.kind as "item"}`)],
    ...(item.kind === "item" ? ([[t("tracking"), t(`tracking_${item.tracking as "unit"}`)]] as [string, string][]) : []),
    ...(item.tracking === "bulk" ? ([[t("stock"), t("stockOf", { quantity: item.quantity, defective: item.defectiveQty })]] as [string, string][]) : []),
    [t("category"), item.category?.name ?? "—"],
    ...(item.container ? ([[t("container"), <Link key="c" href={`/app/inventory/${item.container.id}`} className="underline-offset-4 hover:underline">{`${item.container.code} · ${item.container.name}`}</Link>]] as [string, React.ReactNode][]) : []),
    [t("manufacturer"), item.manufacturer ?? "—"],
    [t("model"), item.model ?? "—"],
    ...(item.tracking === "unit" && item.kind !== "set" ? ([[t("serialNumber"), item.serialNumber ?? "—"]] as [string, string][]) : []),
    [t("powerWatts"), item.powerWatts !== null ? `${item.powerWatts} W` : "—"],
    [t("batteryPowered"), item.batteryPowered ? t("yes") : t("no")],
    [t("condition"), t(`condition_${item.condition as "good"}`)],
    [t("sharing"), item.excludeFromSharing ? t("private") : t("shareable")],
  ];

  return (
    <div className="grid max-w-5xl gap-6">
      <Link href="/app/inventory" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" />
        {t("back")}
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono">{item.code}</span>
            <span>{item.name}</span>
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            {item.kind !== "set" && <EquipmentStatusPill status={item.status} />}
            {out > 0 && <Pill tone="brand">{t("outCount", { count: out })}</Pill>}
          </span>
        }
        actions={
          canManage && (
            <ItemFormDialog
              categories={categories}
              containers={containers}
              item={{
                id: item.id,
                code: item.code,
                name: item.name,
                kind: item.kind as "item",
                tracking: item.tracking as "unit",
                quantity: item.quantity,
                condition: item.condition,
                categoryId: item.categoryId,
                containerId: item.containerId,
                manufacturer: item.manufacturer,
                model: item.model,
                serialNumber: item.serialNumber,
                powerWatts: item.powerWatts,
                batteryPowered: item.batteryPowered,
                specs: item.specs,
                notes: item.notes,
                excludeFromSharing: item.excludeFromSharing,
                locked: lines.length > 0 || item.contents.length > 0,
              }}
            />
          )
        }
      />
      <ItemActions
        id={item.id}
        code={item.code}
        kind={item.kind}
        tracking={item.tracking}
        status={item.status}
        quantity={item.quantity}
        defectiveQty={item.defectiveQty}
        out={out}
        hasHistory={lines.length > 0}
        canManage={canManage}
        canAdmin={viewerCan(viewer, "agency.inventory.admin")}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("details")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                {facts.map(([label, value]) => (
                  <div key={label} className="grid gap-0.5">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              {item.specs.length > 0 && (
                <div className="grid gap-2 border-t pt-4">
                  <p className="text-sm font-medium">{t("specs")}</p>
                  <dl className="grid gap-1 text-sm sm:grid-cols-2">
                    {item.specs.map((s, i) => (
                      <div key={i} className="flex gap-2">
                        <dt className="text-muted-foreground">{s.label}:</dt>
                        <dd>{s.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
              {item.notes && (
                <div className="grid gap-1 border-t pt-4 text-sm">
                  <p className="font-medium">{t("notes")}</p>
                  <p className="whitespace-pre-line text-muted-foreground">{item.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {item.kind !== "item" && (
            <Card>
              <CardHeader>
                <CardTitle>{item.kind === "case" ? t("caseContents") : t("setMembers")}</CardTitle>
              </CardHeader>
              <CardContent>
                {canManage ? (
                  <ContentsEditor containerId={item.id} contents={item.contents} candidates={candidates} />
                ) : (
                  <ul className="grid gap-1 text-sm">
                    {item.contents.map((c) => (
                      <li key={c.id}>
                        <span className="font-mono">{c.code}</span> · {c.name}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t("allocations")}</CardTitle>
            </CardHeader>
            <CardContent>
              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noAllocations")}</p>
              ) : (
                <ul className="divide-y text-sm">
                  {lines.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div className="grid gap-0.5">
                        <Link href={`/app/bookings/${l.booking.trackingCode}/equipment`} className="font-medium underline-offset-4 hover:underline">
                          {l.booking.trackingCode}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {day(l.booking.eventDate)}
                          {l.booking.venueCity ? ` · ${l.booking.venueCity}` : ""}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {t("allocationCounts", { planned: l.quantity, loaded: l.loadedQty, returned: l.returnedQty, damaged: l.damagedQty, lost: l.lostQty })}
                        </span>
                        {outstandingOf(l) > 0 && <Pill tone={l.booking.equipmentCheckedInAt ? "danger" : "brand"}>{l.booking.equipmentCheckedInAt ? t("missingCount", { count: outstandingOf(l) }) : t("outCount", { count: outstandingOf(l) })}</Pill>}
                        {!l.reservedAt && ["booked", "confirmed"].includes(l.booking.status) && <Pill tone="warning">{t("unreserved")}</Pill>}
                        <BookingStatusBadge status={l.booking.status as BookingStatus} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-6">
          {packages.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t("inPackages")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-1 text-sm">
                {packages.map((p) => (
                  <Link key={p.id} href={`/app/inventory/packages/${p.id}`} className="underline-offset-4 hover:underline">
                    {p.name}
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>{t("history")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="grid gap-3 border-l pl-4 text-sm">
                {events.map((e) => {
                  const data = (e.data ?? {}) as Record<string, unknown>;
                  return (
                    <li key={e.id} className="relative">
                      <span className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-primary" aria-hidden />
                      <p>
                        {eventText(e)}
                        {e.bookingCode && (
                          <>
                            {" · "}
                            <Link href={`/app/bookings/${e.bookingCode}/equipment`} className="underline-offset-4 hover:underline">
                              {e.bookingCode}
                            </Link>
                          </>
                        )}
                      </p>
                      {typeof data["note"] === "string" && <p className="text-muted-foreground">“{data["note"]}”</p>}
                      <p className="text-xs text-muted-foreground">
                        {when(e.createdAt)}
                        {e.actor && ` · ${e.actor}`}
                      </p>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
