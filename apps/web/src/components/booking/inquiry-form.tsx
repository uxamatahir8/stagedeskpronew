"use client";

import { CalendarXIcon, PartyPopperIcon, SendIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { budgetRanges, eventTypes, type EventType } from "@stagedesk/core";
import { submitInquiryAction } from "@/app/[locale]/(public)/b/[slug]/actions";
import { FormMessage } from "@/components/auth/auth-card";
import { FormField } from "@/components/form-field";
import { Turnstile } from "@/components/turnstile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const NONE = "none";

export function InquiryForm({
  slug,
  artists,
  fullyBooked,
  siteKey,
  today,
}: {
  slug: string;
  artists: { id: string; stageName: string }[];
  fullyBooked: string[];
  siteKey: string | null;
  today: string;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [eventType, setEventType] = useState<EventType>("wedding");
  const [budget, setBudget] = useState(NONE);
  const [artist, setArtist] = useState(NONE);
  const [date, setDate] = useState("");
  const [result, setResult] = useState<{ code: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  // Set once the form is on screen; submissions faster than a human can type are treated as bots.
  const startedAt = useRef(0);
  useEffect(() => {
    startedAt.current = Date.now();
  }, [formKey]);
  const [pending, startTransition] = useTransition();

  if (result) {
    return (
      <div className="grid gap-4 rounded-xl border bg-card p-6 text-center">
        <PartyPopperIcon className="mx-auto size-8 text-primary" aria-hidden />
        <h3 className="text-xl font-semibold">{t("bookingPage.sentTitle", { name: result.name })}</h3>
        <p className="text-muted-foreground">{t("bookingPage.sentBody", { code: result.code })}</p>
        <Button
          variant="outline"
          className="mx-auto"
          onClick={() => {
            setResult(null);
            setFormKey((k) => k + 1);
          }}
        >
          {t("bookingPage.another")}
        </Button>
      </div>
    );
  }

  function submit(form: FormData) {
    form.set("eventType", eventType);
    form.set("budgetRange", budget === NONE ? "" : budget);
    form.set("preferredArtistId", artist === NONE ? "" : artist);
    form.set("startedAt", String(startedAt.current));
    setError(null);
    startTransition(async () => {
      const response = await submitInquiryAction(slug, form);
      if (response.ok) setResult({ code: response.code, name: response.name });
      else setError(response.message);
    });
  }

  const booked = date !== "" && fullyBooked.includes(date);

  return (
    <form key={formKey} action={submit} className="grid gap-6">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold">{t("bookingPage.eventDetails")}</legend>
        <FormField id="inq-type" label={t("bookingPage.eventType")}>
          <Select value={eventType} onValueChange={(v) => setEventType(v as EventType)}>
            <SelectTrigger id="inq-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {eventTypes.map((e) => (
                <SelectItem key={e} value={e}>
                  {t(`eventTypes.${e}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id="inq-date" label={t("bookingPage.date")}>
          <Input id="inq-date" name="eventDate" type="date" min={today} required value={date} onChange={(e) => setDate(e.target.value)} />
        </FormField>
        {booked && (
          <p className="flex items-start gap-2 rounded-lg bg-warning/18 p-3 text-sm sm:col-span-2" role="status">
            <CalendarXIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("bookingPage.fullyBooked")}
          </p>
        )}
        <FormField id="inq-start" label={t("bookingPage.startTime")}>
          <Input id="inq-start" name="startTime" type="time" />
        </FormField>
        <FormField id="inq-guests" label={t("bookingPage.guests")}>
          <Input id="inq-guests" name="guestCount" type="number" min={1} max={100000} inputMode="numeric" />
        </FormField>
        <FormField id="inq-venue" label={t("bookingPage.venueName")}>
          <Input id="inq-venue" name="venueName" maxLength={191} />
        </FormField>
        <FormField id="inq-city" label={t("bookingPage.venueCity")}>
          <Input id="inq-city" name="venueCity" required maxLength={96} autoComplete="address-level2" />
        </FormField>
        {eventType === "wedding" && (
          <>
            <FormField id="inq-partner" label={t("bookingPage.partnerName")}>
              <Input id="inq-partner" name="partnerName" maxLength={191} />
            </FormField>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" name="ceremony" className="size-4 accent-[var(--primary)]" />
              {t("bookingPage.ceremony")}
            </label>
          </>
        )}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold">{t("bookingPage.wishes")}</legend>
        <FormField id="inq-budget" label={t("bookingPage.budget")}>
          <Select value={budget} onValueChange={setBudget}>
            <SelectTrigger id="inq-budget" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("bookingPage.noBudget")}</SelectItem>
              {budgetRanges.map((r) => (
                <SelectItem key={r.key} value={r.key}>
                  {t(`budgetRanges.${r.key}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        {artists.length > 0 && (
          <FormField id="inq-artist" label={t("bookingPage.artist")}>
            <Select value={artist} onValueChange={setArtist}>
              <SelectTrigger id="inq-artist" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("bookingPage.noArtist")}</SelectItem>
                {artists.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.stageName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        )}
        <FormField id="inq-genre" label={t("bookingPage.genre")} className="sm:col-span-2">
          <Input id="inq-genre" name="preferredGenre" maxLength={96} placeholder={t("bookingPage.genrePlaceholder")} />
        </FormField>
        <FormField id="inq-message" label={t("bookingPage.message")} className="sm:col-span-2">
          <Textarea id="inq-message" name="message" rows={4} maxLength={5000} />
        </FormField>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold">{t("bookingPage.yourDetails")}</legend>
        <FormField id="inq-name" label={t("bookingPage.name")}>
          <Input id="inq-name" name="name" required minLength={2} maxLength={191} autoComplete="name" />
        </FormField>
        <FormField id="inq-email" label={t("bookingPage.email")}>
          <Input id="inq-email" name="email" type="email" required maxLength={191} autoComplete="email" />
        </FormField>
        <FormField id="inq-phone" label={t("bookingPage.phone")}>
          <Input id="inq-phone" name="phone" type="tel" maxLength={32} autoComplete="tel" />
        </FormField>
      </fieldset>

      {/* Honeypot: hidden from people, irresistible to bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 overflow-hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {siteKey && <Turnstile siteKey={siteKey} language={locale} />}
      <FormMessage>{error}</FormMessage>
      <p className="text-xs text-muted-foreground">{t("bookingPage.privacy")}</p>
      <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-fit">
        <SendIcon />
        {t("bookingPage.submit")}
      </Button>
    </form>
  );
}
