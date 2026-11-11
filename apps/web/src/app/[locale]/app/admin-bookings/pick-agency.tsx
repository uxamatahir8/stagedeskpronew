"use client";

import { CalendarPlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";
import { platformBookingOrganizationAction } from "./actions";

const PLATFORM = "platform";

/**
 * "New booking" for the platform admin: first choose whose booking it is. A
 * platform booking (StageDesk's own, for its managed artists), an agency's,
 * or an independent artist's.
 */
export function NewBookingPicker({ agencies }: { agencies: { id: string; name: string; city: string | null; kind: string }[] }) {
  const t = useTranslations("adminBookings");
  const router = useRouter();
  const [target, setTarget] = useState("");
  const [pending, start] = useTransition();
  const label = (a: { name: string; city: string | null }) => `${a.name}${a.city ? ` · ${a.city}` : ""}`;
  const groups = [
    { key: "agencies", items: agencies.filter((a) => a.kind === "agency") },
    { key: "independents", items: agencies.filter((a) => a.kind === "solo") },
  ] as const;
  const go = () =>
    start(async () => {
      const id = target === PLATFORM ? await platformBookingOrganizationAction() : target;
      router.push(`/app/agencies/${id}/new-booking`);
    });

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
        <FormField id="pb-agency" label={t("bookingFor")}>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger id="pb-agency" className="w-full">
              <SelectValue placeholder={t("chooseAgency")} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>{t("group_platform")}</SelectLabel>
                <SelectItem value={PLATFORM}>{t("platformBooking")}</SelectItem>
              </SelectGroup>
              {groups.map(
                (g) =>
                  g.items.length > 0 && (
                    <SelectGroup key={g.key}>
                      <SelectLabel>{t(`group_${g.key}`)}</SelectLabel>
                      {g.items.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {label(a)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ),
              )}
            </SelectContent>
          </Select>
        </FormField>
        {target === PLATFORM && <p className="text-sm text-muted-foreground">{t("platformBookingHint")}</p>}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("cancel")}</Button>
          </DialogClose>
          <Button disabled={!target || pending} onClick={go}>
            {t("continue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
