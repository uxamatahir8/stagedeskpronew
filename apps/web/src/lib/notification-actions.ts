"use server";

import { clearReadNotifications, markNotificationsRead } from "@stagedesk/db";
import { requireViewer } from "@/lib/viewer";

/** Marks the signed-in user's own notifications read (one, several, or all). */
export async function markReadAction(ids: string[] | "all") {
  const viewer = await requireViewer();
  await markNotificationsRead(viewer.user.id, ids === "all" ? "all" : ids.filter((id) => typeof id === "string").slice(0, 100));
}

/** Deletes the signed-in user's read notifications; returns how many. */
export async function clearReadAction() {
  const viewer = await requireViewer();
  return clearReadNotifications(viewer.user.id);
}
