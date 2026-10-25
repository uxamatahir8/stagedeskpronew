"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { setNewsletterAction } from "./actions";

/** On or off for the signed-in person's own (verified) address; no confirmation mail needed. */
export function NewsletterCard({ subscribed }: { subscribed: boolean }) {
  const t = useTranslations("newsletter");
  const [on, setOn] = useState(subscribed);
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("profileTitle")}</CardTitle>
        <CardDescription>{t("profileBody")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="profile-newsletter" className="text-sm font-medium">
            {t("profileLabel")}
          </label>
          <Switch
            id="profile-newsletter"
            checked={on}
            disabled={pending}
            onCheckedChange={(next) =>
              start(async () => {
                await setNewsletterAction(next);
                setOn(next);
                toast.success(t(next ? "profileOn" : "profileOff"));
              })
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
