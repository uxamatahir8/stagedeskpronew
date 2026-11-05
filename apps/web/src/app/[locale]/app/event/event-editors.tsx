"use client";

import { PencilIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
import { toast } from "sonner";
import { type EventType } from "@stagedesk/core";
import { FormMessage } from "@/components/auth/auth-card";
import { DatePicker } from "@/components/date-picker";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { FormState } from "@/lib/validation";
import { requestEventChangeAction, savePreferencesAction, withdrawChangeAction } from "./actions";

/** Submits a form to an action without React resetting it when the action fails, so nothing typed is lost. */
function useFormAction(action: (form: FormData) => Promise<FormState>, onSaved: () => void) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<FormState>({});
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setState({});
    start(async () => {
      const result = await action(form);
      setState(result);
      if (result.ok) {
        toast.success(result.message);
        onSaved();
        router.refresh();
      }
    });
  };
  return { pending, state, submit };
}

export interface PreferenceValues {
  preferredGenre: string;
  dos: string;
  donts: string;
  playlistUrl: string;
  musicRequests: string;
  specialRequests: string;
}

export function EditPreferencesDialog({ bookingId, values }: { bookingId: string; values: PreferenceValues }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const { pending, state, submit } = useFormAction((form) => savePreferencesAction(bookingId, form), () => setOpen(false));
  const errors = state.fieldErrors ?? {};
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PencilIcon />
          {t("customerEvent.editPreferences")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("customerEvent.editPreferences")}</DialogTitle>
          <DialogDescription>{t("customerEvent.preferencesHint")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <FormField id="pref-genre" label={t("bookingPage.genre")} className="sm:col-span-2">
            <Input id="pref-genre" name="preferredGenre" maxLength={96} defaultValue={values.preferredGenre} placeholder={t("bookingPage.genrePlaceholder")} />
          </FormField>
          <FormField id="pref-dos" label={t("customerEvent.dosLabel")} hint={t("booking.listHint")}>
            <Textarea id="pref-dos" name="dos" rows={5} defaultValue={values.dos} />
          </FormField>
          <FormField id="pref-donts" label={t("customerEvent.dontsLabel")} hint={t("booking.listHint")}>
            <Textarea id="pref-donts" name="donts" rows={5} defaultValue={values.donts} />
          </FormField>
          <FormField id="pref-playlist" label={t("customerEvent.playlistLabel")} hint={t("customerEvent.playlistHint")} error={errors["playlistUrl"]} className="sm:col-span-2">
            <Input id="pref-playlist" name="playlistUrl" maxLength={500} inputMode="url" defaultValue={values.playlistUrl} placeholder="https://open.spotify.com/playlist/…" aria-invalid={Boolean(errors["playlistUrl"])} />
          </FormField>
          <FormField id="pref-music" label={t("customerEvent.musicRequests")} className="sm:col-span-2">
            <Textarea id="pref-music" name="musicRequests" rows={3} maxLength={4000} defaultValue={values.musicRequests} />
          </FormField>
          <FormField id="pref-special" label={t("customerEvent.specialRequests")} className="sm:col-span-2">
            <Textarea id="pref-special" name="specialRequests" rows={3} maxLength={4000} defaultValue={values.specialRequests} />
          </FormField>
          <div className="sm:col-span-2">
            <FormMessage>{state.message && !state.ok ? state.message : null}</FormMessage>
          </div>
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

export interface EventDetailValues {
  eventType: EventType;
  eventDate: string;
  startTime: string;
  endTime: string;
  venueName: string;
  venueAddress: string;
  venueCity: string;
  guestCount: string;
}

/** Date, times, venue, type and guests. `direct`: saved at once (no quote yet); otherwise it goes to the agency to decide. */
export function ChangeDetailsDialog({ bookingId, values, direct, today, bookingTypes }: { bookingId: string; values: EventDetailValues; direct: boolean; today: string; bookingTypes: { key: string; label: string }[] }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<EventType>(values.eventType);
  const { pending, state, submit } = useFormAction((form) => requestEventChangeAction(bookingId, form), () => setOpen(false));
  const errors = state.fieldErrors ?? {};
  const title = direct ? t("customerEvent.changeDetails") : t("customerEvent.requestChange");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <PencilIcon />
          {title}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{direct ? t("customerEvent.changeDirectHint") : t("customerEvent.changeRequestHint")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <FormField id="chg-type" label={t("newBooking.eventType")}>
            <input type="hidden" name="eventType" value={type} />
            <Select value={type} onValueChange={(v) => setType(v as EventType)}>
              <SelectTrigger id="chg-type" className="w-full">
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
          <FormField id="chg-date" label={t("newBooking.eventDate")} error={errors["eventDate"]}>
            <DatePicker id="chg-date" name="eventDate" min={today} defaultValue={values.eventDate} />
          </FormField>
          <FormField id="chg-start" label={t("newBooking.startTime")} error={errors["startTime"]}>
            <DatePicker id="chg-start" name="startTime" mode="time" defaultValue={values.startTime} />
          </FormField>
          <FormField id="chg-end" label={t("newBooking.endTime")} error={errors["endTime"]}>
            <DatePicker id="chg-end" name="endTime" mode="time" defaultValue={values.endTime} />
          </FormField>
          <FormField id="chg-venue" label={t("newBooking.venueName")}>
            <Input id="chg-venue" name="venueName" maxLength={191} defaultValue={values.venueName} />
          </FormField>
          <FormField id="chg-city" label={t("newBooking.venueCity")}>
            <Input id="chg-city" name="venueCity" maxLength={96} defaultValue={values.venueCity} />
          </FormField>
          <FormField id="chg-address" label={t("newBooking.venueAddress")} className="sm:col-span-2">
            <Input id="chg-address" name="venueAddress" maxLength={191} defaultValue={values.venueAddress} />
          </FormField>
          <FormField id="chg-guests" label={t("newBooking.guestCount")} error={errors["guestCount"]}>
            <Input id="chg-guests" name="guestCount" inputMode="numeric" defaultValue={values.guestCount} />
          </FormField>
          {!direct && (
            <FormField id="chg-note" label={t("customerEvent.changeNote")} className="sm:col-span-2">
              <Textarea id="chg-note" name="note" rows={3} maxLength={2000} />
            </FormField>
          )}
          <div className="sm:col-span-2">
            <FormMessage>{state.message && !state.ok ? state.message : null}</FormMessage>
          </div>
          <DialogFooter className="sm:col-span-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("ui.secondary")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {direct ? t("artists.save") : t("customerEvent.sendRequest")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function WithdrawChangeButton({ requestId }: { requestId: string }) {
  const t = useTranslations("customerEvent");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await withdrawChangeAction(requestId);
          if (result.ok) {
            toast.success(result.message);
            router.refresh();
          } else if (result.message) toast.error(result.message);
        })
      }
    >
      {t("withdrawChange")}
    </Button>
  );
}
