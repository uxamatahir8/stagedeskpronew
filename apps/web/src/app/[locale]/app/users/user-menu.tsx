"use client";

import { BanIcon, EllipsisIcon, LogInIcon, LogOutIcon, MailCheckIcon, MailIcon, PencilIcon, ShieldOffIcon, Trash2Icon, UserCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/actions";
import { startImpersonationAction } from "@/lib/impersonation-actions";
import {
  deleteUserAction,
  markVerifiedAction,
  resendConfirmationAction,
  resetTwoFactorAction,
  setUserDisabledAction,
  signOutEverywhereAction,
  updateUserAction,
} from "./actions";

/** Runs an action, reports the result and refreshes the list. `after` runs only on success. */
function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (task: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      const r = await task();
      if (!r.ok) return void toast.error(r.message);
      toast.success(r.message);
      after?.();
      router.refresh();
    });
  return { pending, run };
}

type UserValues = { id: string; name: string; email: string; phone: string };

export function UserActions({ user, disabled, verified, twoFactor, self }: { user: UserValues; disabled: boolean; verified: boolean; twoFactor: boolean; self: boolean }) {
  const t = useTranslations("users");
  const { pending, run } = useRun();
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t("actions", { name: user.name })} disabled={pending}>
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog("edit")}>
            <PencilIcon />
            {t("edit")}
          </DropdownMenuItem>
          {!verified && !disabled && (
            <DropdownMenuItem onSelect={() => run(() => resendConfirmationAction(user.id))}>
              <MailIcon />
              {t("resendConfirmation")}
            </DropdownMenuItem>
          )}
          {!verified && (
            <DropdownMenuItem onSelect={() => run(() => markVerifiedAction(user.id))}>
              <MailCheckIcon />
              {t("markVerified")}
            </DropdownMenuItem>
          )}
          {twoFactor && (
            <DropdownMenuItem onSelect={() => run(() => resetTwoFactorAction(user.id))}>
              <ShieldOffIcon />
              {t("resetTwoFactor")}
            </DropdownMenuItem>
          )}
          {!self && (
            <>
              <DropdownMenuItem onSelect={() => run(() => startImpersonationAction(user.id))}>
                <LogInIcon />
                {t("impersonate")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => run(() => signOutEverywhereAction(user.id))}>
                <LogOutIcon />
                {t("signOut")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {disabled ? (
                <DropdownMenuItem onSelect={() => run(() => setUserDisabledAction(user.id, false))}>
                  <UserCheckIcon />
                  {t("enable")}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem variant="destructive" onSelect={() => run(() => setUserDisabledAction(user.id, true))}>
                  <BanIcon />
                  {t("disable")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
                <Trash2Icon />
                {t("delete")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog === "edit" && <EditUserDialog user={user} onClose={() => setDialog(null)} />}
      <Dialog open={dialog === "delete"} onOpenChange={(o) => setDialog(o ? "delete" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle", { name: user.name })}</DialogTitle>
            <DialogDescription>{t("deleteHint")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t("cancel")}</Button>
            </DialogClose>
            <Button variant="destructive" disabled={pending} onClick={() => run(() => deleteUserAction(user.id), () => setDialog(null))}>
              <Trash2Icon />
              {t("deleteForever")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditUserDialog({ user, onClose }: { user: UserValues; onClose: () => void }) {
  const t = useTranslations("users");
  const { pending, run } = useRun();
  const [v, setV] = useState({ name: user.name, email: user.email, phone: user.phone });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editTitle")}</DialogTitle>
          <DialogDescription>{t("editHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FormField required id="eu-name" label={t("name")}>
            <Input required id="eu-name" value={v.name} maxLength={191} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </FormField>
          <FormField required id="eu-email" label={t("email")} hint={v.email.trim().toLowerCase() !== user.email ? t("emailChangeHint") : undefined}>
            <Input required id="eu-email" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
          </FormField>
          <FormField id="eu-phone" label={t("phone")}>
            <Input id="eu-phone" type="tel" value={v.phone} maxLength={32} onChange={(e) => setV({ ...v, phone: e.target.value })} />
          </FormField>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("cancel")}</Button>
          </DialogClose>
          <Button disabled={pending} onClick={() => run(() => updateUserAction(user.id, v), onClose)}>
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
