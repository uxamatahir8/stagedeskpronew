import "server-only";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { eventTypes, parseEuros } from "@stagedesk/core";
import { fieldErrorKeys, optionalText } from "@/lib/validation";

// Fields of the booking form, shared by the agency's and the platform admin's actions.

export const time = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "invalidTime").nullable(),
);
const wholeNumber = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : Number(v)),
  z.number().int("invalidNumber").min(0, "invalidNumber").max(100_000, "invalidNumber").nullable(),
);
const euros = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? parseEuros(v) : v),
  z.number({ error: "invalidPrice" }).int().min(0, "invalidPrice").nullable(),
);
const date = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalidDate").nullable(),
);
export const lines = z.preprocess(
  (v) => (typeof v === "string" ? v.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 30) : []),
  z.array(z.string().max(200)),
);

export const eventFields = {
  eventType: z.enum(eventTypes),
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

export const newBookingSchema = z.object({
  ...eventFields,
  customerMode: z.enum(["existing", "new"]),
  customerId: optionalText(64),
  customerName: optionalText(191),
  customerEmail: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.email("invalidEmail").max(191).nullable()),
  customerPhone: optionalText(32),
  message: optionalText(5000),
});

export async function translateErrors(error: z.ZodError) {
  const [tb, ts] = await Promise.all([getTranslations("newBooking"), getTranslations("agencySettings")]);
  const keys = fieldErrorKeys(error);
  return Object.fromEntries(
    Object.entries(keys).map(([field, key]) => [
      field,
      ["invalidTime", "invalidNumber", "invalidDate", "invalidPrice"].includes(key)
        ? tb(key as "invalidTime")
        : ts(key as "required"),
    ]),
  );
}
