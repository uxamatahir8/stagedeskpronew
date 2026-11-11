"use server";

import { platformArtistsOrganization } from "@stagedesk/db";
import { requirePermission } from "@/lib/viewer";

/**
 * Where a platform booking (one StageDesk takes itself, for its managed
 * artists) is made: StageDesk's own business, set up the first time.
 */
export async function platformBookingOrganizationAction(): Promise<string> {
  await requirePermission("platform.agencies");
  return (await platformArtistsOrganization()).id;
}
