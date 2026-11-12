"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useRouter } from "@/i18n/navigation";
import { saveCustomerPortalAction } from "./actions";

/** Whether customers edit their own music wishes and instructions, or leave that to the agency. */
export function CustomerPortalForm({ initial }: { initial: { customerPreferencesEditable: boolean } }) {
  const t = useTranslations("customerPortalSettings");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editable, setEditable] = useState(initial.customerPreferencesEditable);

  function save() {
    start(async () => {
      const result = await saveCustomerPortalAction({ customerPreferencesEditable: editable });
      if (!result.ok) return void toast.error(result.message);
      toast.success(result.message);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-1">
            <Label htmlFor="portal-editable">{t("editable")}</Label>
            <p className="text-sm text-muted-foreground">{t("editableHint")}</p>
          </div>
          <Switch id="portal-editable" checked={editable} onCheckedChange={setEditable} />
        </div>
        <div>
          <Button onClick={save} disabled={pending || editable === initial.customerPreferencesEditable}>
            {t("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
