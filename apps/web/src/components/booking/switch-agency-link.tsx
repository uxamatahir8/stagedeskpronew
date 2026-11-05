"use client";

import { useLocale } from "next-intl";
import { useTransition } from "react";
import { switchOrganization } from "@/app/[locale]/app/actions";
import { localePath } from "@/lib/paths";

/**
 * Opens a page at another agency the person belongs to, making that agency
 * active first. A full page load: the whole shell belongs to the other agency,
 * and a client push followed by a refresh can lose the push.
 */
export function SwitchAgencyLink({ organizationId, href, children }: { organizationId: string; href: string; children: React.ReactNode }) {
  const locale = useLocale();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="text-left underline-offset-4 hover:underline disabled:opacity-60"
      onClick={() =>
        start(async () => {
          await switchOrganization(organizationId);
          window.location.assign(localePath(locale, href));
        })
      }
    >
      {children}
    </button>
  );
}
