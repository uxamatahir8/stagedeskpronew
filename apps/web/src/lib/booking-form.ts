import "server-only";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { eventTypes, parseEuros, todayInNetherlands } from "@stagedesk/core";
import { fieldErrorKeys, isBlank, optionalEmail, optionalText } from "@/lib/validation";

// Fields of the booking form, shared by the agency's and the platform admin's actions.

export const time = z.preprocess(
  (v) => (isBlank(v) ? null : v),
  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "invalidTime").nullable(),
);
const wholeNumber = z.preprocess(
  (v) => (isBlank(v) ? null : Number(v)),
  z.number({ error: "invalidNumber" }).int("invalidNumber").min(0, "invalidNumber").max(100_000, "invalidNumber").nullable(),
);
const euros = z.preprocess(
  (v) => (isBlank(v) ? null : typeof v === "string" ? parseEuros(v) : v),
  z.number({ error: "invalidPrice" }).int().min(0, "invalidPrice").nullable(),
);
const date = z.preprocess(
  (v) => (isBlank(v) ? null : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalidDate").nullable(),
);
export const lines = z.preprocess(
  (v) => (typeof v === "string" ? v.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 30) : []),
  z.array(z.string().max(200)),
);

export const eventFields = {
  eventType: z.string().trim().min(1).max(64).transform((value) => value as (typeof eventTypes)[number]),
  eventDate: date,
  startTime: time,
  endTime: time,
  venueName: optionalText(191),
  venueAddress: optionalText(191),
  venueCity: optionalText(96),
  guestCount: wholeNumber,
  budget: euros,
  partnerName: optionalText(191),
};

/**
 * Only what the chosen options show counts: the new-customer fields when
 * "new customer" is picked, the partner's name for a wedding. Anything else
 * the browser still sends (a value typed before switching) is dropped rather
 * than checked, so a hidden field can never block the form.
 */
function onlyShownFields(v: unknown) {
  if (!v || typeof v !== "object") return v;
  const out: Record<string, unknown> = { ...(v as Record<string, unknown>) };
  if (out["customerMode"] !== "new") {
    delete out["customerName"];
    delete out["customerEmail"];
    delete out["customerPhone"];
  } else {
    delete out["customerId"];
  }
  if (out["eventType"] !== "wedding") delete out["partnerName"];
  return out;
}

export const newBookingSchema = z.preprocess(
  onlyShownFields,
  z
    .object({
      ...eventFields,
      customerMode: z.enum(["existing", "new"]),
      customerId: optionalText(64),
      customerName: optionalText(191),
      customerEmail: optionalEmail,
      customerPhone: optionalText(32),
      message: optionalText(5000),
    })
    .refine((d) => !d.eventDate || d.eventDate >= todayInNetherlands(), { path: ["eventDate"], message: "pastDate" }),
);

/** Field errors plus one line above the button, so a problem is never silent, whatever field it's on. */
export async function bookingFormErrors(error: z.ZodError) {
  const tb = await getTranslations("newBooking");
  return { fieldErrors: await translateErrors(error), message: tb("checkFields") };
}

export async function translateErrors(error: z.ZodError) {
  const [tb, ts] = await Promise.all([getTranslations("newBooking"), getTranslations("agencySettings")]);
  const keys = fieldErrorKeys(error);
  return Object.fromEntries(
    Object.entries(keys).map(([field, key]) => [
      field,
      ["invalidTime", "invalidNumber", "invalidDate", "invalidPrice", "pastDate"].includes(key)
        ? tb(key as "invalidTime")
        : ts.has(key as "required")
          ? ts(key as "required")
          : tb("invalidValue"),
    ]),
  );
}
