"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** A read-only value with a copy button: links, codes, embed snippets. */
export function CopyField({ label, value, wrap = false }: { label: string; value: string; wrap?: boolean }) {
  const t = useTranslations("affiliate");
  const id = useId();
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid min-w-0 gap-1.5">
      <label htmlFor={wrap ? undefined : id} className="text-sm text-muted-foreground">
        {label}
      </label>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
        {wrap ? (
          <span className="flex min-h-8 min-w-0 items-center rounded-lg border border-input bg-transparent px-2.5 py-1.5 font-mono text-sm break-all" title={value}>
            {value}
          </span>
        ) : (
          <Input id={id} readOnly value={value} title={value} className="min-w-0 font-mono text-sm" onFocus={(e) => e.currentTarget.select()} />
        )}
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t("copy")}
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </Button>
      </div>
    </div>
  );
}
