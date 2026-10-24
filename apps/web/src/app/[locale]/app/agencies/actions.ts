"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import {
  AgencyAdminError,
  audit,
  createAgencyForOwner,
  createBooking,
  prisma,
  resolveBookingCustomer,
  deleteAgency,
  extendTrial,
  grantPlan,
  setAgencySuspended,
  updateAgencyDetails,
} from "@stagedesk/db";
import { applyStripeSubscription, getStripe } from "@stagedesk/payments";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { ActionResult } from "@/lib/actions";
import { announceNewBooking } from "@/lib/announce";
import { newBookingSchema, translateErrors } from "@/lib/booking-form";
import { absoluteUrl, deliver, userLocale } from "@/lib/mail";
import { clientIp } from "@/lib/rate-limit";
import type { FormState } from "@/lib/validation";
import { requirePermission } from "@/lib/viewer";

const text = (max: number) => z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().max(max).nullable());

async function errorMessage(error: unknown) {
  const t = await getTranslations("agencyAdmin");
  if (error instanceof AgencyAdminError) return t(`error_${error.code}`);
  throw error;
}

function done(id?: string) {
  revalidatePath("/[locale]/app/agencies", "page");
  revalidatePath("/[locale]/app/admin-bookings", "page");
  if (id) revalidatePath("/[locale]/app/agencies/[id]", "page");
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(191),
  city: text(96),
  ownerName: z.string().trim().min(2).max(191),
  ownerEmail: z.email().max(191),
  locale: z.enum(["nl", "en"]),
  sendEmail: z.boolean(),
});

export type CreateAgencyResult = { ok: true; id: string; message: string } | { ok: false; message: string };

/** Sets up an agency for an owner (new or existing account) and starts the trial. */
export async function createAgencyAction(input: z.input<typeof createSchema>): Promise<CreateAgencyResult> {
  const viewer = await requirePermission("platform.agencies");
  const t = await getTranslations("agencyAdmin");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("invalid") };
  const d = parsed.data;
  try {
    const result = await createAgencyForOwner({ name: d.name, city: d.city, ownerName: d.ownerName, ownerEmail: d.ownerEmail, locale: d.locale });
    if (d.sendEmail) {
      deliver({
        kind: "agencyCreated",
        to: result.email,
        params: { locale: d.locale, name: d.ownerName.split(/\s+/)[0] ?? d.ownerName, agency: result.organization.name, url: absoluteUrl(d.locale, "/sign-in") },
      });
    }
    await audit({ actorId: viewer.user.id, action: "agency.create", agencyId: result.organization.id, data: { owner: result.email, newUser: result.newUser }, ip: clientIp(await headers()) });
    done();
    return { ok: true, id: result.organization.id, message: t("created", { name: result.organization.name }) };
  } catch (error) {
    return { ok: false, message: await errorMessage(error) };
  }
}

const detailsSchema = z.object({
  name: z.string().trim().min(2).max(191),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(96),
  city: text(96),
  contactEmail: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.email().max(191).nullable()),
  phone: text(32),
  website: text(191),
  kvkNumber: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.replace(/\s/g, "") : null), z.string().regex(/^\d{8}$/).nullable()),
  adminNotes: text(5000),
});

export async function updateAgencyAction(organizationId: string, input: z.input<typeof detailsSchema>): Promise<ActionResult> {
  const viewer = await requirePermission("platform.agencies");
  const t = await getTranslations("agencyAdmin");
  const parsed = detailsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("invalidDetails") };
  try {
    await updateAgencyDetails(organizationId, parsed.data);
  } catch (error) {
    return { ok: false, message: await errorMessage(error) };
  }
  await audit({ actorId: viewer.user.id, action: "agency.update", agencyId: organizationId });
  done(organizationId);
  return { ok: true, message: t("saved") };
}

export async function suspendAgencyAction(organizationId: string, suspend: boolean, reason: string): Promise<ActionResult> {
  const viewer = await requirePermission("platform.agencies");
  const t = await getTranslations("agencyAdmin");
  await setAgencySuspended(organizationId, suspend, reason.trim() || null);
  await audit({ actorId: viewer.user.id, action: suspend ? "agency.suspend" : "agency.reactivate", agencyId: organizationId, data: suspend ? { reason } : null, ip: clientIp(await headers()) });
  done(organizationId);
  return { ok: true, message: t(suspend ? "suspended" : "reactivated") };
}

