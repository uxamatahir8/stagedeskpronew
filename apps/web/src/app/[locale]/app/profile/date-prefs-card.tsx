"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { DatePrefs } from "@stagedesk/core";
import { DateTimeFields, type DatePrefsInput } from "@/components/date-time-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "@/i18n/navigation";
import { saveDatePrefsAction } from "./actions";

/** Personal timezone, date and time format; each field can follow the agency or platform default. */
export function DatePrefsCard({ initial, inherited }: { initial: DatePrefsInput; inherited: DatePrefs }) {
  const t = useTranslations("dateTime");
  const tp = useTranslations("profile");
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("profileHint")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <DateTimeFields idPrefix="profile-dt" initial={initial} inherited={inherited} onChange={setValue} />
        <div className="flex justify-end">
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const result = await saveDatePrefsAction(value);
                if (!result.ok) return void toast.error(result.message);
                toast.success(result.message);
                router.refresh();
              })
            }
          >
            {tp("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
