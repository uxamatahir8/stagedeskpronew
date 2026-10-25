"use client";

import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useRouter } from "@/i18n/navigation";
import { createAgencyAction } from "./actions";

/** New agency for an owner: their account is created if needed and the trial starts. */
export function CreateAgencyDialog() {
  const t = useTranslations("agencyAdmin");
  const tl = useTranslations("languages");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: "", city: "", ownerName: "", ownerEmail: "", locale: "en" as "nl" | "en", sendEmail: true });
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const r = await createAgencyAction(v);
      if (!r.ok) return void toast.error(r.message);
      toast.success(r.message);
      setOpen(false);
      router.push(`/app/agencies/${r.id}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon />
          {t("new")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("new")}</DialogTitle>
          <DialogDescription>{t("newHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField required id="na-name" label={t("agencyName")} className="sm:col-span-2">
            <Input required id="na-name" value={v.name} maxLength={191} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </FormField>
          <FormField id="na-city" label={t("city")}>
            <Input id="na-city" value={v.city} maxLength={96} onChange={(e) => setV({ ...v, city: e.target.value })} />
          </FormField>
          <FormField id="na-locale" label={t("language")}>
            <Select value={v.locale} onValueChange={(l) => setV({ ...v, locale: l as "nl" | "en" })}>
              <SelectTrigger id="na-locale" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nl">{tl("nl")}</SelectItem>
                <SelectItem value="en">{tl("en")}</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField required id="na-owner" label={t("ownerName")}>
            <Input required id="na-owner" value={v.ownerName} maxLength={191} autoComplete="off" onChange={(e) => setV({ ...v, ownerName: e.target.value })} />
          </FormField>
          <FormField required id="na-email" label={t("ownerEmail")} hint={t("ownerEmailHint")}>
            <Input required id="na-email" type="email" value={v.ownerEmail} autoComplete="off" onChange={(e) => setV({ ...v, ownerEmail: e.target.value })} />
          </FormField>
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <label htmlFor="na-send" className="text-sm">
              {t("sendWelcome")}
            </label>
            <Switch id="na-send" checked={v.sendEmail} onCheckedChange={(c) => setV({ ...v, sendEmail: c })} />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("cancel")}</Button>
          </DialogClose>
          <Button disabled={pending} onClick={submit}>
            {t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
