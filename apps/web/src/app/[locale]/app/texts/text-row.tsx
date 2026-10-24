"use client";

import { RotateCcwIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { resetTextAction, saveTextAction } from "./actions";

export interface TextRowData {
  key: string;
  placeholders: string[];
  nl: { file: string; override: string | null };
  en: { file: string; override: string | null };
}

/** One text in both languages; changed texts are marked and can go back to the original. */
export function TextRow({ row }: { row: TextRowData }) {
  const t = useTranslations("siteTexts");
  return (
    <li className="grid gap-3 border-b py-5 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <code className="text-xs text-muted-foreground">{row.key}</code>
        {row.placeholders.map((p) => (
          <span key={p} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]" title={t("placeholderHint")}>
            {p}
          </span>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {(["nl", "en"] as const).map((locale) => (
          <Field key={locale} textKey={row.key} locale={locale} file={row[locale].file} override={row[locale].override} />
        ))}
      </div>
    </li>
  );
}

function Field({ textKey, locale, file, override }: { textKey: string; locale: "nl" | "en"; file: string; override: string | null }) {
  const t = useTranslations("siteTexts");
  const saved = override ?? file;
  const [value, setValue] = useState(saved);
  const [pending, start] = useTransition();
  const dirty = value !== saved;
  const id = `${locale}-${textKey}`;
  const run = (task: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const r = await task();
      if (r.message) (r.ok ? toast.success : toast.error)(r.message);
    });
  return (
    <div className="grid content-start gap-1.5">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-muted-foreground uppercase">
          {locale === "nl" ? "Nederlands" : "English"}
          {override !== null && <span className="ml-2 rounded bg-primary/12 px-1.5 py-0.5 text-[11px] text-primary normal-case">{t("changed")}</span>}
        </label>
        {override !== null && !dirty && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const r = await resetTextAction(textKey, locale);
                if (r.ok) setValue(file);
                return r;
              })
            }
          >
            <RotateCcwIcon />
            {t("reset")}
          </Button>
        )}
      </div>
      <Textarea
        id={id}
        value={value}
        rows={Math.min(8, Math.max(1, Math.ceil(value.length / 70)))}
        onChange={(e) => setValue(e.target.value)}
        className={cn("min-h-9 resize-y text-sm", override !== null && "border-primary/40")}
      />
      {override !== null && <p className="text-xs text-muted-foreground">{t("original", { text: file })}</p>}
      {dirty && (
        <div className="flex gap-2">
          <Button type="button" size="sm" disabled={pending} onClick={() => run(() => saveTextAction(textKey, locale, value))}>
            {t("save")}
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setValue(saved)}>
            {t("cancel")}
          </Button>
        </div>
      )}
    </div>
  );
}
