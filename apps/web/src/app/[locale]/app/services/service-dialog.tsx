"use client";

import { ArchiveIcon, PencilIcon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormatter } from "@/components/date-prefs";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { percent } from "@/lib/format";
import { archiveServiceAction, saveServiceAction } from "./actions";

type Unit = "hour" | "piece" | "flat";
interface Service {
  id: string;
  name: string;
  description: string;
  unit: Unit;
  price: string;
  vatBps: number;
}

export function ServiceDialog({ service, vatRates }: { service?: Service; vatRates: number[] }) {
  const t = useTranslations();
  const format = useFormatter();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unit, setUnit] = useState<Unit>(service?.unit ?? "hour");
  const [vatBps, setVatBps] = useState(service?.vatBps ?? vatRates[0] ?? 2_100);
  const [pending, startTransition] = useTransition();

  function save(form: FormData) {
    startTransition(async () => {
      const result = await saveServiceAction({
        id: service?.id ?? null,
        name: String(form.get("name")),
        description: String(form.get("description") ?? "") || null,
        unit,
        price: String(form.get("price")),
        vatBps,
      });
      if (!result.ok) return void toast.error(result.message);
      toast.success(result.message);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {service ? (
          <Button variant="ghost" size="icon-sm" aria-label={t("services.edit")}>
            <PencilIcon />
          </Button>
        ) : (
          <Button>
            <PlusIcon />
            {t("services.add")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{service ? t("services.edit") : t("services.add")}</DialogTitle>
        </DialogHeader>
        <form action={save} className="grid gap-4 sm:grid-cols-2">
          <FormField id="svc-name" label={t("services.name")} className="sm:col-span-2">
            <Input id="svc-name" name="name" defaultValue={service?.name} required maxLength={191} />
          </FormField>
          <FormField id="svc-desc" label={t("booking.description")} className="sm:col-span-2">
            <Textarea id="svc-desc" name="description" defaultValue={service?.description} rows={2} maxLength={2000} />
          </FormField>
          <FormField id="svc-price" label={t("services.price")}>
            <Input id="svc-price" name="price" defaultValue={service?.price} inputMode="decimal" required placeholder="0,00" />
          </FormField>
          <FormField required id="svc-unit" label={t("services.unit")}>
            <Select value={unit} onValueChange={(v) => setUnit(v as Unit)}>
              <SelectTrigger id="svc-unit" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["hour", "piece", "flat"] as const).map((u) => (
                  <SelectItem key={u} value={u}>
                    {t(`units.${u}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField required id="svc-vat" label={t("services.vat")}>
            <Select value={String(vatBps)} onValueChange={(v) => setVatBps(Number(v))}>
              <SelectTrigger id="svc-vat" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {vatRates.map((r) => (
                  <SelectItem key={r} value={String(r)}>
                    {percent(format, r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <DialogFooter className="sm:col-span-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("ui.secondary")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {t("artists.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ArchiveService({ id }: { id: string }) {
  const t = useTranslations("services");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={t("archive")}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await archiveServiceAction(id);
          toast.success(result.message);
          router.refresh();
        })
      }
    >
      <ArchiveIcon />
    </Button>
  );
}
