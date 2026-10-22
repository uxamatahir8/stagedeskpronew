import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { createTranslator } from "next-intl";
import { createElement } from "react";
import { isRole, type VatGroup } from "@stagedesk/core";
import { prisma } from "@stagedesk/db";
import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";
import { auth } from "../auth";
import { getPublicFile } from "../storage";
import { BookingDocument, type PdfData } from "./booking-document";

export type { PdfLine } from "./booking-document";

const staffRoles = new Set(["agency_owner", "agency_admin", "agency_staff"]);

/** Agency staff of the booking's agency, or the booking's own customer. */
export async function canOpenBooking(request: Request, booking: { organizationId: string; customerId: string | null }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return false;
  if (session.user.id === booking.customerId) return true;
  const member = await prisma.member.findFirst({
    where: { userId: session.user.id, organizationId: booking.organizationId },
    select: { role: true },
  });
  return Boolean(member && isRole(member.role) && staffRoles.has(member.role));
}

export function pdfLocale(request: Request): "nl" | "en" {
  return new URL(request.url).searchParams.get("lang") === "en" ? "en" : "nl";
}

async function logoFor(url: string | null | undefined) {
  if (!url?.startsWith("/files/")) return null;
  try {
    const object = await getPublicFile(url.slice("/files/".length));
    const bytes = Buffer.from(await object.Body!.transformToByteArray());
    // react-pdf reads PNG and JPEG only.
    if (object.ContentType === "image/png") return { data: bytes, format: "png" as const };
    if (object.ContentType === "image/jpeg") return { data: bytes, format: "jpg" as const };
  } catch {
    // A missing logo shouldn't stop the document.
  }
  return null;
}

export async function renderBookingPdf(
  kind: "quote" | "invoice",
  locale: "nl" | "en",
  input: Omit<PdfData, "kind" | "locale" | "labels" | "agency"> & { agency: Omit<PdfData["agency"], "logo"> & { logo?: string | null } },
) {
  const t = createTranslator({ locale, messages: locale === "en" ? en : nl });
  const labels: PdfData["labels"] = {
    title: t(`pdf.${kind}`),
    number: t("pdf.number"),
    date: t("pdf.date"),
    dueDate: t("pdf.dueDate"),
    validUntil: t("pdf.validUntil"),
    reference: t("pdf.reference"),
    eventDate: t("pdf.eventDate"),
    to: t("pdf.to"),
    kvk: t("pdf.kvk"),
    vatNumber: t("pdf.vatNumber"),
    description: t("booking.description"),
    quantity: t("booking.quantity"),
    unitPrice: t("booking.unitPrice"),
    vat: t("booking.vat"),
    lineTotal: t("booking.lineTotal"),
    subtotal: t("booking.subtotal"),
    total: t("booking.total"),
    deposit: t("booking.depositDue"),
    alreadyPaid: t("pdf.alreadyPaid"),
    toPay: t("pdf.toPay"),
    footer: kind === "invoice" ? t("pdf.payWithin", { number: input.number }) : input.agency.name,
  };
  const data: PdfData = {
    ...input,
    kind,
    locale,
    labels,
    agency: { ...input.agency, logo: await logoFor(input.agency.logo) },
    vatGroups: input.vatGroups as VatGroup[],
  };
  return renderToBuffer(createElement(BookingDocument, { data }) as Parameters<typeof renderToBuffer>[0]);
}

export function pdfResponse(buffer: Buffer, filename: string) {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
