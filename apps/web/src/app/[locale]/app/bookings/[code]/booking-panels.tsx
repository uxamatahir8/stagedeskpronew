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
import { DatePicker } from "@/components/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
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
  requestDetailsAction,
  revokeDetailsAction,
  updateDetailsAction,
} from "../actions";
import { type CatalogItem, QuoteBuilder, type BuilderLine, type QuoteDefaults } from "./quote-builder";

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
  quoteDefaults,
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
  quoteDefaults: QuoteDefaults;
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
        defaults={quoteDefaults}
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
            <FormField required id="accept-name" label={t("booking.acceptName")}>
              <Input required id="accept-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={191} />
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
  /** The artist's default pay, e.g. "40%" or "€ 250,00 per booking". */
  payLabel: string;
}

export function AssignArtist({ bookingId, options, hasArtist }: { bookingId: string; options: ArtistOption[]; hasArtist: boolean }) {
  const t = useTranslations("booking");
  const [pending, run] = useRun();
  const [artistId, setArtistId] = useState("");
  // "default" takes the artist's own pay; the others set it for this booking only.
  const [pay, setPay] = useState<"default" | "percentage" | "fixed">("default");
  const [payValue, setPayValue] = useState("");
  const chosen = options.find((a) => a.id === artistId);

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
      {chosen && (
        <div className="grid gap-2 rounded-lg border p-3">
          <Label htmlFor="assign-pay">{t("payForBooking")}</Label>
          <NativeSelect id="assign-pay" value={pay} onChange={(e) => setPay(e.target.value as typeof pay)} className="w-full">
            <option value="default">{t("payDefault", { pay: chosen.payLabel })}</option>
            <option value="percentage">{t("payPercentage")}</option>
            <option value="fixed">{t("payFixed")}</option>
          </NativeSelect>
          {pay !== "default" && (
            <Input
              aria-label={pay === "fixed" ? t("payFixed") : t("payPercentage")}
              value={payValue}
              inputMode="decimal"
              placeholder={pay === "fixed" ? "250,00" : "40"}
              onChange={(e) => setPayValue(e.target.value)}
            />
          )}
          <p className="text-xs text-muted-foreground">{t("payHint")}</p>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t("assignHint")}</p>
      <Button
        disabled={!artistId || pending || (pay !== "default" && !payValue.trim())}
        onClick={() =>
          run(
            () => assignArtistAction(bookingId, artistId, pay === "default" ? null : { type: pay, value: payValue }),
            () => {
              setArtistId("");
              setPay("default");
              setPayValue("");
            },
          )
        }
      >
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
            <DatePicker id="pay-date" name="receivedAt" defaultValue={today} required />
          </FormField>
          <FormField required id="pay-kind" label={t("booking.kind")}>
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
          <FormField required id="pay-method" label={t("booking.method")}>
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

/** Issues the invoice after showing its number; people who may can type the number instead (when the agency allows it). */
export function IssueInvoiceButton({ bookingId, nextNumber, canTypeNumber }: { bookingId: string; nextNumber: string; canTypeNumber: boolean }) {
  const t = useTranslations("booking");
  const [pending, run] = useRun();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending}>
          <ReceiptIcon />
          {t("issueInvoice")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("issueInvoice")}</DialogTitle>
          <DialogDescription>{t("issueInvoiceHint")}</DialogDescription>
        </DialogHeader>
        <p className="text-sm">
          {t("invoiceNumberNext")}: <span className="font-mono font-medium">{typed.trim() ? typed.trim().toUpperCase() : nextNumber}</span>
        </p>
        {canTypeNumber && (
          <FormField id="inv-number" label={t("invoiceNumberOwn")} hint={t("invoiceNumberOwnHint")}>
            <Input id="inv-number" value={typed} maxLength={32} className="font-mono uppercase" placeholder={nextNumber} onChange={(e) => setTyped(e.target.value)} />
          </FormField>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("dialogCancel")}</Button>
          </DialogClose>
          <Button disabled={pending} onClick={() => run(() => issueInvoiceAction(bookingId, typed.trim() || null), () => setOpen(false))}>
            <ReceiptIcon />
            {t("issueInvoiceConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

/**
 * Ask the customer to fill in the event details through a private link: email
 * it to them, or copy it (e.g. to send by WhatsApp while on the phone). The
 * link is shown once; a new link replaces the open one.
 */
export function DetailRequestPanel({
  bookingId,
  defaultLocale,
  open,
  customerEmail,
}: {
  bookingId: string;
  defaultLocale: "nl" | "en";
  open: { expires: string; emailedTo: string | null } | null;
  customerEmail: string;
}) {
  const t = useTranslations("detailRequest");
  const [pending, run] = useRun();
  const [dialog, setDialog] = useState(false);
  const [locale, setLocale] = useState(defaultLocale);
  const [days, setDays] = useState("7");
  const [url, setUrl] = useState<string | null>(null);

  const create = (email: boolean) =>
    run(async () => {
      const result = await requestDetailsAction(bookingId, { locale, days: Math.max(1, Math.min(30, Number(days) || 7)), email });
      if (result.ok && result.url) setUrl(result.url);
      return result;
    });

  return (
    <div className="grid gap-2 border-t pt-3">
      {open ? (
        <p className="text-xs text-muted-foreground">{open.emailedTo ? t("openEmailed", { email: open.emailedTo, date: open.expires }) : t("openLink", { date: open.expires })}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setUrl(null);
            setDialog(true);
          }}
        >
          <SendIcon />
          {open ? t("newLink") : t("request")}
        </Button>
        {open && (
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => revokeDetailsAction(bookingId))}>
            {t("revoke")}
          </Button>
        )}
      </div>
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          {url ? (
            <div className="grid gap-3">
              <p className="text-sm">{t("linkReady")}</p>
              <div className="flex gap-2">
                <Input readOnly value={url} aria-label={t("link")} onFocus={(e) => e.target.select()} />
                <Button
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(url);
                    toast.success(t("copied"));
                  }}
                >
                  <CopyIcon />
                  {t("copy")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("linkOnce")}</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="dr-locale" label={t("language")}>
                <NativeSelect id="dr-locale" value={locale} onChange={(e) => setLocale(e.target.value as "nl" | "en")} className="w-full">
                  <option value="nl">Nederlands</option>
                  <option value="en">English</option>
                </NativeSelect>
              </FormField>
              <FormField id="dr-days" label={t("days")}>
                <Input id="dr-days" type="number" min={1} max={30} value={days} onChange={(e) => setDays(e.target.value)} />
              </FormField>
              {open && <p className="text-xs text-muted-foreground sm:col-span-2">{t("replaces")}</p>}
            </div>
          )}
          <DialogFooter>
            {url ? (
              <DialogClose asChild>
                <Button>{t("done")}</Button>
              </DialogClose>
            ) : (
              <>
                <Button variant="outline" disabled={pending} onClick={() => create(false)}>
                  <CopyIcon />
                  {t("createLink")}
                </Button>
                <Button disabled={pending} onClick={() => create(true)}>
                  <SendIcon />
                  {t("sendTo", { email: customerEmail })}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
