"use client";

import { LockIcon, RotateCcwIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { adminOnlyPermissions, type AgencyPermission, agencyPermissionGroups } from "@stagedesk/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useRouter } from "@/i18n/navigation";
import { savePermissionsAction } from "./actions";

type Grants = Record<"agency_admin" | "agency_staff", AgencyPermission[]>;

/**
 * What admins and staff may do in this agency, chosen by the owner. The owner
 * column is always on; admin-only rows can't be given to staff.
 */
export function PermissionsEditor({ initial, defaults, custom, unseen = false }: { initial: Grants; defaults: Grants; custom: boolean; unseen?: boolean }) {
  const t = useTranslations("permissions");
  const router = useRouter();
  const [grants, setGrants] = useState(initial);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(grants) !== JSON.stringify(initial);

  const toggle = (role: keyof Grants, permission: AgencyPermission, on: boolean) =>
    setGrants((g) => ({ ...g, [role]: on ? [...g[role], permission] : g[role].filter((p) => p !== permission) }));

  const save = (value: Grants | null) =>
    start(async () => {
      const r = await savePermissionsAction(value);
      (r.ok ? toast.success : toast.error)(r.message);
      if (value === null) setGrants(defaults);
      router.refresh();
    });

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid max-w-2xl gap-2">
          <p className="text-sm text-muted-foreground">{t("intro")}</p>
          {unseen && <p className="rounded-lg border border-info/40 bg-info/10 p-3 text-sm">{t("newPermissionsNotice")}</p>}
        </div>
        <div className="flex gap-2">
          {custom && (
            <Button variant="outline" disabled={pending} onClick={() => window.confirm(t("resetConfirm")) && save(null)}>
              <RotateCcwIcon />
              {t("reset")}
            </Button>
          )}
          <Button disabled={pending || !dirty} onClick={() => save(grants)}>
            {t("save")}
          </Button>
        </div>
      </div>

      {(Object.keys(agencyPermissionGroups) as (keyof typeof agencyPermissionGroups)[]).map((group) => (
        <Card key={group}>
          <CardHeader>
            <CardTitle>{t(`group_${group}`)}</CardTitle>
            <CardDescription>{t(`group_${group}Hint`)}</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">{t("permission")}</th>
                  <th className="w-24 py-2 text-center font-medium">{t("owner")}</th>
                  <th className="w-24 py-2 text-center font-medium">{t("admin")}</th>
                  <th className="w-24 py-2 text-center font-medium">{t("staff")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {agencyPermissionGroups[group].map((permission) => {
                  const key = permission.replaceAll(".", "_") as "agency_bookings";
                  const adminOnly = adminOnlyPermissions.includes(permission);
                  return (
                    <tr key={permission}>
                      <td className="py-3 pr-4">
                        <span className="font-medium">{t(`p_${key}`)}</span>
                        <span className="block text-xs text-muted-foreground">{t(`p_${key}Hint`)}</span>
                      </td>
                      <td className="py-3 text-center">
                        <Switch checked disabled aria-label={`${t("owner")}: ${t(`p_${key}`)}`} />
                      </td>
                      <td className="py-3 text-center">
                        <Switch
                          checked={grants.agency_admin.includes(permission)}
                          onCheckedChange={(on) => toggle("agency_admin", permission, on)}
                          aria-label={`${t("admin")}: ${t(`p_${key}`)}`}
                        />
                      </td>
                      <td className="py-3 text-center">
                        {adminOnly ? (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={t("adminOnly")}>
                            <LockIcon className="size-3.5" aria-hidden />
                            {t("adminOnlyShort")}
                          </span>
                        ) : (
                          <Switch
                            checked={grants.agency_staff.includes(permission)}
                            onCheckedChange={(on) => toggle("agency_staff", permission, on)}
                            aria-label={`${t("staff")}: ${t(`p_${key}`)}`}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <LockIcon className="size-4" aria-hidden />
        {t("ownerOnlyNote")}
      </p>
    </div>
  );
}
