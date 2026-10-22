import "server-only";
import { cookies } from "next/headers";
import { isRole, type Role } from "@stagedesk/core";

export const PREVIEW_ROLE_COOKIE = "sd_preview_role";

/**
 * Until accounts exist (phase 2), the dashboard is previewed as a role chosen
 * in the top bar. Phase 2 replaces this with the signed-in user's membership.
 */
export async function getPreviewRole(): Promise<Role> {
  const value = (await cookies()).get(PREVIEW_ROLE_COOKIE)?.value;
  return isRole(value) ? value : "agency_owner";
}
