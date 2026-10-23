"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { joinWaitlistAction } from "@/lib/site-actions";
import { cn } from "@/lib/utils";
import { PublicForm } from "./public-form";

/** Email plus role: enough to tell people when StageDesk opens. */
export function WaitlistForm({ turnstileKey, inverted = false }: { turnstileKey: string | null; inverted?: boolean }) {
  const t = useTranslations("site.waitlist");
  return (
    <PublicForm action={joinWaitlistAction} turnstileKey={turnstileKey} done={t("done")} inverted={inverted} className="relative grid w-full max-w-md gap-3">
      <div className="flex flex-wrap gap-2">
        <label htmlFor={inverted ? "wl-email-2" : "wl-email"} className="sr-only">
          {t("email")}
        </label>
        <Input
          id={inverted ? "wl-email-2" : "wl-email"}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder={t("emailPlaceholder")}
          className={cn("min-w-0 flex-1", inverted && "border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground placeholder:text-primary-foreground/60")}
        />
        <Button type="submit" variant={inverted ? "secondary" : "default"}>
          {t("submit")}
        </Button>
      </div>
      <fieldset className={cn("flex flex-wrap gap-4 text-sm", inverted ? "text-primary-foreground/85" : "text-muted-foreground")}>
        <legend className="sr-only">{t("role")}</legend>
        {(["agency", "artist", "other"] as const).map((role) => (
          <label key={role} className="flex items-center gap-1.5">
            <input type="radio" name="role" value={role} defaultChecked={role === "agency"} className="accent-current" />
            {t(`role_${role}`)}
          </label>
        ))}
      </fieldset>
    </PublicForm>
  );
}
