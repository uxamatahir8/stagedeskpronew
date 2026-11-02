"use client";

import { CheckCircle2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { eventTypes } from "@stagedesk/core";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { submitDetailsAction } from "./actions";

type Values = Record<"eventType" | "eventDate" | "startTime" | "endTime" | "venueName" | "venueAddress" | "venueCity" | "guestCount" | "partnerName" | "preferredGenre" | "playlistUrl", string>;

/**
 * The event details form behind a customer's private link. Uses onSubmit (not
 * a form action) so a refused submit keeps what was typed.
 */
export function DetailsForm({ token, initial, askPhone, contact }: { token: string; initial: Values; askPhone: boolean; contact: string }) {
  const t = useTranslations("detailsPage");
  const te = useTranslations("eventTypes");
  const tn = useTranslations("newBooking");
  const [v, setV] = useState(initial);
  const [notes, setNotes] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string[] | null>(null);
  const [pending, start] = useTransition();
  const field = (k: keyof Values) => ({ value: v[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setV((x) => ({ ...x, [k]: e.target.value })) });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const result = await submitDetailsAction(token, { ...v, eventType: v.eventType as (typeof eventTypes)[number], notes, phone });
      if (!result.ok) return setError(result.message ?? t("invalid"));
      setDone(result.kept ?? []);
    });
  }

  if (done) {
    return (
      <Card>
        <CardContent className="grid justify-items-center gap-3 py-10 text-center">
          <CheckCircle2Icon className="size-10 text-success" />
          <h2 className="text-xl font-semibold">{t("thanksTitle")}</h2>
          <p className="text-muted-foreground">{t("thanks")}</p>
          {done.length > 0 && <p className="text-sm text-muted-foreground">{t("keptNote")}</p>}
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2">
      <FormField id="d-type" label={tn("eventType")}>
        <NativeSelect id="d-type" value={v.eventType} onChange={(e) => setV((x) => ({ ...x, eventType: e.target.value }))} className="w-full">
          {eventTypes.map((k) => (
            <option key={k} value={k}>
              {te(k)}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField id="d-date" label={tn("eventDate")}>
        <Input id="d-date" type="date" {...field("eventDate")} />
      </FormField>
      <FormField id="d-start" label={tn("startTime")}>
        <Input id="d-start" type="time" {...field("startTime")} />
      </FormField>
      <FormField id="d-end" label={tn("endTime")}>
        <Input id="d-end" type="time" {...field("endTime")} />
      </FormField>
      <FormField id="d-venue" label={tn("venue")}>
        <Input id="d-venue" maxLength={191} {...field("venueName")} />
      </FormField>
      <FormField id="d-city" label={tn("venueCity")}>
        <Input id="d-city" maxLength={96} {...field("venueCity")} />
      </FormField>
      <FormField id="d-address" label={tn("venueAddress")} className="sm:col-span-2">
        <Input id="d-address" maxLength={191} {...field("venueAddress")} />
      </FormField>
      <FormField id="d-guests" label={tn("guestCount")}>
        <Input id="d-guests" type="number" min={1} max={100000} inputMode="numeric" {...field("guestCount")} />
      </FormField>
      <FormField id="d-partner" label={tn("partnerName")}>
        <Input id="d-partner" maxLength={191} {...field("partnerName")} />
      </FormField>
      <FormField id="d-genre" label={t("music")}>
        <Input id="d-genre" maxLength={96} {...field("preferredGenre")} />
      </FormField>
      <FormField id="d-playlist" label={t("playlist")}>
        <Input id="d-playlist" type="url" maxLength={500} placeholder="https://" {...field("playlistUrl")} />
      </FormField>
      {askPhone && (
        <FormField id="d-phone" label={t("phone")}>
          <Input id="d-phone" type="tel" maxLength={32} autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </FormField>
      )}
      <FormField id="d-notes" label={t("notes")} hint={t("notesHint")} className="sm:col-span-2">
        <Textarea id="d-notes" rows={4} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </FormField>
      {error && (
        <p role="alert" className="text-sm text-destructive sm:col-span-2">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
        {contact && <p className="text-xs text-muted-foreground">{t("questions", { contact })}</p>}
        <Button type="submit" disabled={pending}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
