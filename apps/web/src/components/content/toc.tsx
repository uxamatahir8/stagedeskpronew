import { tableOfContents } from "@stagedesk/core";
import { cn } from "@/lib/utils";

/** "In this article": the h2 and h3 headings of a Markdown body, as anchor links. */
export function Toc({ body, title, className }: { body: string; title: string; className?: string }) {
  const toc = tableOfContents(body);
  if (toc.length < 2) return null;
  return (
    <nav aria-label={title} className={cn("grid content-start gap-3 text-sm", className)}>
      <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">{title}</p>
      <ol className="grid gap-2 border-l">
        {toc.map((h) => (
          <li key={h.id} className={h.level === 3 ? "pl-7" : "pl-4"}>
            <a href={`#${h.id}`} className="-ml-px block border-l border-transparent leading-snug text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
              {h.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
