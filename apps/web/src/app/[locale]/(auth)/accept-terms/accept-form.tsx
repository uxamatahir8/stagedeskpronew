"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { acceptTermsAction } from "./actions";

export function AcceptForm({ versionIds }: { versionIds: string[] }) {
  const t = useTranslations("acceptTerms");
  const [agreed, setAgreed] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <div className="grid gap-4">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        {t("agree")}
      </label>
      <Button disabled={!agreed || pending} onClick={() => startTransition(() => acceptTermsAction(versionIds))}>
        {t("continue")}
      </Button>
    </div>
  );
}
