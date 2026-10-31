"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useRouter } from "@/i18n/navigation";
import { saveInventorySettingsAction } from "./actions";

/** Inventory sharing with other agencies (off by default) and whether assigned artists record loading and returns. */
export function InventorySettingsForm({ initial }: { initial: { inventorySharing: boolean; artistsHandleEquipment: boolean } }) {
  const t = useTranslations("inventorySettings");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sharing, setSharing] = useState(initial.inventorySharing);
  const [artists, setArtists] = useState(initial.artistsHandleEquipment);
  const changed = sharing !== initial.inventorySharing || artists !== initial.artistsHandleEquipment;

  function save() {
    start(async () => {
      const result = await saveInventorySettingsAction({ inventorySharing: sharing, artistsHandleEquipment: artists });
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
            <Label htmlFor="inv-sharing">{t("sharing")}</Label>
            <p className="text-sm text-muted-foreground">{t("sharingHint")}</p>
          </div>
          <Switch id="inv-sharing" checked={sharing} onCheckedChange={setSharing} />
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-1">
            <Label htmlFor="inv-artists">{t("artists")}</Label>
            <p className="text-sm text-muted-foreground">{t("artistsHint")}</p>
          </div>
          <Switch id="inv-artists" checked={artists} onCheckedChange={setArtists} />
        </div>
        <div>
          <Button onClick={save} disabled={pending || !changed}>
            {t("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
