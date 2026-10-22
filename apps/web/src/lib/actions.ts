import "server-only";
import { getTranslations } from "next-intl/server";
import { BookingError } from "@stagedesk/db";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

/**
 * Runs a server-side operation and turns booking-rule errors into a
 * translated message; anything else is logged and reported generically.
 */
export async function runAction(task: () => Promise<string | void>, success?: string): Promise<ActionResult> {
  try {
    const message = await task();
    return { ok: true, message: message ?? success };
  } catch (error) {
    // Next uses thrown errors for redirect() and notFound(); let those through.
    if (error instanceof Error && "digest" in error) throw error;
    if (error instanceof BookingError) {
      const t = await getTranslations("bookingErrors");
      return { ok: false, message: t(error.code) };
    }
    console.error("[action]", error);
    const t = await getTranslations("auth");
    return { ok: false, message: t("generic") };
  }
}
