"use client";

import { emailOTPClient, inferAdditionalFields, organizationClient, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "./auth";
import { ac, organizationRoles } from "./auth-roles";

export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields<typeof auth>(),
    organizationClient({ ac, roles: organizationRoles }),
    emailOTPClient(),
    twoFactorClient({
      onTwoFactorRedirect() {
        const prefix = window.location.pathname.startsWith("/en") ? "/en" : "";
        window.location.href = `${prefix}/two-factor`;
      },
    }),
  ],
});
