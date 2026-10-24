import { randomUUID } from "node:crypto";
import { isSafeHref } from "@stagedesk/core";
import { prisma } from "./client";
import type { PrismaClient } from "./generated/prisma/client";

/**
 * The website footer: columns of links managed by the platform admin. Pages
 * from the page builder placed in `footer_<columnId>` are added to a column
 * after its own links.
 */
export class FooterError extends Error {
  constructor(readonly code: "invalid" | "not_found") {
    super(`Footer: ${code}`);
    this.name = "FooterError";
  }
}

export async function footerColumns() {
  return prisma.footerColumn.findMany({ orderBy: [{ position: "asc" }, { titleNl: "asc" }], include: { links: { orderBy: [{ position: "asc" }] } } });
}

const clean = (s: string, max: number) => s.trim().slice(0, max);

export async function saveFooterColumn(id: string | null, input: { titleNl: string; titleEn: string }) {
  const data = { titleNl: clean(input.titleNl, 80), titleEn: clean(input.titleEn, 80) };
  if (!data.titleNl || !data.titleEn) throw new FooterError("invalid");
  if (id) return prisma.footerColumn.update({ where: { id }, data });
  const last = await prisma.footerColumn.findFirst({ orderBy: { position: "desc" }, select: { position: true } });
  // Short ids, because pages refer to a column as footer_<id>.
  return prisma.footerColumn.create({ data: { id: `c${randomUUID().slice(0, 8)}`, position: (last?.position ?? -1) + 1, ...data } });
}

/** Removes a column with its links; pages that were placed in it are no longer linked. */
export async function deleteFooterColumn(id: string) {
  await prisma.$transaction([
    prisma.page.updateMany({ where: { placement: `footer_${id}` }, data: { placement: "none" } }),
    prisma.footerColumn.deleteMany({ where: { id } }),
  ]);
}

export interface FooterLinkInput {
  columnId: string;
  kind: "route" | "url";
  target: string;
  labelNl: string;
  labelEn: string;
  newTab: boolean;
}

export async function saveFooterLink(id: string | null, input: FooterLinkInput) {
  const target = input.target.trim();
  const ok = input.kind === "route" ? /^\/(?!\/)[a-z0-9\-/]*$/.test(target) : isSafeHref(target) && !target.startsWith("/");
  const data = { columnId: input.columnId, kind: input.kind, target: target.slice(0, 500), labelNl: clean(input.labelNl, 120), labelEn: clean(input.labelEn, 120), newTab: input.newTab };
  if (!ok || !data.labelNl || !data.labelEn) throw new FooterError("invalid");
  if (!(await prisma.footerColumn.findUnique({ where: { id: input.columnId }, select: { id: true } }))) throw new FooterError("not_found");
  if (id) return prisma.footerLink.update({ where: { id }, data });
  const last = await prisma.footerLink.findFirst({ where: { columnId: input.columnId }, orderBy: { position: "desc" }, select: { position: true } });
  return prisma.footerLink.create({ data: { id: randomUUID(), position: (last?.position ?? -1) + 1, ...data } });
}

export async function deleteFooterLink(id: string) {
  await prisma.footerLink.deleteMany({ where: { id } });
}

/** Moves a column or a link one place up or down. */
export async function moveFooterItem(kind: "column" | "link", id: string, direction: -1 | 1) {
  if (kind === "column") {
    const list = await prisma.footerColumn.findMany({ orderBy: [{ position: "asc" }, { titleNl: "asc" }], select: { id: true } });
    const from = list.findIndex((c) => c.id === id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= list.length) return;
    [list[from], list[to]] = [list[to]!, list[from]!];
    await prisma.$transaction(list.map((c, position) => prisma.footerColumn.update({ where: { id: c.id }, data: { position } })));
    return;
  }
  const link = await prisma.footerLink.findUnique({ where: { id }, select: { columnId: true } });
  if (!link) return;
  const list = await prisma.footerLink.findMany({ where: { columnId: link.columnId }, orderBy: { position: "asc" }, select: { id: true } });
  const from = list.findIndex((l) => l.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= list.length) return;
  [list[from], list[to]] = [list[to]!, list[from]!];
  await prisma.$transaction(list.map((l, position) => prisma.footerLink.update({ where: { id: l.id }, data: { position } })));
}

/** The footer the site launched with; only added when there are no columns yet. */
export async function seedFooter(db: PrismaClient) {
  if ((await db.footerColumn.count()) > 0) return;
  const columns: { id: string; nl: string; en: string; links: [string, string, string][] }[] = [
    {
      id: "product",
      nl: "Product",
      en: "Product",
      links: [
        ["/features", "Functies", "Features"],
        ["/tour", "Producttour", "Product tour"],
        ["/features/booking-page", "Boekingspagina en formulier", "Booking page and form"],
        ["/features/quotes-invoices", "Offertes en facturen", "Quotes and invoices"],
        ["/features/payments-payouts", "Betalingen en uitbetalingen", "Payments and payouts"],
        ["/features/artist-management", "Artiestenbeheer", "Artist management"],
        ["/pricing", "Prijzen", "Pricing"],
        ["/changelog", "Wat is er nieuw", "What's new"],
      ],
    },
    {
      id: "solutions",
      nl: "Voor wie",
      en: "Who it's for",
      links: [
        ["/for-agencies", "Voor bureaus", "For agencies"],
        ["/for-artists", "Voor artiesten", "For artists"],
        ["/solutions/weddings-events", "Bruiloften en evenementen", "Weddings and events"],
        ["/solutions/band-agencies", "Band- en livebureaus", "Band and live music agencies"],
        ["/request", "Offerte aanvragen", "Request a quote"],
      ],
    },
    {
      id: "company",
      nl: "Bedrijf",
      en: "Company",
      links: [
        ["/about", "Over ons", "About"],
        ["/blog", "Blog", "Blog"],
        ["/help", "Helpcentrum", "Help centre"],
        ["/partners", "Partnerprogramma", "Partner program"],
        ["/contact", "Contact", "Contact"],
      ],
    },
    { id: "legal", nl: "Juridisch", en: "Legal", links: [] },
  ];
  for (const [position, c] of columns.entries()) {
    await db.footerColumn.create({
      data: {
        id: c.id,
        titleNl: c.nl,
        titleEn: c.en,
        position,
        links: { create: c.links.map(([target, labelNl, labelEn], i) => ({ id: randomUUID(), kind: "route", target, labelNl, labelEn, position: i })) },
      },
    });
  }
  console.log("  footer   starter columns added");
}
