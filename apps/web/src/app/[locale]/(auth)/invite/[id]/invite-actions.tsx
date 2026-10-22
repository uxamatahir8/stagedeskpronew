"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormMessage } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { authErrorKey } from "@/lib/auth-errors";

export function InviteActions({ invitationId, organizationId }: { invitationId: string; organizationId: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);

  async function accept() {
    setPending(true);
    setError(null);
    const { error } = await authClient.organization.acceptInvitation({ invitationId });
    if (error) {
      setPending(false);
      return setError(t(authErrorKey(error)));
    }
    await authClient.organization.setActive({ organizationId });
    router.push("/app");
    router.refresh();
  }

  async function decline() {
    setPending(true);
    const { error } = await authClient.organization.rejectInvitation({ invitationId });
    setPending(false);
    if (error) return setError(t(authErrorKey(error)));
    setDeclined(true);
  }

  if (declined) return <FormMessage tone="success">{t("invite.declined")}</FormMessage>;

  return (
    <div className="grid gap-3">
      <FormMessage>{error}</FormMessage>
      <Button onClick={accept} disabled={pending}>
        {t("invite.accept")}
      </Button>
      <Button variant="ghost" onClick={decline} disabled={pending}>
        {t("invite.decline")}
      </Button>
    </div>
  );
}
