"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { unsubscribeAction } from "./actions";

export function UnsubscribeButton({ token }: { token: string }) {
  const t = useTranslations("newsletter");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      className="w-fit"
      variant="destructive"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await unsubscribeAction(token);
          router.replace(`/newsletter/unsubscribe?token=${encodeURIComponent(token)}&done=1`);
        })
      }
    >
      {t("unsubscribeButton")}
    </Button>
  );
}
