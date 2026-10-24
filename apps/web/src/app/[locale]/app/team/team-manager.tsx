"use client";

import { MailPlusIcon, Trash2Icon, UserPlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import type { Role } from "@stagedesk/core";
import { FormField } from "@/components/form-field";
import { Pill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cancelInvitationAction, inviteMemberAction, removeMemberAction, updateMemberRoleAction } from "./actions";
import { useRouter } from "@/i18n/navigation";

const invitable = ["agency_admin", "agency_staff", "artist"] as const;
const assignable = ["agency_owner", "agency_admin", "agency_staff", "artist"] as const;

interface MemberRow {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  joined: string;
}

interface InvitationRow {
  id: string;
  email: string;
  role: string;
  expires: string;
}

function useErrorToast() {
  const t = useTranslations("auth");
  return (error: { message?: string } | null): void => {
    toast.error(error?.message ?? t("generic"));
  };
}

export function InviteDialog() {
  const t = useTranslations();
  const router = useRouter();
  const fail = useErrorToast();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<(typeof invitable)[number]>("agency_staff");
  const [pending, setPending] = useState(false);

  async function invite(form: FormData) {
    const email = String(form.get("email")).trim();
    setPending(true);
    const { error } = await inviteMemberAction(email, role);
    setPending(false);
    if (error) return fail(error);
    toast.success(t("team.sent", { email }));
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlusIcon />
          {t("team.invite")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("team.inviteTitle")}</DialogTitle>
          <DialogDescription>{t("team.inviteBody")}</DialogDescription>
        </DialogHeader>
        <form action={invite} className="grid gap-4">
          <FormField id="invite-email" label={t("auth.email")}>
            <Input id="invite-email" name="email" type="email" required autoComplete="off" />
          </FormField>
          <FormField id="invite-role" label={t("team.role")}>
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger id="invite-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {invitable.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`roles.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("ui.secondary")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              <MailPlusIcon />
              {t("team.send")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TeamTables({
  manage,
  viewerRole,
  viewerUserId,
  members,
  invitations,
}: {
  /** Whether the viewer may invite, change and remove (the agency's permission settings). */
  manage: boolean;
  viewerRole: Role;
  viewerUserId: string;
  members: MemberRow[];
  invitations: InvitationRow[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const fail = useErrorToast();
  const isOwner = viewerRole === "agency_owner";

  /** Owners manage everyone; admins manage everyone except owners. Nobody edits themselves here. */
  function canManage(member: MemberRow) {
    if (!manage || member.userId === viewerUserId) return false;
    return isOwner || member.role !== "agency_owner";
  }

  async function changeRole(member: MemberRow, role: string) {
    const { error } = await updateMemberRoleAction(member.id, role);
    if (error) return fail(error);
    toast.success(t("team.roleChanged"));
    router.refresh();
  }

  async function remove(member: MemberRow) {
    const { error } = await removeMemberAction(member.id);
    if (error) return fail(error);
    toast.success(t("team.removed", { name: member.name }));
    router.refresh();
  }

  async function cancel(invitationId: string) {
    const { error } = await cancelInvitationAction(invitationId);
    if (error) return fail(error);
    toast.success(t("team.canceled"));
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("team.members")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("team.name")}</TableHead>
                <TableHead>{t("team.role")}</TableHead>
                <TableHead>{t("team.joined")}</TableHead>
                <TableHead className="w-0 text-right">
                  <span className="sr-only">{t("team.actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="font-medium">
                      {m.name}
                      {m.userId === viewerUserId && <span className="ml-1.5 text-muted-foreground">({t("team.you")})</span>}
                    </div>
                    <div className="text-sm text-muted-foreground">{m.email}</div>
                  </TableCell>
                  <TableCell>
                    {canManage(m) ? (
                      <Select value={m.role} onValueChange={(role) => changeRole(m, role)}>
                        <SelectTrigger size="sm" className="w-44" aria-label={t("team.role")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {assignable
                            .filter((r) => isOwner || r !== "agency_owner")
                            .map((r) => (
                              <SelectItem key={r} value={r}>
                                {t(`roles.${r}`)}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Pill tone={m.role === "agency_owner" ? "brand" : "neutral"}>{t(`roles.${m.role as Role}`)}</Pill>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{m.joined}</TableCell>
                  <TableCell className="text-right">
                    {canManage(m) && <RemoveButton name={m.name} onConfirm={() => remove(m)} />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("team.pending")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {invitations.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("team.noPending")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("auth.email")}</TableHead>
                  <TableHead>{t("team.role")}</TableHead>
                  <TableHead>{t("team.expires")}</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.email}</TableCell>
                    <TableCell>
                      <Pill tone="info">{t(`roles.${i.role as Role}`)}</Pill>
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{i.expires}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" disabled={!manage} onClick={() => cancel(i.id)}>
                        {t("team.cancelInvite")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RemoveButton({ name, onConfirm }: { name: string; onConfirm: () => Promise<void> }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t("team.remove")}>
          <Trash2Icon />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("team.removeConfirm", { name })}</DialogTitle>
          <DialogDescription>{t("team.removeHint")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("ui.secondary")}</Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={async () => {
              await onConfirm();
              setOpen(false);
            }}
          >
            {t("team.remove")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
