"use client";

import { MoreHorizontalIcon, UserPlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { addSubscriberAction, deleteSubscriberAction, unsubscribeSubscriberAction } from "./actions";
import { NativeSelect } from "@/components/ui/native-select";

export function AddSubscriberDialog() {
  const t = useTranslations("newsletter");
  const tl = useTranslations("languages");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlusIcon />
          {t("addSubscriber")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addSubscriber")}</DialogTitle>
          <DialogDescription>{t("addSubscriberHint")}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            start(async () => {
              const r = await addSubscriberAction({ email: String(f.get("email")), name: String(f.get("name") ?? ""), locale: f.get("locale") === "en" ? "en" : "nl" });
              if (!r.ok) return void toast.error(r.message);
              toast.success(r.message);
              setOpen(false);
              router.refresh();
            });
          }}
        >
          <FormField id="ns-email" label={t("subscriberEmail")}>
            <Input id="ns-email" name="email" type="email" required maxLength={191} />
          </FormField>
          <FormField id="ns-name" label={t("subscriberName")}>
            <Input id="ns-name" name="name" maxLength={191} />
          </FormField>
          <FormField id="ns-locale" label={t("language")}>
            <NativeSelect id="ns-locale" name="locale" required defaultValue="nl" className="h-9 rounded-md border bg-background px-2.5 text-sm">
              <option value="nl">{tl("nl")}</option>
              <option value="en">{tl("en")}</option>
            </NativeSelect>
          </FormField>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {t("addSubscriber")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SubscriberMenu({ id, email, subscribed }: { id: string; email: string; subscribed: boolean }) {
  const t = useTranslations("newsletter");
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (action: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const r = await action();
      if (r.message) (r.ok ? toast.success : toast.error)(r.message);
      router.refresh();
    });
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" disabled={pending} aria-label={email}>
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {subscribed && <DropdownMenuItem onSelect={() => run(() => unsubscribeSubscriberAction(id))}>{t("unsubscribeAction")}</DropdownMenuItem>}
        <DropdownMenuItem variant="destructive" onSelect={() => run(() => deleteSubscriberAction(id))}>
          {t("deleteAction")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
