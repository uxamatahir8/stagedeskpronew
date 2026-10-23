"use client";

import { SendIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendTestEmailAction } from "./actions";

export function SendTestButton({ kind, lang }: { kind: string; lang: "nl" | "en" }) {
  const t = useTranslations("emailPreviews");
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await sendTestEmailAction(kind, lang);
          if (r.ok) toast.success(r.message);
          else toast.error(r.message);
        })
      }
    >
      <SendIcon />
      {t("sendTest")}
    </Button>
  );
}
