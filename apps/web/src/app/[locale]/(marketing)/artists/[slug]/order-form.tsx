"use client";

import { PartyPopperIcon, ShoppingBagIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useEffect, useRef, useState, useTransition } from "react";
import { type EventType, eventTypes, timeInNetherlands } from "@stagedesk/core";
import { FormMessage } from "@/components/auth/auth-card";
import { FormField } from "@/components/form-field";
import { Turnstile } from "@/components/turnstile";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DatePicker } from "@/components/date-picker";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { orderGigAction } from "./actions";

/** Ordering a gig: the event details, then the artist's quote arrives by email to accept and pay. */
export function OrderGigButton({
  slug,
  listing,
  priceLabel,
  siteKey,
  today,
}: {
  slug: string;
  listing: { id: string; title: string; eventTypes: string[] | null };
  priceLabel: string;
  siteKey: string | null;
  today: string;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const allowed = (listing.eventTypes ?? [...eventTypes]) as EventType[];
  const [open, setOpen] = useState(false);
  const [eventType, setEventType] = useState<EventType>(allowed[0] ?? "party");
  const [eventDate, setEventDate] = useState("");
  const [result, setResult] = useState<{ code: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [captchaResetCount, setCaptchaResetCount] = useState(0);
  const [pending, start] = useTransition();
  const startedAt = useRef(0);
  useEffect(() => {
    if (open) startedAt.current = Date.now();
  }, [open]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set("eventType", eventType);
    form.set("startedAt", String(startedAt.current));
    setError(null);
    start(async () => {
      const r = await orderGigAction(slug, listing.id, form);
      if (r.ok) setResult({ code: r.code, name: r.name });
      else {
        setError(r.message);
        setCaptchaResetCount((count) => count + 1);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setResult(null);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <ShoppingBagIcon />
          {t("artistDirectory.order")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("artistDirectory.orderTitle", { title: listing.title })}</DialogTitle>
          <DialogDescription>{t("artistDirectory.orderHint", { price: priceLabel })}</DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="grid gap-3 py-4 text-center">
            <PartyPopperIcon className="mx-auto size-8 text-primary" aria-hidden />
            <p className="text-lg font-semibold">{t("bookingPage.sentTitle", { name: result.name })}</p>
            <p className="text-sm text-muted-foreground">{t("artistDirectory.orderSent", { code: result.code })}</p>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <FormField required id="og-type" label={t("bookingPage.eventType")}>
              <Select value={eventType} onValueChange={(v) => setEventType(v as EventType)}>
                <SelectTrigger id="og-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allowed.map((e) => (
                    <SelectItem key={e} value={e}>
                      {t(`eventTypes.${e}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField required id="og-date" label={t("bookingPage.date")}>
              <DatePicker id="og-date" name="eventDate" min={today} required value={eventDate} onChange={setEventDate} />
            </FormField>
            <FormField id="og-start" label={t("bookingPage.startTime")}>
              <DatePicker id="og-start" name="startTime" mode="time" min={eventDate === today ? timeInNetherlands() : undefined} />
            </FormField>
            <FormField id="og-guests" label={t("bookingPage.guests")}>
              <Input id="og-guests" name="guestCount" type="number" min={1} max={100000} inputMode="numeric" />
            </FormField>
            <FormField id="og-venue" label={t("bookingPage.venueName")}>
              <Input id="og-venue" name="venueName" maxLength={191} />
            </FormField>
            <FormField required id="og-city" label={t("bookingPage.venueCity")}>
              <Input id="og-city" name="venueCity" required maxLength={96} autoComplete="address-level2" />
            </FormField>
            <FormField required id="og-name" label={t("bookingPage.name")}>
              <Input id="og-name" name="name" required minLength={2} maxLength={191} autoComplete="name" />
            </FormField>
            <FormField required id="og-email" label={t("bookingPage.email")}>
              <Input id="og-email" name="email" type="email" required maxLength={191} autoComplete="email" />
            </FormField>
            <FormField id="og-phone" label={t("bookingPage.phone")}>
              <Input id="og-phone" name="phone" type="tel" maxLength={32} autoComplete="tel" />
            </FormField>
            <FormField id="og-message" label={t("bookingPage.message")} className="sm:col-span-2">
              <Textarea id="og-message" name="message" rows={3} maxLength={5000} />
            </FormField>
            <div aria-hidden className="absolute -left-[9999px] h-0 overflow-hidden">
              <label>
                Website
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            <div className="grid gap-3 sm:col-span-2">
              {siteKey && <Turnstile siteKey={siteKey} language={locale} resetCount={captchaResetCount} />}
              <FormMessage>{error}</FormMessage>
              <Button type="submit" disabled={pending} className="w-full sm:w-fit">
                <ShoppingBagIcon />
                {t("artistDirectory.orderSubmit")}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
