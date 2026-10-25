"use server";

import { unsubscribeNewsletter } from "@stagedesk/db";

/** The button on the unsubscribe page; the token is the permission. */
export async function unsubscribeAction(token: string) {
  await unsubscribeNewsletter(token);
}
