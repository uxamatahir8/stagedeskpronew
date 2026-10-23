"use client";

import { RefreshCwIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/actions";
import { addDomainAction, removeDomainAction, verifyDomainAction } from "../actions";

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (task: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      const r = await task();
      if (!r.ok) toast.error(r.message);
      else {
        toast.success(r.message);
        after?.();
      }
      router.refresh();
    });
  return { pending, run };
}

export function AddDomainForm() {
  const t = useTranslations("websiteEditor");
  const { pending, run } = useRun();
  const [value, setValue] = useState("");
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addDomainAction(value), () => setValue(""));
      }}
    >
      <div className="grid min-w-60 flex-1 gap-1.5">
        <Label htmlFor="domain-new">{t("domainName")}</Label>
        <Input id="domain-new" value={value} placeholder="www.jouwbureau.nl" onChange={(e) => setValue(e.target.value)} />
      </div>
      <Button type="submit" disabled={pending || !value.trim()}>
        {t("addDomain")}
      </Button>
    </form>
  );
}

export function DomainActions({ domainId, verified }: { domainId: string; verified: boolean }) {
  const t = useTranslations("websiteEditor");
  const { pending, run } = useRun();
  return (
    <span className="flex gap-2">
      <Button size="sm" variant={verified ? "ghost" : "default"} disabled={pending} onClick={() => run(() => verifyDomainAction(domainId))}>
        <RefreshCwIcon />
        {t(verified ? "checkAgain" : "verify")}
      </Button>
      <Button size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => run(() => removeDomainAction(domainId))}>
        <Trash2Icon />
        {t("removeDomain")}
      </Button>
    </span>
  );
}
