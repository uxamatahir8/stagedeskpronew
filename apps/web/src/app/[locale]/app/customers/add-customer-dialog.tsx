"use client";

import { UserPlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { FormMessage } from "@/components/auth/auth-card";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import type { FormState } from "@/lib/validation";
import { addCustomer } from "./actions";

export function AddCustomerDialog() {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: FormState, form: FormData) => {
    const result = await addCustomer(prev, form);
    if (result.ok) {
      toast.success(result.message);
      setOpen(false);
      router.refresh();
    }
    return result;
  }, {} as FormState);
  const errors = state.fieldErrors ?? {};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlusIcon />
          {t("customers.add")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("customers.addTitle")}</DialogTitle>
          <DialogDescription>{t("customers.addBody")}</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <FormField id="customer-name" label={t("auth.name")} error={errors["name"]}>
            <Input id="customer-name" name="name" required maxLength={191} autoComplete="off" />
          </FormField>
          <FormField id="customer-email" label={t("auth.email")} error={errors["email"]}>
            <Input id="customer-email" name="email" type="email" required autoComplete="off" />
          </FormField>
          <FormField id="customer-phone" label={t("customers.phone")} error={errors["phone"]}>
            <Input id="customer-phone" name="phone" type="tel" maxLength={32} autoComplete="off" />
          </FormField>
          {!state.ok && <FormMessage>{state.message}</FormMessage>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("ui.secondary")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {t("customers.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
