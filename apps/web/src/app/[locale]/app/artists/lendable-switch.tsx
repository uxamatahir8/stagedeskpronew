"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { useRouter } from "@/i18n/navigation";
import { setLendableAction } from "../artist-requests/actions";

/** Lets other agencies ask to book this artist for their bookings, for a fee you agree on. */
export function LendableSwitch({ artistId, initial }: { artistId: string; initial: boolean }) {
  const t = useTranslations("artistRequests");
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
      <label htmlFor="artist-lendable" className="text-sm font-medium">
        {t("lendable")}
        <span className="block text-xs font-normal text-muted-foreground">{t("lendableHint")}</span>
      </label>
      <Switch
        id="artist-lendable"
        checked={on}
        disabled={pending}
        onCheckedChange={(next) =>
          start(async () => {
            const r = await setLendableAction(artistId, next);
            if (!r.ok) return void toast.error(r.message);
            setOn(next);
            toast.success(r.message);
            router.refresh();
          })
        }
      />
    </div>
  );
}
