import { InfoIcon, TriangleAlertIcon } from "lucide-react";
import { type Block, parseInline } from "@stagedesk/core";
import { cn } from "@/lib/utils";

/** Text with **bold**, *italic* and safe [links](…). Rendered as React nodes, never as HTML. */
export function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((t, i) =>
        t.type === "bold" ? (
          <strong key={i} className="font-semibold text-foreground">
            {t.text}
          </strong>
        ) : t.type === "italic" ? (
          <em key={i}>{t.text}</em>
        ) : t.type === "link" ? (
          <a
            key={i}
            href={t.href}
            className="font-medium text-primary underline-offset-4 hover:underline"
            {...(t.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {t.text}
          </a>
        ) : (
          <span key={i}>{t.text}</span>
        ),
      )}
    </>
  );
}

/** A builder page's blocks, in the site's reading style. Works on the server and in the editor preview. */
export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="text-[1.0625rem] leading-7 text-foreground/90">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading":
            return b.level === 2 ? (
              <h2 key={i} className="mt-10 mb-3 text-2xl font-semibold tracking-tight text-balance text-foreground first:mt-0">
                {b.text}
              </h2>
            ) : (
              <h3 key={i} className="mt-8 mb-2 text-lg font-semibold text-foreground first:mt-0">
                {b.text}
              </h3>
            );
          case "paragraph":
            return (
              <p key={i} className="my-4 whitespace-pre-line">
                <Inline text={b.text} />
              </p>
            );
          case "list": {
            const Tag = b.ordered ? "ol" : "ul";
            return (
              <Tag key={i} className={cn("my-4 space-y-1.5 pl-6", b.ordered ? "list-decimal" : "list-disc")}>
                {b.items.map((item, j) => (
                  <li key={j}>
                    <Inline text={item} />
                  </li>
                ))}
              </Tag>
            );
          }
          case "table":
            return (
              <div key={i} className="my-6 overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      {b.header.map((cell, j) => (
                        <th key={j} className="border-b px-3 py-2 font-medium">
                          {cell}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, r) => (
                      <tr key={r} className="border-b last:border-0">
                        {row.map((cell, j) => (
                          <td key={j} className="px-3 py-2 align-top">
                            <Inline text={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "image":
            return (
              <figure key={i} className="my-6">
                {/* eslint-disable-next-line @next/next/no-img-element -- editor-supplied URL (https or /files) */}
                <img src={b.url} alt={b.alt} className="w-full rounded-xl border" loading="lazy" />
                {b.caption && <figcaption className="mt-2 text-sm text-muted-foreground">{b.caption}</figcaption>}
              </figure>
            );
          case "callout": {
            const Icon = b.tone === "warning" ? TriangleAlertIcon : InfoIcon;
            return (
              <aside
                key={i}
                className={cn("my-6 flex gap-3 rounded-xl border p-4 text-[0.95rem]", b.tone === "warning" ? "border-warning/50 bg-warning/10" : "border-info/30 bg-info/8")}
              >
                <Icon className={cn("mt-1 size-4 shrink-0", b.tone === "warning" ? "text-foreground" : "text-info")} aria-hidden />
                <p className="whitespace-pre-line">
                  <Inline text={b.text} />
                </p>
              </aside>
            );
          }
        }
      })}
    </div>
  );
}
