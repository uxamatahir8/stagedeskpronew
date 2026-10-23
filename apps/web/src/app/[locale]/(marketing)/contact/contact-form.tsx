"use client";

import { useTranslations } from "next-intl";
import { FormField } from "@/components/form-field";
import { PublicForm } from "@/components/site/public-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { contactAction } from "@/lib/site-actions";

export function ContactForm({ turnstileKey }: { turnstileKey: string | null }) {
  const t = useTranslations("contactPage");
  return (
    <PublicForm action={contactAction} turnstileKey={turnstileKey} done={t("done")} className="relative grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="contact-name" label={t("name")}>
          <Input id="contact-name" name="name" required minLength={2} maxLength={120} autoComplete="name" />
        </FormField>
        <FormField id="contact-email" label={t("email")}>
          <Input id="contact-email" name="email" type="email" required autoComplete="email" />
        </FormField>
      </div>
      <FormField id="contact-company" label={t("company")}>
        <Input id="contact-company" name="company" maxLength={191} autoComplete="organization" />
      </FormField>
      <FormField id="contact-message" label={t("message")}>
        <Textarea id="contact-message" name="message" rows={6} required minLength={10} maxLength={5000} />
      </FormField>
      <Button type="submit" className="w-fit">
        {t("send")}
      </Button>
    </PublicForm>
  );
}
