"use client";

import { CheckIcon, LinkIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** Share an article: LinkedIn, WhatsApp, X, email, or copy the link. */
export function ShareLinks({ url, title, className }: { url: string; title: string; className?: string }) {
  const t = useTranslations("blog");
  const [copied, setCopied] = useState(false);
  const u = encodeURIComponent(url);
  const links = [
    { label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    { label: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}` },
    { label: "X", href: `https://x.com/intent/post?url=${u}&text=${encodeURIComponent(title)}` },
    { label: t("shareEmail"), href: `mailto:?subject=${encodeURIComponent(title)}&body=${u}` },
  ];
  const item = "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors hover:border-primary/50 hover:text-primary";
  return (
    <div className={cn("grid gap-3", className)}>
      <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">{t("share")}</p>
      <ul className="flex flex-wrap gap-2">
        {links.map((l) => (
          <li key={l.label}>
            <a href={l.href} target="_blank" rel="noopener noreferrer" className={item}>
              {l.label}
            </a>
          </li>
        ))}
        <li>
          <button
            type="button"
            className={item}
            onClick={() => {
              void navigator.clipboard.writeText(url).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              });
            }}
          >
            {copied ? <CheckIcon className="size-4" aria-hidden /> : <LinkIcon className="size-4" aria-hidden />}
            <span aria-live="polite">{copied ? t("copied") : t("copyLink")}</span>
          </button>
        </li>
      </ul>
    </div>
  );
}
