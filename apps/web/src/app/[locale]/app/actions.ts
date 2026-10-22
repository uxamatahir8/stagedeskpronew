"use server";

import { cookies } from "next/headers";
import { isRole } from "@stagedesk/core";
import { PREVIEW_ROLE_COOKIE } from "@/lib/preview-role";

export async function setPreviewRole(role: string) {
  if (process.env.NODE_ENV === "production") throw new Error("Role preview is only available in development.");
  if (!isRole(role)) throw new Error(`Unknown role: ${role}`);
  (await cookies()).set(PREVIEW_ROLE_COOKIE, role, { path: "/", sameSite: "lax", httpOnly: true });
}
