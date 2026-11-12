"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { withdrawMyArticleAction } from "../content/actions";

export function WithdrawButton({ id }: { id: string }) {
  const t = useTranslations("contentAdmin");
  const [pending, start] = useTransition();
  return <Button variant="outline" size="sm" disabled={pending} onClick={() => start(async () => {
    const result = await withdrawMyArticleAction(id);
    if (!result.ok) toast.error(result.message); else toast.success(result.message);
  })}>{t("withdraw")}</Button>;
}
