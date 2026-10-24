"use server";

import { markGuidesSeen } from "@stagedesk/db";
import { getViewer } from "./viewer";

/** Remembers the guide steps someone has seen, so each shows once. */
export async function markGuidesSeenAction(stepIds: string[]) {
  const viewer = await getViewer();
  if (!viewer || !Array.isArray(stepIds)) return;
  await markGuidesSeen(viewer.user.id, stepIds.filter((s) => typeof s === "string"));
}
