"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { FormMessage } from "@/components/auth/auth-card";
import { emptyEvent, EventFields } from "@/components/booking/event-fields";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/lib/validation";
import { createBookingAction } from "../actions";

/**
 * The booking form. Agencies use it with their own action; a platform admin
 * passes an action bound to the chosen agency and can add fields with `extra`.
 */
export function NewBookingForm({
  customers,
  submitAction = createBookingAction,
  extra,
}: {
  customers: { id: string; name: string; email: string }[];
  submitAction?: (prev: FormState, form: FormData) => Promise<FormState>;
  extra?: React.ReactNode;
}) {
  const t = useTranslations();
  const [state, action, pending] = useActionState(submitAction, {} as FormState);
  const [mode, setMode] = useState<"existing" | "new">(customers.length ? "existing" : "new");
  const [customerId, setCustomerId] = useState("");
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="grid gap-6">
      <input type="hidden" name="customerMode" value={mode} />
      <input type="hidden" name="customerId" value={customerId} />
      <Card>
        <CardHeader>
          <CardTitle>{t("newBooking.customer")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
            <TabsList>
              <TabsTrigger value="existing" disabled={customers.length === 0}>
                {t("newBooking.existingCustomer")}
              </TabsTrigger>
              <TabsTrigger value="new">{t("newBooking.newCustomer")}</TabsTrigger>
            </TabsList>
            <TabsContent value="existing" className="mt-4">
              <FormField required id="nb-customer" label={t("newBooking.customer")}>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger id="nb-customer" className="w-full">
                    <SelectValue placeholder={t("newBooking.chooseCustomer")} />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} · {c.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </TabsContent>
            <TabsContent value="new" className="mt-4 grid gap-4 sm:grid-cols-2">
              <FormField required id="nb-cname" label={t("auth.name")} error={errors["customerName"]}>
                <Input required id="nb-cname" name="customerName" maxLength={191} autoComplete="off" />
              </FormField>
              <FormField required id="nb-cemail" label={t("auth.email")} error={errors["customerEmail"]}>
                <Input required id="nb-cemail" name="customerEmail" type="email" autoComplete="off" />
              </FormField>
              <FormField id="nb-cphone" label={t("customers.phone")} error={errors["customerPhone"]}>
                <Input id="nb-cphone" name="customerPhone" type="tel" maxLength={32} autoComplete="off" />
              </FormField>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("newBooking.event")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <EventFields values={emptyEvent} errors={errors} idPrefix="nb" />
          <FormField id="nb-message" label={t("newBooking.message")} error={errors["message"]}>
            <Textarea id="nb-message" name="message" rows={4} maxLength={5000} />
          </FormField>
        </CardContent>
      </Card>

      {extra}
      <FormMessage>{state.message}</FormMessage>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {t("newBooking.submit")}
        </Button>
      </div>
    </form>
  );
}
