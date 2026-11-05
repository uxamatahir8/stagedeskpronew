"use client";

import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { deletePlatformBookingTypeAction, saveBookingTypeAction, savePlatformBookingTypeAction } from "./actions";

export interface BookingTypeRow { id: string; key: string; nameNl: string; nameEn: string; active: boolean; protected: boolean; position: number; organizationId: string | null }
const blank = { id: null as string | null, key: "", nameNl: "", nameEn: "", active: true, protected: false, position: 0, organizationId: null as string | null };

export function BookingTypeManager({ rows, platform }: { rows: BookingTypeRow[]; platform: boolean }) {
  const t = useTranslations("bookingTypesAdmin");
  const [edit, setEdit] = useState<typeof blank | BookingTypeRow | null>(null);
  const [pending, start] = useTransition();
  const ownRows = platform ? rows.filter((r) => r.organizationId === null) : rows;
  const save = () => edit && start(async () => {
    const action = platform ? savePlatformBookingTypeAction : saveBookingTypeAction;
    const r = await action(edit.id, { key: edit.key, nameNl: edit.nameNl, nameEn: edit.nameEn, active: edit.active, position: edit.position });
    if (!r.ok) return void toast.error(r.message);
    toast.success(r.message); setEdit(null);
  });
  return <div className="grid gap-4">
    <div className="flex justify-end"><Button onClick={() => setEdit(blank)}><PlusIcon />{t("add")}</Button></div>
    <div className="grid gap-3">
      {ownRows.map((row) => <Card key={row.id}><CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
        <div><div className="flex items-center gap-2"><p className="font-medium">{row.nameEn} / {row.nameNl}</p>{row.protected && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{t("protected")}</span>}{!platform && row.organizationId === null && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t("platformType")}</span>}</div><p className="font-mono text-xs text-muted-foreground">{row.key} · {row.active ? t("active") : t("inactive")}</p></div>
        <div className="flex gap-1">{(platform || row.organizationId !== null) && <Button variant="ghost" size="icon" aria-label={t("edit")} onClick={() => setEdit(row)}><PencilIcon /></Button>}
          {platform && !row.protected && <Button variant="ghost" size="icon" className="text-destructive" aria-label={t("delete")} onClick={() => { if (confirm(t("deleteConfirm"))) start(async () => { const r = await deletePlatformBookingTypeAction(row.id); if (!r.ok) toast.error(r.message); else toast.success(r.message); }); }}><Trash2Icon /></Button>}
        </div>
      </CardContent></Card>)}
    </div>
    <Dialog open={edit !== null} onOpenChange={(open) => !open && setEdit(null)}><DialogContent><DialogHeader><DialogTitle>{edit?.id ? t("edit") : t("add")}</DialogTitle></DialogHeader>{edit && <div className="grid gap-4">
      <div className="grid gap-2"><Label htmlFor="type-key">{t("key")}</Label><Input id="type-key" value={edit.key} disabled={Boolean(edit.id)} onChange={(e) => setEdit({ ...edit, key: e.target.value.toLowerCase() })} /></div>
      <div className="grid gap-2"><Label htmlFor="type-en">{t("nameEn")}</Label><Input id="type-en" value={edit.nameEn} onChange={(e) => setEdit({ ...edit, nameEn: e.target.value })} /></div>
      <div className="grid gap-2"><Label htmlFor="type-nl">{t("nameNl")}</Label><Input id="type-nl" value={edit.nameNl} onChange={(e) => setEdit({ ...edit, nameNl: e.target.value })} /></div>
      <div className="grid gap-2"><Label htmlFor="type-position">{t("position")}</Label><Input id="type-position" type="number" min={0} max={9999} value={edit.position} onChange={(e) => setEdit({ ...edit, position: Number(e.target.value) || 0 })} /></div>
      <div className="flex items-center justify-between"><Label htmlFor="type-active">{t("active")}</Label><Switch id="type-active" checked={edit.active} disabled={edit.protected} onCheckedChange={(active) => setEdit({ ...edit, active })} /></div>
    </div>}<DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>{t("cancel")}</Button><Button disabled={pending || !edit?.key || !edit.nameEn || !edit.nameNl} onClick={save}>{t("save")}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
