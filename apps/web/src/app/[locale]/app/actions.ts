"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/** Makes another of the user's agencies active. Better Auth checks the membership. */
export async function switchOrganization(organizationId: string) {
  await auth.api.setActiveOrganization({ headers: await headers(), body: { organizationId } });
}
