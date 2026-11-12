"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { toast } from "sonner";

/** Server actions refuse bodies above 6 MB (next.config.ts), with room left for the rest of the form. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Stops a too-large file before it reaches a server action: otherwise the request
 * fails without any message. It listens in the capture phase, so it covers every
 * file field in the app and runs before the field's own onChange.
 */
export function UploadGuard() {
  const t = useTranslations("ui");
  useEffect(() => {
    function check(event: Event) {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== "file" || !input.files) return;
      if (![...input.files].some((file) => file.size > MAX_UPLOAD_BYTES)) return;
      event.stopImmediatePropagation();
      input.value = "";
      toast.error(t("fileTooLarge"));
    }
    document.addEventListener("change", check, true);
    return () => document.removeEventListener("change", check, true);
  }, [t]);
  return null;
}
