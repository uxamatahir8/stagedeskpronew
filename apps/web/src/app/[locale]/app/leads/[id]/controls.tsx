"use client";

import { MapPinIcon, SendIcon, UserCheckIcon, XCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/actions";
import { assignLeadAction, closeLeadAction, offerLeadAction, saveLeadNotesAction } from "../actions";

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (task: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      const r = await task();
      if (!r.ok) return void toast.error(r.message);
      toast.success(r.message);
      after?.();
      router.refresh();
    });
  return { pending, run };
}

type Agency = { id: string; name: string; city: string | null };

/** Offer the lead to several agencies (first to accept wins), assign it to one, or close it. */
export function LeadRouting({ leadId, agencies, city, offered }: { leadId: string; agencies: Agency[]; city: string; offered: string[] }) {
  const t = useTranslations("leads");
  const { pending, run } = useRun();
  const [chosen, setChosen] = useState<string[]>([]);
  const [assignTo, setAssignTo] = useState("");
  const [reason, setReason] = useState("");
  const candidates = agencies.filter((a) => !offered.includes(a.id));
  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("route")}</CardTitle>
        <CardDescription>{t("routeHint")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">{t("offerTo")}</legend>
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("allOffered")}</p>
          ) : (
            <ul className="grid max-h-64 gap-1 overflow-y-auto rounded-lg border p-1">
              {candidates.map((a) => {
                const near = Boolean(city) && (a.city ?? "").toLowerCase() === city;
                return (
                  <li key={a.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                      <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={chosen.includes(a.id)} onChange={() => toggle(a.id)} />
                      <span className="flex-1">
                        {a.name}
                        {a.city && <span className="text-muted-foreground"> · {a.city}</span>}
                      </span>
                      {near && (
                        <span className="flex items-center gap-1 text-xs text-success">
                          <MapPinIcon className="size-3" aria-hidden />
                          {t("sameCity")}
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <Button className="w-fit" disabled={pending || chosen.length === 0} onClick={() => run(() => offerLeadAction(leadId, chosen), () => setChosen([]))}>
            <SendIcon />
            {t("offerButton", { count: chosen.length })}
          </Button>
        </fieldset>

        <div className="grid gap-2 border-t pt-5">
          <FormField id="lead-assign" label={t("assignDirect")} hint={t("assignHint")}>
            <Select value={assignTo} onValueChange={setAssignTo}>
              <SelectTrigger id="lead-assign" className="w-full">
                <SelectValue placeholder={t("chooseAgency")} />
              </SelectTrigger>
              <SelectContent>
                {agencies.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                    {a.city ? ` · ${a.city}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <Button variant="outline" className="w-fit" disabled={pending || !assignTo} onClick={() => run(() => assignLeadAction(leadId, assignTo))}>
            <UserCheckIcon />
            {t("assignButton")}
          </Button>
        </div>

        <div className="border-t pt-5">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" className="w-fit text-destructive">
                <XCircleIcon />
                {t("close")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("closeTitle")}</DialogTitle>
                <DialogDescription>{t("closeHint")}</DialogDescription>
              </DialogHeader>
              <FormField id="lead-close-reason" label={t("reason")}>
                <Input id="lead-close-reason" value={reason} maxLength={191} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPlaceholder")} />
              </FormField>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">{t("cancel")}</Button>
                </DialogClose>
                <Button variant="destructive" disabled={pending} onClick={() => run(() => closeLeadAction(leadId, reason))}>
                  {t("close")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}

export function LeadNotes({ leadId, notes }: { leadId: string; notes: string }) {
  const t = useTranslations("leads");
  const { pending, run } = useRun();
  const [value, setValue] = useState(notes);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("notes")}</CardTitle>
        <CardDescription>{t("notesHint")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <label htmlFor="lead-notes" className="sr-only">
          {t("notes")}
        </label>
        <Textarea id="lead-notes" rows={4} maxLength={5000} value={value} onChange={(e) => setValue(e.target.value)} />
        <Button variant="outline" className="w-fit" disabled={pending || value === notes} onClick={() => run(() => saveLeadNotesAction(leadId, value))}>
          {t("saveNotes")}
        </Button>
      </CardContent>
    </Card>
  );
}
