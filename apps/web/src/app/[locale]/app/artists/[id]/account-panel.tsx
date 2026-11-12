"use client";

import { MailIcon, UserPlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ArtistAccountState } from "@stagedesk/db";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/actions";
import { inviteArtistAccountAction, linkArtistAccountAction, resendArtistSetupAction } from "../actions";

/** Why this artist can't be reached, and how to fix it: an invitation for a missing login, a new setup link. */
export function ArtistAccountPanel({ artistId, state, canManage, accounts }: { artistId: string; state: ArtistAccountState; canManage: boolean; accounts: { id: string; label: string }[] }) {
  const t = useTranslations("artistAccount");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [accountId, setAccountId] = useState("");
  const replaceable = state === "no_account" || state === "not_member" || state === "disabled";
  const [pending, start] = useTransition();
  const run = (task: () => Promise<ActionResult>) =>
    start(async () => {
      const result = await task();
      if (result.ok) {
        if (result.message) toast.success(result.message);
        router.refresh();
      } else if (result.message) toast.error(result.message);
    });

  return (
    <Card className="border-warning/60" data-testid="artist-account-panel">
      <CardHeader>
        <CardTitle>{t(`state_${state}`)}</CardTitle>
        <CardDescription>{t(`explain_${state}`)}</CardDescription>
      </CardHeader>
      {canManage && (replaceable || state === "setup_pending") && (
        <CardContent className="grid gap-4">
          {replaceable ? (
            <>
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => inviteArtistAccountAction({ artistId, email }));
              }}
            >
              <FormField id="artist-invite-email" label={t("emailLabel")} className="min-w-64 flex-1">
                <Input id="artist-invite-email" type="email" required value={email} maxLength={191} onChange={(e) => setEmail(e.target.value)} />
              </FormField>
              <Button type="submit" disabled={pending || !email.trim()}>
                <UserPlusIcon />
                {t("invite")}
              </Button>
            </form>
            {accounts.length > 0 && (
              <div className="flex flex-wrap items-end gap-2">
                <FormField id="artist-link-account" label={t("linkLabel")} className="min-w-64 flex-1">
                  <NativeSelect id="artist-link-account" className="w-full" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                    <option value="">{t("linkChoose")}</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
                <Button type="button" variant="outline" disabled={pending || !accountId} onClick={() => run(() => linkArtistAccountAction({ artistId, userId: accountId }))}>
                  {t("link")}
                </Button>
              </div>
            )}
            </>
          ) : (
            <Button variant="outline" disabled={pending} onClick={() => run(() => resendArtistSetupAction(artistId))}>
              <MailIcon />
              {t("resendSetup")}
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}
