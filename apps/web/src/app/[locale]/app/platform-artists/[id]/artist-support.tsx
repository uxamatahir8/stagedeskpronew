"use client";

import { BuildingIcon, LinkIcon, LogInIcon, PowerIcon, Share2Icon, Trash2Icon, UnlinkIcon, UserMinusIcon, UserRoundCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/actions";
import { startImpersonationAction } from "@/lib/impersonation-actions";
import { startSupportAction } from "@/lib/support-actions";
import {
  deactivateArtistAction,
  deleteArtistAction,
  makeIndependentAction,
  reactivateArtistAction,
  relinkArtistAction,
  revokeArtistSharesAction,
  unlinkArtistAction,
  withdrawArtistAction,
} from "../actions";

type Kind = "withdraw" | "deactivate" | "reactivate" | "revoke" | "unlink" | "relink" | "delete" | "independent";

/**
 * Support actions for one artist. Every change asks for a reason (stored in
 * the audit log) and is confirmed in a dialog; deleting is only offered when
 * nothing refers to the artist.
 */
export function ArtistSupport({
  artistId,
  canMakeIndependent,
  active,
  upcoming,
  shares,
  linkedUser,
  canImpersonate,
  agencyId,
  deletable,
}: {
  artistId: string;
  /** An agency's or the managed pool's artist with a working account and no independent business yet. */
  canMakeIndependent: boolean;
  active: boolean;
  upcoming: number;
  shares: number;
  linkedUser: { id: string; email: string; disabled: boolean } | null;
  canImpersonate: boolean;
  agencyId: string | null;
  deletable: boolean;
}) {
  const t = useTranslations("platformArtists");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<Kind | null>(null);
  const [why, setWhy] = useState("");
  const [email, setEmail] = useState("");
  const [withdraw, setWithdraw] = useState(true);
  const [leaveAgency, setLeaveAgency] = useState(true);

  const run = (task: () => Promise<ActionResult>) =>
    start(async () => {
      const result = await task();
      if (!result.ok) return void toast.error(result.message);
      if (result.message) toast.success(result.message);
      setOpen(null);
      setWhy("");
      router.refresh();
    });

  const actions: Record<Kind, () => Promise<ActionResult>> = {
    withdraw: () => withdrawArtistAction(artistId, why),
    deactivate: () => deactivateArtistAction(artistId, why, withdraw),
    reactivate: () => reactivateArtistAction(artistId, why),
    revoke: () => revokeArtistSharesAction(artistId, why),
    unlink: () => unlinkArtistAction(artistId, why),
    relink: () => relinkArtistAction(artistId, email, why),
    delete: () => deleteArtistAction(artistId, why),
    independent: () => makeIndependentAction(artistId, why, leaveAgency, withdraw),
  };

  const button = (kind: Kind, Icon: React.ComponentType, variant: "outline" | "destructive" = "outline") => (
    <Button variant={variant} size="sm" disabled={pending} onClick={() => setOpen(kind)}>
      <Icon />
      {t(`do_${kind}`)}
    </Button>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("supportActions")}</CardTitle>
        <CardDescription>{t("supportActionsHint")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          {canImpersonate && linkedUser && (
            <Button size="sm" disabled={pending} onClick={() => start(async () => void (await startImpersonationAction(linkedUser.id)))}>
              <LogInIcon />
              {t("loginAsArtist")}
            </Button>
          )}
          {agencyId && (
            <Button variant="outline" size="sm" disabled={pending} onClick={() => start(() => startSupportAction(agencyId, `/app/artists/${artistId}`))}>
              <BuildingIcon />
              {t("openInSupport")}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2 border-t pt-4">
          {upcoming > 0 && button("withdraw", UserMinusIcon)}
          {active ? button("deactivate", PowerIcon) : button("reactivate", PowerIcon)}
          {shares > 0 && button("revoke", Share2Icon)}
          {canMakeIndependent && button("independent", UserRoundCheckIcon)}
          {linkedUser ? button("unlink", UnlinkIcon) : null}
          {button("relink", LinkIcon)}
          {deletable ? button("delete", Trash2Icon, "destructive") : <p className="self-center text-xs text-muted-foreground">{t("notDeletable")}</p>}
        </div>
      </CardContent>

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{open ? t(`do_${open}`) : ""}</DialogTitle>
            <DialogDescription>{open ? t(`confirm_${open}`, { count: upcoming }) : ""}</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            action={() => {
              if (open) run(actions[open]);
            }}
          >
            {open === "relink" && (
              <FormField required id="as-email" label={t("relinkEmail")} hint={t("relinkHint")}>
                <Input id="as-email" type="email" required maxLength={191} value={email} onChange={(e) => setEmail(e.target.value)} />
              </FormField>
            )}
            {open === "independent" && (
              <div className="flex items-start gap-2">
                <Switch id="as-leave" checked={leaveAgency} onCheckedChange={setLeaveAgency} />
                <Label htmlFor="as-leave" className="leading-snug font-normal">
                  {t("leaveAgency")}
                </Label>
              </div>
            )}
            {((open === "deactivate" && upcoming > 0) || (open === "independent" && leaveAgency && upcoming > 0)) && (
              <div className="flex items-start gap-2">
                <Switch id="as-withdraw" checked={withdraw} onCheckedChange={setWithdraw} />
                <Label htmlFor="as-withdraw" className="leading-snug font-normal">
                  {t("alsoWithdraw", { count: upcoming })}
                </Label>
              </div>
            )}
            <FormField required id="as-reason" label={t("reason")} hint={t("reasonHint")}>
              <Textarea id="as-reason" required rows={2} maxLength={500} value={why} onChange={(e) => setWhy(e.target.value)} />
            </FormField>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  {t("cancel")}
                </Button>
              </DialogClose>
              <Button type="submit" variant={open === "delete" ? "destructive" : "default"} disabled={pending || !why.trim() || (open === "relink" && !email.trim())}>
                {open ? t(`do_${open}`) : ""}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
