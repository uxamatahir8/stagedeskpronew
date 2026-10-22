"use client";

import { EyeIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { roles, type Role } from "@stagedesk/core";
import { setPreviewRole } from "@/app/[locale]/app/actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRouter } from "@/i18n/navigation";

/** Development-only: preview the dashboard as each role until accounts exist. */
export function RoleSwitcher({ role }: { role: Role }) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(next: string) {
    startTransition(async () => {
      await setPreviewRole(next);
      router.push("/app");
      router.refresh();
    });
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div>
          <Select value={role} onValueChange={change} disabled={pending}>
            <SelectTrigger size="sm" className="w-44 border-dashed" aria-label={t("shell.previewAs")}>
              <EyeIcon />
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {roles.map((r) => (
                <SelectItem key={r} value={r}>
                  {t(`roles.${r}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-56">
        {t("shell.previewHint")}
      </TooltipContent>
    </Tooltip>
  );
}
