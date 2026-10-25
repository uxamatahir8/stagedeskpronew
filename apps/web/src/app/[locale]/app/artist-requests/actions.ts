"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { deskRoles, type EventType, parseEuros } from "@stagedesk/core";
import {
  answerArtistRequest,
  type ArtistRequestAnswer,
  ArtistRequestError,
  audit,
  createArtistRequest,
  lendableArtists,
  notify,
  prisma,
} from "@stagedesk/db";
import type { ActionResult } from "@/lib/actions";
import { featureBlocked, writeBlocked } from "@/lib/billing";
import { absoluteUrl, deliver, userLocale } from "@/lib/mail";
import { clientIp } from "@/lib/rate-limit";
import { requireAgency } from "@/lib/viewer";

async function errorMessage(error: unknown) {
  if (error instanceof ArtistRequestError) return (await getTranslations("artistRequests"))(`error_${error.code}`);
  throw error;
}

/** Tells the other agency's desk, in app and by email, what happened to a request. */
async function tellOtherAgency(requestId: string, toOrganizationId: string, status: "new" | "counter" | "accepted" | "declined" | "withdrawn", fromName: string) {
  const r = await prisma.artistRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { artist: { select: { stageName: true } }, booking: { select: { eventType: true } } },
  });
  const staff = await prisma.member.findMany({ where: { organizationId: toOrganizationId, role: { in: [...deskRoles] } }, include: { user: { select: { email: true, locale: true } } } });
  for (const m of staff) {
    const locale = userLocale(m.user.locale);
    const te = await getTranslations({ locale, namespace: "eventTypes" });
    deliver({
      kind: "artistRequest",
      to: m.user.email,
      params: {
        locale,
        status,
        other: fromName,
        artist: r.artist.stageName,
        event: te(r.booking.eventType as EventType).toLowerCase(),
        fee: new Intl.NumberFormat(locale === "en" ? "en-GB" : "nl-NL", { style: "currency", currency: r.currency }).format(r.feeCents / 100),
        url: absoluteUrl(locale, "/app/artist-requests"),
      },
    });
  }
  await notify(
    staff.map((m) => m.userId),
    { type: status === "new" || status === "counter" ? "artist_request" : "artist_request_answer", data: { name: fromName, artist: r.artist.stageName, status }, url: "/app/artist-requests" },
  );
}

function done() {
  revalidatePath("/[locale]/app/artist-requests", "page");
  revalidatePath("/[locale]/app/bookings/[code]", "page");
}

/** Artists other agencies lend out, free on the booking's date. */
export async function searchLendableArtistsAction(bookingId: string, q: string) {
  const { organization } = await requireAgency("agency.bookings.edit");
  const artists = await lendableArtists(organization.id, bookingId, q.slice(0, 80));
  return artists.map((a) => ({ id: a.id, stageName: a.stageName, genres: a.genres, photoUrl: a.photoUrl, agency: a.organization.name, city: a.organization.city, priceFromCents: a.priceFromCents }));
}

export async function createArtistRequestAction(input: { bookingId: string; artistId: string; fee: string; message: string }): Promise<ActionResult> {
  const { viewer, organization } = await requireAgency("agency.bookings.edit");
  const blocked = (await writeBlocked(organization.id)) ?? (await featureBlocked(organization.id, "artistSharing"));
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("artistRequests");
  const feeCents = parseEuros(input.fee);
  if (feeCents === null || feeCents <= 0) return { ok: false, message: t("error_invalid_fee") };
  try {
    const request = await createArtistRequest(organization.id, { bookingId: input.bookingId, artistId: input.artistId, feeCents, message: input.message.trim() || null }, viewer.user.id);
    await tellOtherAgency(request.id, request.lenderId, "new", organization.name);
    await audit({ actorId: viewer.user.id, action: "artist_request.create", agencyId: organization.id, targetType: "artist_request", targetId: request.id, data: { feeCents }, ip: clientIp(await headers()) });
  } catch (error) {
    return { ok: false, message: await errorMessage(error) };
  }
  done();
  return { ok: true, message: t("sent") };
}

/** Accept, decline or counter the other agency's offer, or withdraw your own. */
export async function answerArtistRequestAction(requestId: string, action: "accept" | "decline" | "counter" | "withdraw", fee?: string, message?: string): Promise<ActionResult> {
  const { viewer, organization } = await requireAgency("agency.bookings.edit");
  const blocked = await writeBlocked(organization.id);
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("artistRequests");
  let answer: ArtistRequestAnswer;
  if (action === "counter") {
    const feeCents = parseEuros(fee ?? "");
    if (feeCents === null || feeCents <= 0) return { ok: false, message: t("error_invalid_fee") };
    answer = { action, feeCents, message: message?.trim() || null };
  } else {
    answer = { action };
  }
  try {
    const { request, notifyOrganizationId } = await answerArtistRequest(requestId, organization.id, answer, viewer.user.id);
    const status = action === "counter" ? "counter" : action === "accept" ? "accepted" : action === "decline" ? "declined" : "withdrawn";
    await tellOtherAgency(request.id, notifyOrganizationId, status, organization.name);
    await audit({ actorId: viewer.user.id, action: `artist_request.${action}`, agencyId: organization.id, targetType: "artist_request", targetId: request.id, data: { feeCents: request.feeCents }, ip: clientIp(await headers()) });
  } catch (error) {
    return { ok: false, message: await errorMessage(error) };
  }
  done();
  return { ok: true, message: t(`done_${action}`) };
}

/** Whether other agencies may ask to book this artist. */
export async function setLendableAction(artistId: string, lendable: boolean): Promise<ActionResult> {
  const { db } = await requireAgency("agency.artists.manage");
  const t = await getTranslations("artistRequests");
  const done = await db.artist.updateMany({ where: { id: artistId }, data: { lendable } });
  if (done.count === 0) return { ok: false, message: t("error_not_found") };
  revalidatePath("/[locale]/app/artists/[id]", "page");
  return { ok: true, message: t(lendable ? "lendableOn" : "lendableOff") };
}
