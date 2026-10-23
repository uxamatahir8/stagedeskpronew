"use client";

import { BanIcon, EllipsisIcon, MailCheckIcon, ShieldOffIcon, UserCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/actions";
import { markVerifiedAction, resetTwoFactorAction, setUserDisabledAction } from "./actions";

export function UserActions({ userId, name, disabled, verified, twoFactor, self }: { userId: string; name: string; disabled: boolean; verified: boolean; twoFactor: boolean; self: boolean }) {
  const t = useTranslations("users");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (task: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const r = await task();
      if (!r.ok) return void toast.error(r.message);
      toast.success(r.message);
      router.refresh();
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t("actions", { name })} disabled={pending}>
          <EllipsisIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!verified && (
          <DropdownMenuItem onSelect={() => run(() => markVerifiedAction(userId))}>
            <MailCheckIcon />
            {t("markVerified")}
          </DropdownMenuItem>
        )}
        {twoFactor && (
          <DropdownMenuItem onSelect={() => run(() => resetTwoFactorAction(userId))}>
            <ShieldOffIcon />
            {t("resetTwoFactor")}
          </DropdownMenuItem>
        )}
        {!self && (
          <>
            {(!verified || twoFactor) && <DropdownMenuSeparator />}
            {disabled ? (
              <DropdownMenuItem onSelect={() => run(() => setUserDisabledAction(userId, false))}>
                <UserCheckIcon />
                {t("enable")}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem variant="destructive" onSelect={() => run(() => setUserDisabledAction(userId, true))}>
                <BanIcon />
                {t("disable")}
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
