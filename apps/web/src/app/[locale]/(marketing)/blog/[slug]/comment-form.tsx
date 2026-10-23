"use client";

import { useTranslations } from "next-intl";
import { FormField } from "@/components/form-field";
import { PublicForm } from "@/components/site/public-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { commentAction } from "@/lib/site-actions";

export function CommentForm({ slug, turnstileKey }: { slug: string; turnstileKey: string | null }) {
  const t = useTranslations("blog");
  return (
    <PublicForm action={commentAction} turnstileKey={turnstileKey} done={t("commentDone")} className="relative grid gap-4 rounded-xl border bg-muted/30 p-5">
      <h3 className="font-medium">{t("writeComment")}</h3>
      <input type="hidden" name="slug" value={slug} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="comment-name" label={t("name")}>
          <Input id="comment-name" name="name" required minLength={2} maxLength={120} autoComplete="name" />
        </FormField>
        <FormField id="comment-email" label={t("email")} hint={t("emailHint")}>
          <Input id="comment-email" name="email" type="email" required autoComplete="email" />
        </FormField>
      </div>
      <FormField id="comment-body" label={t("comment")}>
        <Textarea id="comment-body" name="body" rows={4} required minLength={3} maxLength={3000} />
      </FormField>
      <Button type="submit" className="w-fit">
        {t("postComment")}
      </Button>
    </PublicForm>
  );
}
