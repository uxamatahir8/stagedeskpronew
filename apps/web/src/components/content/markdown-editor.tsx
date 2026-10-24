"use client";

import { BoldIcon, EyeIcon, Heading2Icon, Heading3Icon, ImageUpIcon, ItalicIcon, LinkIcon, ListIcon, ListOrderedIcon, QuoteIcon, TableIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Markdown } from "./markdown";

type Tool = "h2" | "h3" | "bold" | "italic" | "list" | "numbered" | "quote" | "link" | "table" | "image";
export type UploadImage = (form: FormData) => Promise<{ ok: true; url: string } | { ok: false; message: string }>;

/**
 * A writing field for formatted text: a toolbar for headings, bold, lists,
 * links and tables, image upload that drops the picture at the cursor
 * (between paragraphs), and a live preview. Stores Markdown; HTML isn't shown.
 */
export function MarkdownEditor({
  id,
  value,
  onChange,
  upload,
  rows = 16,
  placeholder,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  upload: UploadImage;
  rows?: number;
  placeholder?: string;
  className?: string;
}) {
  const t = useTranslations("markdownEditor");
  const [view, setView] = useState<"write" | "split" | "preview">("write");
  const [uploading, startUpload] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);

  function wrap(before: string, after = "", placeholderText = "") {
    const el = area.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const selected = value.slice(s, e) || placeholderText;
    onChange(value.slice(0, s) + before + selected + after + value.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + selected.length);
    });
  }
  function prefix(p: string) {
    const el = area.current;
    if (!el) return;
    const s = el.selectionStart;
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    onChange(value.slice(0, lineStart) + p + value.slice(lineStart));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + p.length, s + p.length);
    });
  }
  /** Puts a block (image, table) on its own lines at the cursor. */
  function insertBlock(block: string) {
    const el = area.current;
    const s = el?.selectionStart ?? value.length;
    const before = value.slice(0, s);
    const after = value.slice(s);
    const lead = before === "" || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
    const trail = after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
    onChange(before + lead + block + trail + after);
  }

  function run(tool: Tool) {
    if (tool === "h2") prefix("## ");
    else if (tool === "h3") prefix("### ");
    else if (tool === "bold") wrap("**", "**", t("boldText"));
    else if (tool === "italic") wrap("*", "*", t("italicText"));
    else if (tool === "list") prefix("- ");
    else if (tool === "numbered") prefix("1. ");
    else if (tool === "quote") prefix("> ");
    else if (tool === "link") wrap("[", "](https://)", t("linkText"));
    else if (tool === "table") insertBlock(`| ${t("column")} 1 | ${t("column")} 2 |\n| --- | --- |\n| … | … |`);
    else file.current?.click();
  }

  function onFile(f: File) {
    const form = new FormData();
    form.set("image", f);
    startUpload(async () => {
      const r = await upload(form);
      if (!r.ok) return void toast.error(r.message);
      insertBlock(`![${t("imageAlt")}](${r.url})`);
    });
  }

  const tools: { tool: Tool; icon: typeof BoldIcon }[] = [
    { tool: "h2", icon: Heading2Icon },
    { tool: "h3", icon: Heading3Icon },
    { tool: "bold", icon: BoldIcon },
    { tool: "italic", icon: ItalicIcon },
    { tool: "list", icon: ListIcon },
    { tool: "numbered", icon: ListOrderedIcon },
    { tool: "quote", icon: QuoteIcon },
    { tool: "link", icon: LinkIcon },
    { tool: "table", icon: TableIcon },
    { tool: "image", icon: ImageUpIcon },
  ];

  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-lg border border-b-0 bg-muted/40 p-1">
        <div className="flex flex-wrap gap-0.5">
          {tools.map(({ tool, icon: Icon }) => (
            <Button key={tool} type="button" variant="ghost" size="icon" className="size-8" aria-label={t(`tool_${tool}`)} title={t(`tool_${tool}`)} disabled={view === "preview" || (tool === "image" && uploading)} onClick={() => run(tool)}>
              <Icon />
            </Button>
          ))}
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onFile(f);
            }}
          />
        </div>
        <div className="flex gap-1 rounded-md bg-background p-0.5 text-xs">
          {(["write", "split", "preview"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} className={cn("rounded px-2 py-1", view === v ? "bg-muted font-medium" : "text-muted-foreground")}>
              {t(`view_${v}`)}
            </button>
          ))}
        </div>
      </div>
      <div className={cn("-mt-2 grid rounded-b-lg border", view === "split" && "lg:grid-cols-2")}>
        {view !== "preview" && (
          <Textarea
            id={id}
            ref={area}
            value={value}
            rows={rows}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder ?? t("placeholder")}
            className="resize-y rounded-none border-0 font-mono text-sm leading-6 shadow-none focus-visible:ring-0"
          />
        )}
        {view !== "write" && (
          <div className={cn("max-h-[40rem] min-h-48 overflow-y-auto bg-background p-4", view === "split" && "border-t lg:border-t-0 lg:border-l")}>
            {value.trim() ? (
              <Markdown className="text-base">{value}</Markdown>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <EyeIcon className="size-4" aria-hidden />
                {t("previewEmpty")}
              </p>
            )}
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{uploading ? t("uploading") : t("hint")}</p>
    </div>
  );
}
