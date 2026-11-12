"use client";

import { CalendarXIcon, PartyPopperIcon, SendIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
import { budgetRanges, timeInNetherlands, type EventType } from "@stagedesk/core";
import { FormMessage } from "@/components/auth/auth-card";
import { SwitchAgencyLink } from "@/components/booking/switch-agency-link";
import { DatePicker } from "@/components/date-picker";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Link, useRouter } from "@/i18n/navigation";
import { requestBookingAction } from "../actions";

const NONE = "none";

/** A signed-in customer's booking request: what the agency needs, with what's already known filled in. */
export function RequestForm({
  agencies,
  agency,
  artists,
  fullyBooked,
  today,
  contact,
  isActiveAgency,
  bookingTypes,
}: {
  agencies: { id: string; name: string }[];
  agency: { id: string; name: string };
  artists: { id: string; stageName: string }[];
  fullyBooked: string[];
  today: string;
  contact: { name: string; email: string; phone: string };
  isActiveAgency: boolean;
  bookingTypes: { key: string; label: string }[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const [eventType, setEventType] = useState<EventType>("wedding");
  const [budget, setBudget] = useState(NONE);
  const [artist, setArtist] = useState(NONE);
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ code: string; agency: string } | null>(null);
  const [formKey, setFormKey] = useState(0);
  // One key per filled-in form: a double click or a retry after a lost answer is the same request.
  const [clientRequestId, setClientRequestId] = useState(() => crypto.randomUUID());
  const [pending, start] = useTransition();

  if (sent) {
    const eventHref = `/app/event?booking=${sent.code}`;
    return (
      <div className="grid gap-4 rounded-xl border bg-card p-6 text-center" data-testid="request-sent">
        <PartyPopperIcon className="mx-auto size-8 text-primary" aria-hidden />
        <h2 className="text-xl font-semibold">{t("customerRequest.sentTitle")}</h2>
        <p className="text-muted-foreground">{t("customerRequest.sentBody", { agency: sent.agency })}</p>
        <p className="font-mono text-lg font-semibold" data-testid="request-code">
          {sent.code}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {isActiveAgency ? (
            <Button asChild>
              <Link href={eventHref}>{t("customerRequest.openEvent")}</Link>
            </Button>
          ) : (
            <SwitchAgencyLink organizationId={agency.id} href={eventHref}>
              {t("customerRequest.openEvent")}
            </SwitchAgencyLink>
          )}
          <Button
            variant="outline"
            onClick={() => {
              setSent(null);
              setDate("");
              setError(null);
              setClientRequestId(crypto.randomUUID());
              setFormKey((k) => k + 1);
            }}
          >
            {t("customerHome.requestAnother")}
          </Button>
        </div>
      </div>
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set("organizationId", agency.id);
    form.set("clientRequestId", clientRequestId);
    form.set("eventType", eventType);
    form.set("budgetRange", budget === NONE ? "" : budget);
    form.set("preferredArtistId", artist === NONE ? "" : artist);
    setError(null);
    start(async () => {
      const result = await requestBookingAction(form);
      if (result.ok) setSent({ code: result.code, agency: result.agency });
      else setError(result.message);
    });
  }

  const booked = date !== "" && fullyBooked.includes(date);
  const earliestStart = date === today ? timeInNetherlands() : undefined;

  return (
    <form key={formKey} onSubmit={submit} className="grid gap-6">
      {agencies.length > 1 && (
        <FormField id="req-agency" label={t("customerRequest.agency")} hint={t("customerRequest.agencyHint")}>
          <NativeSelect id="req-agency" className="w-full" value={agency.id} onChange={(e) => router.push(`/app/event/request?agency=${e.target.value}`)}>
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      )}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold">{t("bookingPage.eventDetails")}</legend>
        <FormField required id="req-type" label={t("bookingPage.eventType")}>
          <Select value={eventType} onValueChange={(v) => setEventType(v as EventType)}>
            <SelectTrigger id="req-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {bookingTypes.map((e) => (
                <SelectItem key={e.key} value={e.key}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id="req-date" label={t("bookingPage.date")}>
          <DatePicker id="req-date" name="eventDate" min={today} required value={date} onChange={setDate} />
        </FormField>
        {booked && (
          <p className="flex items-start gap-2 rounded-lg bg-warning/18 p-3 text-sm sm:col-span-2" role="status">
            <CalendarXIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("bookingPage.fullyBooked")}
          </p>
        )}
        <FormField id="req-start" label={t("bookingPage.startTime")}>
          <DatePicker id="req-start" name="startTime" mode="time" min={earliestStart} />
        </FormField>
        <FormField id="req-guests" label={t("bookingPage.guests")}>
          <Input id="req-guests" name="guestCount" type="number" min={1} max={100000} inputMode="numeric" />
        </FormField>
        <FormField id="req-venue" label={t("bookingPage.venueName")}>
          <Input id="req-venue" name="venueName" maxLength={191} />
        </FormField>
        <FormField id="req-city" label={t("bookingPage.venueCity")}>
          <Input id="req-city" name="venueCity" required maxLength={96} autoComplete="address-level2" />
        </FormField>
        {eventType === "wedding" && (
          <>
            <FormField id="req-partner" label={t("bookingPage.partnerName")}>
              <Input id="req-partner" name="partnerName" maxLength={191} />
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
        <FormField id="req-budget" label={t("bookingPage.budget")}>
          <Select value={budget} onValueChange={setBudget}>
            <SelectTrigger id="req-budget" className="w-full">
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
          <FormField id="req-artist" label={t("bookingPage.artist")}>
            <Select value={artist} onValueChange={setArtist}>
              <SelectTrigger id="req-artist" className="w-full">
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
        <FormField id="req-genre" label={t("bookingPage.genre")} className="sm:col-span-2">
          <Input id="req-genre" name="preferredGenre" maxLength={96} placeholder={t("bookingPage.genrePlaceholder")} />
        </FormField>
        <FormField id="req-message" label={t("bookingPage.message")} className="sm:col-span-2">
          <Textarea id="req-message" name="message" rows={4} maxLength={5000} />
        </FormField>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold">{t("bookingPage.yourDetails")}</legend>
        <FormField id="req-name" label={t("bookingPage.name")}>
          <Input id="req-name" name="name" required minLength={2} maxLength={191} autoComplete="name" defaultValue={contact.name} />
        </FormField>
        <FormField id="req-phone" label={t("bookingPage.phone")}>
          <Input id="req-phone" name="phone" type="tel" maxLength={32} autoComplete="tel" defaultValue={contact.phone} />
        </FormField>
        <FormField id="req-email" label={t("bookingPage.email")} hint={t("customerRequest.emailHint")} className="sm:col-span-2">
          <Input id="req-email" type="email" value={contact.email} readOnly disabled />
        </FormField>
      </fieldset>

      <FormMessage>{error}</FormMessage>
      <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-fit">
        <SendIcon />
        {t("customerRequest.submit")}
      </Button>
    </form>
  );
}
