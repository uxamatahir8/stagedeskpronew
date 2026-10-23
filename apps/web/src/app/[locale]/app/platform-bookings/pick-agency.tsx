"use client";

import { CalendarPlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";

/** "New booking" for the platform admin: first choose the agency it's for. */
export function NewBookingPicker({ agencies }: { agencies: { id: string; name: string; city: string | null }[] }) {
  const t = useTranslations("platformBookings");
  const router = useRouter();
  const [agencyId, setAgencyId] = useState("");
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <CalendarPlusIcon />
          {t("new")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("new")}</DialogTitle>
          <DialogDescription>{t("newHint")}</DialogDescription>
        </DialogHeader>
        <FormField id="pb-agency" label={t("agency")}>
          <Select value={agencyId} onValueChange={setAgencyId}>
            <SelectTrigger id="pb-agency" className="w-full">
              <SelectValue placeholder={t("chooseAgency")} />
            </SelectTrigger>
            <SelectContent>
              {agencies.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                  {a.city ? ` · ${a.city}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("cancel")}</Button>
          </DialogClose>
          <Button disabled={!agencyId} onClick={() => router.push(`/app/agencies/${agencyId}/new-booking`)}>
            {t("continue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