export async function extendTrialAction(organizationId: string, days: number): Promise<ActionResult> {
  const viewer = await requirePermission("platform.agencies");
  const t = await getTranslations("agencyAdmin");
  if (!Number.isInteger(days) || days < 1 || days > 365) return { ok: false, message: t("invalidDays") };
  try {
    const sub = await extendTrial(organizationId, days);
    // A Stripe subscription keeps its own trial end; move it too, or Stripe charges
    // on the old date and its next webhook undoes the extension.
    const stripe = sub.stripeSubscriptionId && sub.trialEndsAt ? await getStripe() : null;
    if (stripe && sub.stripeSubscriptionId && sub.trialEndsAt) {
      await applyStripeSubscription(
        await stripe.subscriptions.update(sub.stripeSubscriptionId, { trial_end: Math.floor(sub.trialEndsAt.getTime() / 1000), proration_behavior: "none" }),
      );
    }
  } catch (error) {
    return { ok: false, message: await errorMessage(error) };
  }
  await audit({ actorId: viewer.user.id, action: "agency.extend_trial", agencyId: organizationId, data: { days } });
  done(organizationId);
  return { ok: true, message: t("trialExtended", { days }) };
}

export async function grantPlanAction(organizationId: string, planKey: string): Promise<ActionResult> {
  const viewer = await requirePermission("platform.agencies");
  const t = await getTranslations("agencyAdmin");
  try {
    await grantPlan(organizationId, planKey);
  } catch (error) {
    return { ok: false, message: await errorMessage(error) };
  }
  await audit({ actorId: viewer.user.id, action: "agency.grant_plan", agencyId: organizationId, data: { plan: planKey } });
  done(organizationId);
  return { ok: true, message: t("planGranted") };
}

export type DeleteAgencyResult = { ok: true } | { ok: false; message: string };

/** Only for agencies without bookings or payments; the confirmation must repeat the agency's name. */
export async function deleteAgencyAction(organizationId: string, confirmName: string, expectedName: string): Promise<DeleteAgencyResult> {
  const viewer = await requirePermission("platform.agencies");
  const t = await getTranslations("agencyAdmin");
  if (confirmName.trim() !== expectedName.trim()) return { ok: false, message: t("confirmMismatch") };
  try {
    await deleteAgency(organizationId);
  } catch (error) {
    return { ok: false, message: await errorMessage(error) };
  }
  await audit({ actorId: viewer.user.id, action: "agency.delete", agencyId: null, targetType: "agency", targetId: organizationId, data: { name: expectedName }, ip: clientIp(await headers()) });
  done();
  return { ok: true };
}

/**
 * A platform admin books for an agency (a phone-in, a partner deal). The
 * booking is the agency's own: its team is told and takes it from there.
 * Bound to the agency id where the form is rendered.
 */
export async function createBookingForAgencyAction(organizationId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const viewer = await requirePermission("platform.agencies");
  const [t, tb] = await Promise.all([getTranslations("agencyAdmin"), getTranslations("newBooking")]);
  const agency = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true, suspendedAt: true } });
  if (!agency) return { message: t("error_not_found") };
  if (agency.suspendedAt) return { message: t("bookingSuspended") };
  const parsed = newBookingSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: await translateErrors(parsed.error) };
  const d = parsed.data;

  const customerId = await resolveBookingCustomer(
    agency.id,
    d.customerMode === "existing" ? { mode: "existing", id: d.customerId } : { mode: "new", name: d.customerName, email: d.customerEmail, phone: d.customerPhone },
  );
  if (!customerId) return { message: tb("customerRequired") };
  const booking = await createBooking(
    agency.id,
    {
      customerId,
      eventType: d.eventType,
      eventDate: d.eventDate,
      startTime: d.startTime,
      endTime: d.endTime,
      venueName: d.venueName,
      venueAddress: d.venueAddress,
      venueCity: d.venueCity,
      guestCount: d.guestCount,
      budgetCents: d.budget,
      partnerName: d.partnerName,
      message: d.message,
      source: "platform_admin",
    },
    viewer.user.id,
  );
  const customer = await prisma.user.findUniqueOrThrow({ where: { id: customerId }, select: { name: true, email: true, locale: true } });
  await announceNewBooking(agency.id, booking, customer.name);
  if (form.get("notifyCustomer") === "on") {
    const locale = userLocale(customer.locale);
    deliver({
      kind: "inquiryReceived",
      to: customer.email,
      params: {
        locale,
        name: customer.name.split(/\s+/)[0] ?? customer.name,
        agency: agency.name,
        code: booking.trackingCode,
        url: absoluteUrl(locale, `/sign-in?next=${encodeURIComponent("/app/event")}`),
      },
    });
  }
  await audit({ actorId: viewer.user.id, action: "booking.create_for_agency", agencyId: agency.id, targetType: "booking", targetId: booking.id, data: { code: booking.trackingCode }, ip: clientIp(await headers()) });
  done(agency.id);
  // Back to the bookings overview, which confirms the booking and offers to open it.
  redirect({ href: `/app/admin-bookings?created=${booking.trackingCode}`, locale: (await getLocale()) as Locale });
  return {};
}
