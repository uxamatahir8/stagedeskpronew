"use client";

import { CheckIcon, CopyIcon, FileDownIcon, PencilIcon, PlusIcon, ReceiptIcon, SendIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { FormMessage } from "@/components/auth/auth-card";
import { EventFields, type EventValues } from "@/components/booking/event-fields";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/actions";
import type { FormState } from "@/lib/validation";
import {
  acceptOnBehalfAction,
  addNoteAction,
  assignArtistAction,
  changeStatusAction,
  issueInvoiceAction,
  recordPaymentAction,
  updateDetailsAction,
} from "../actions";
import { type CatalogItem, QuoteBuilder, type BuilderLine } from "./quote-builder";

/** Runs a server action, shows the result as a toast and refreshes the page data. */
function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (task: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        if (result.message) toast.error(result.message);
        return;
      }
      if (result.message) toast.success(result.message);
      after?.();
      router.refresh();
    });
  return [pending, run] as const;
}

type StatusAction = "decline" | "cancel" | "complete" | "settle";

export function StatusActions({ bookingId, actions }: { bookingId: string; actions: StatusAction[] }) {
  const t = useTranslations();
  const [pending, run] = useRun();
  const [confirming, setConfirming] = useState<StatusAction | null>(null);
  const [reason, setReason] = useState("");
  const needsReason = confirming === "cancel" || confirming === "decline";

  if (actions.length === 0) return null;
  return (
    <>
      {actions.map((action) => (
        <Button
          key={action}
          variant={action === "cancel" || action === "decline" ? "outline" : "default"}
          disabled={pending}
          onClick={() => {
            setReason("");
            setConfirming(action);
          }}
        >
          {action === "complete" || action === "settle" ? <CheckIcon /> : null}
          {t(`bookingActions.${action}`)}
        </Button>
      ))}
      <Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirming && t(`bookingActions.${confirming}`)}</DialogTitle>
            <DialogDescription>{t("booking.confirmAction")}</DialogDescription>
          </DialogHeader>
          {needsReason && (
            <FormField id="status-reason" label={t("booking.reasonOptional")}>
              <Textarea id="status-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000} />
            </FormField>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t("ui.secondary")}</Button>
            </DialogClose>
            <Button
              variant={needsReason ? "destructive" : "default"}
              disabled={pending}
              onClick={() => confirming && run(() => changeStatusAction(bookingId, confirming, reason), () => setConfirming(null))}
            >
              {confirming && t(`bookingActions.${confirming}`)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function EditDetailsDialog({
  bookingId,
  values,
  dos,
  donts,
  playlistUrl,
}: {
  bookingId: string;
  values: EventValues;
  dos: string[];
  donts: string[];
  playlistUrl: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: FormState, form: FormData) => {
    const result = await updateDetailsAction(bookingId, prev, form);
    if (result.ok) {
      toast.success(result.message);
      setOpen(false);
      router.refresh();
    }
    return result;
  }, {} as FormState);
  const errors = state.fieldErrors ?? {};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <PencilIcon />
          {t("booking.edit")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("booking.eventDetails")}</DialogTitle>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <EventFields values={values} errors={errors} idPrefix="ed" />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="ed-dos" label={t("booking.dos")} hint={t("booking.listHint")}>
              <Textarea id="ed-dos" name="dos" defaultValue={dos.join("\n")} rows={4} />
            </FormField>
            <FormField id="ed-donts" label={t("booking.donts")} hint={t("booking.listHint")}>
              <Textarea id="ed-donts" name="donts" defaultValue={donts.join("\n")} rows={4} />
            </FormField>
            <FormField id="ed-playlist" label={t("booking.playlist")} error={errors["playlistUrl"]} className="sm:col-span-2">
              <Input id="ed-playlist" name="playlistUrl" type="url" defaultValue={playlistUrl} placeholder="https://open.spotify.com/…" />
            </FormField>
          </div>
          <FormMessage>{state.message && !state.ok ? state.message : null}</FormMessage>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("ui.secondary")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {t("artists.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function QuoteControls({
  bookingId,
  canQuote,
  hasQuote,
  quoteId,
  quoteLink,
  pdfHref,
  canAcceptOnBehalf,
  customerName,
  catalog,
  vatRates,
  initialLines,
  defaultDepositBps,
  defaultExpiryDays,
  currency,
}: {
  bookingId: string;
  canQuote: boolean;
  hasQuote: boolean;
  quoteId: string | null;
  quoteLink: string | null;
  pdfHref: string | null;
  canAcceptOnBehalf: boolean;
  customerName: string;
  catalog: CatalogItem[];
  vatRates: number[];
  initialLines: Omit<BuilderLine, "key">[];
  defaultDepositBps: number;
  defaultExpiryDays: number;
  currency: string;
}) {
  const t = useTranslations();
  const [building, setBuilding] = useState(false);
  const [pending, run] = useRun();
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [name, setName] = useState(customerName);

  if (building) {
    return (
      <QuoteBuilder
        bookingId={bookingId}
        catalog={catalog}
        vatRates={vatRates}
        initialLines={initialLines}
        defaultDepositBps={defaultDepositBps}
        defaultExpiryDays={defaultExpiryDays}
        currency={currency}
        onDone={() => setBuilding(false)}
      />
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {canQuote && (
        <Button onClick={() => setBuilding(true)} variant={hasQuote ? "outline" : "default"}>
          {hasQuote ? <SendIcon /> : <PlusIcon />}
          {hasQuote ? t("booking.reviseQuote") : t("booking.newQuote")}
        </Button>
      )}
      {quoteLink && (
        <Button
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(`${window.location.origin}${quoteLink}`);
            toast.success(t("booking.linkCopied"));
          }}
        >
          <CopyIcon />
          {t("booking.copyLink")}
        </Button>
      )}
      {pdfHref && (
        <Button variant="outline" asChild>
          <a href={pdfHref} target="_blank" rel="noopener">
            <FileDownIcon />
            {t("booking.downloadPdf")}
          </a>
        </Button>
      )}
      {canAcceptOnBehalf && quoteId && (
        <Dialog open={acceptOpen} onOpenChange={setAcceptOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost">{t("booking.acceptOnBehalf")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("booking.acceptOnBehalf")}</DialogTitle>
              <DialogDescription>{t("booking.acceptOnBehalfHint")}</DialogDescription>
            </DialogHeader>
            <FormField id="accept-name" label={t("booking.acceptName")}>
              <Input id="accept-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={191} />
            </FormField>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">{t("ui.secondary")}</Button>
              </DialogClose>
              <Button disabled={pending || !name.trim()} onClick={() => run(() => acceptOnBehalfAction(quoteId, name), () => setAcceptOpen(false))}>
                <CheckIcon />
                {t("quotePage.accept")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export interface ArtistOption {
  id: string;
  stageName: string;
  agency: string | null;
  free: boolean;
}

export function AssignArtist({ bookingId, options, hasArtist }: { bookingId: string; options: ArtistOption[]; hasArtist: boolean }) {
  const t = useTranslations("booking");
  const [pending, run] = useRun();
  const [artistId, setArtistId] = useState("");

  return (
    <div className="grid gap-2">
      <Select value={artistId} onValueChange={setArtistId}>
        <SelectTrigger className="w-full" aria-label={t("chooseArtist")}>
          <SelectValue placeholder={t("chooseArtist")} />
        </SelectTrigger>
        <SelectContent>
          {options.map((a) => (
            <SelectItem key={a.id} value={a.id} disabled={!a.free}>
              {a.stageName}
              {a.agency && <span className="text-muted-foreground"> · {t("sharedFrom", { agency: a.agency })}</span>}
              {!a.free && <span className="text-muted-foreground"> · {t("unavailable")}</span>}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{t("assignHint")}</p>
      <Button disabled={!artistId || pending} onClick={() => run(() => assignArtistAction(bookingId, artistId), () => setArtistId(""))}>
        {hasArtist ? t("reassign") : t("assign")}
      </Button>
    </div>
  );
}

export function RecordPayment({ bookingId, today, suggestedKind }: { bookingId: string; today: string; suggestedKind: "deposit" | "balance" }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [pending, run] = useRun();
  const [kind, setKind] = useState<"deposit" | "balance" | "other">(suggestedKind);
  const [method, setMethod] = useState<"bank_transfer" | "cash" | "card" | "other">("bank_transfer");

  function submit(form: FormData) {
    run(
      () =>
        recordPaymentAction(bookingId, {
          amount: String(form.get("amount")),
          kind,
          method,
          receivedAt: String(form.get("receivedAt")),
          reference: String(form.get("reference") ?? ""),
        }),
      () => setOpen(false),
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <PlusIcon />
          {t("booking.recordPayment")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("booking.recordPayment")}</DialogTitle>
        </DialogHeader>
        <form action={submit} className="grid gap-4 sm:grid-cols-2">
          <FormField id="pay-amount" label={t("booking.amount")}>
            <Input id="pay-amount" name="amount" inputMode="decimal" required placeholder="0,00" />
          </FormField>
          <FormField id="pay-date" label={t("booking.receivedAt")}>
            <Input id="pay-date" name="receivedAt" type="date" defaultValue={today} required />
          </FormField>
          <FormField id="pay-kind" label={t("booking.kind")}>
            <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
              <SelectTrigger id="pay-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["deposit", "balance", "other"] as const).map((k) => (
                  <SelectItem key={k} value={k}>
                    {t(`paymentKinds.${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField id="pay-method" label={t("booking.method")}>
            <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
              <SelectTrigger id="pay-method" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["bank_transfer", "cash", "card", "other"] as const).map((m) => (
                  <SelectItem key={m} value={m}>
                    {t(`paymentMethods.${m}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField id="pay-ref" label={t("booking.reference")} className="sm:col-span-2">
            <Input id="pay-ref" name="reference" maxLength={191} />
          </FormField>
          <DialogFooter className="sm:col-span-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("ui.secondary")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {t("booking.recordPayment")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function IssueInvoiceButton({ bookingId }: { bookingId: string }) {
  const t = useTranslations("booking");
  const [pending, run] = useRun();
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => issueInvoiceAction(bookingId))}>
      <ReceiptIcon />
      {t("issueInvoice")}
    </Button>
  );
}

export function AddNote({ bookingId }: { bookingId: string }) {
  const t = useTranslations("booking");
  const [body, setBody] = useState("");
  const [pending, run] = useRun();
  return (
    <form
      action={() => run(() => addNoteAction(bookingId, body), () => setBody(""))}
      className="grid gap-2"
    >
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("notePlaceholder")} rows={3} maxLength={5000} aria-label={t("addNote")} />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending || !body.trim()}>
          {t("addNote")}
        </Button>
      </div>
    </form>
  );
}
