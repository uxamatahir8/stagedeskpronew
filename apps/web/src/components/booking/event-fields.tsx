"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { eventTypes, type EventType } from "@stagedesk/core";
import { DatePicker, type DatePickerMode } from "@/components/date-picker";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface EventValues {
  eventType: EventType;
  eventDate: string;
  startTime: string;
  endTime: string;
  venueName: string;
  venueAddress: string;
  venueCity: string;
  guestCount: string;
  budget: string;
  partnerName: string;
}

export const emptyEvent: EventValues = {
  eventType: "wedding",
  eventDate: "",
  startTime: "",
  endTime: "",
  venueName: "",
  venueAddress: "",
  venueCity: "",
  guestCount: "",
  budget: "",
  partnerName: "",
};

/** Event, venue and wedding fields shared by "new booking" and "edit details". */
export function EventFields({ values, errors, idPrefix }: { values: EventValues; errors: Record<string, string>; idPrefix: string }) {
  const t = useTranslations();
  const [type, setType] = useState<EventType>(values.eventType);
  const id = (name: string) => `${idPrefix}-${name}`;
  const text = (name: keyof EventValues, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <FormField id={id(name)} label={label} error={errors[name === "budget" ? "budget" : name]}>
      <Input id={id(name)} name={name} defaultValue={values[name]} aria-invalid={Boolean(errors[name])} {...props} />
    </FormField>
  );
  const picker = (name: "eventDate" | "startTime" | "endTime", label: string, mode: DatePickerMode) => (
    <FormField id={id(name)} label={label} error={errors[name]}>
      <DatePicker id={id(name)} name={name} mode={mode} defaultValue={values[name]} aria-invalid={Boolean(errors[name])} />
    </FormField>
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField id={id("eventType")} label={t("newBooking.eventType")}>
        <input type="hidden" name="eventType" value={type} />
        <Select value={type} onValueChange={(v) => setType(v as EventType)}>
          <SelectTrigger id={id("eventType")} className="w-full">
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
      {picker("eventDate", t("newBooking.eventDate"), "date")}
      {picker("startTime", t("newBooking.startTime"), "time")}
      {picker("endTime", t("newBooking.endTime"), "time")}
      {text("venueName", t("newBooking.venueName"), { maxLength: 191 })}
      {text("venueCity", t("newBooking.venueCity"), { maxLength: 96 })}
      {text("venueAddress", t("newBooking.venueAddress"), { maxLength: 191, className: "sm:col-span-2" })}
      {text("guestCount", t("newBooking.guestCount"), { inputMode: "numeric" })}
      {text("budget", t("newBooking.budget"), { inputMode: "decimal" })}
      {type === "wedding" && text("partnerName", t("newBooking.partnerName"), { maxLength: 191 })}
    </div>
  );
}
