"use client";

import { ArrowLeftIcon, SearchIcon, SendIcon, UsersIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { useFormatter } from "@/components/date-prefs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { euro } from "@/lib/format";
import { createArtistRequestAction, searchLendableArtistsAction } from "../../artist-requests/actions";

type Lendable = Awaited<ReturnType<typeof searchLendableArtistsAction>>[number];

/** Ask another agency to lend one of its artists for this booking, with a fee you propose. */
export function BorrowArtist({ bookingId, currency }: { bookingId: string; currency: string }) {
  const t = useTranslations("artistRequests");
  const format = useFormatter();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Lendable[] | null>(null);
  const [chosen, setChosen] = useState<Lendable | null>(null);
  const [fee, setFee] = useState("");
  const [message, setMessage] = useState("");
  const [searching, startSearch] = useTransition();
  const [sending, startSend] = useTransition();

  const search = (text: string) => startSearch(async () => setResults(await searchLendableArtistsAction(bookingId, text)));
  // Show who's available as soon as the dialog opens.
  useEffect(() => {
    if (open && results === null) search("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setChosen(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <UsersIcon />
          {t("borrow")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{chosen ? t("offerTitle", { artist: chosen.stageName }) : t("borrowTitle")}</DialogTitle>
          <DialogDescription>{chosen ? t("offerHint", { agency: chosen.agency }) : t("borrowHint")}</DialogDescription>
        </DialogHeader>
        {chosen ? (
          <div className="grid gap-4">
            <FormField required id="ar-fee" label={t("fee", { currency })} hint={t("feeHint")}>
              <Input id="ar-fee" value={fee} inputMode="decimal" placeholder="600" onChange={(e) => setFee(e.target.value)} />
            </FormField>
            <FormField id="ar-message" label={t("message")}>
              <Textarea id="ar-message" value={message} rows={3} maxLength={2000} onChange={(e) => setMessage(e.target.value)} />
            </FormField>
            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="ghost" onClick={() => setChosen(null)}>
                <ArrowLeftIcon />
                {t("back")}
              </Button>
              <Button
                disabled={sending || !fee.trim()}
                onClick={() =>
                  startSend(async () => {
                    const r = await createArtistRequestAction({ bookingId, artistId: chosen.id, fee, message });
                    if (!r.ok) return void toast.error(r.message);
                    toast.success(r.message);
                    setOpen(false);
                    setChosen(null);
                    setFee("");
                    setMessage("");
                    router.refresh();
                  })
                }
              >
                <SendIcon />
                {t("send")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            <form
              className="relative"
              onSubmit={(e) => {
                e.preventDefault();
                search(q);
              }}
            >
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPlaceholder")} aria-label={t("searchPlaceholder")} className="pl-8" />
            </form>
            {searching && results === null ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("searching")}</p>
            ) : results && results.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("noneFree")}</p>
            ) : (
              <ul className="grid max-h-96 gap-1 overflow-y-auto">
                {(results ?? []).map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => setChosen(a)} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none">
                      <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted font-semibold text-primary">
                        {a.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- served from /files
                          <img src={a.photoUrl} alt="" className="size-full object-cover" />
                        ) : (
                          a.stageName.charAt(0)
                        )}
                      </span>
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate font-medium">{a.stageName}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {[a.agency, a.city, a.genres.slice(0, 3).join(", ")].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      {a.priceFromCents && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{t("from", { price: euro(format, a.priceFromCents, currency) })}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
