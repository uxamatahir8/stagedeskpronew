"use client";

import { useTransition } from "react";
import { switchOrganization } from "@/app/[locale]/app/actions";
import { useRouter } from "@/i18n/navigation";

/** Opens a page at another agency the person belongs to, making that agency active first. */
export function SwitchAgencyLink({ organizationId, href, children }: { organizationId: string; href: string; children: React.ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="text-left underline-offset-4 hover:underline disabled:opacity-60"
      onClick={() =>
        start(async () => {
          await switchOrganization(organizationId);
          router.push(href);
          router.refresh();
        })
      }
    >
      {children}
    </button>
  );
}
