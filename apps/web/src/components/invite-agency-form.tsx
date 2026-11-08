"use client";

import { SendIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { inviteAgencyAction, inviteAgencyAsArtistAction } from "@/lib/invite-actions";

/** One email field and a button: invite another agency to StageDesk, as an agency or as an artist. */
export function InviteAgencyForm({ as }: { as: "agency" | "artist" }) {
  const t = useTranslations("agencyInvite");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await (as === "agency" ? inviteAgencyAction : inviteAgencyAsArtistAction)(email);
          if (!r.ok) return void toast.error(r.message);
          toast.success(r.message);
          setEmail("");
          router.refresh();
        });
      }}
    >
      <label className="grid min-w-64 flex-1 gap-1.5 text-sm font-medium" htmlFor={`invite-${as}`}>
        {t("email")}
        <Input id={`invite-${as}`} type="email" required autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("emailPlaceholder")} />
      </label>
      <Button type="submit" disabled={pending || !email.trim()}>
        <SendIcon /> {pending ? t("sending") : t("send")}
      </Button>
    </form>
  );
}
