import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { headingId } from "@stagedesk/core";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/** Plain text of rendered children, for heading anchors. */
function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  if (node && typeof node === "object" && "props" in node) return text((node.props as { children?: ReactNode }).children);
  return "";
}

const components: Components = {
  h2: ({ children }) => (
    <h2 id={headingId(text(children))} className="mt-12 mb-4 scroll-mt-24 text-2xl font-semibold tracking-tight text-balance sm:text-[1.7rem]">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 id={headingId(text(children))} className="mt-8 mb-2 scroll-mt-24 text-xl font-semibold">
      {children}
    </h3>
  ),
  h4: ({ children }) => <h4 className="mt-6 mb-2 font-semibold">{children}</h4>,
  p: ({ children }) => <p className="my-5 leading-8">{children}</p>,
  ul: ({ children }) => <ul className="my-5 list-disc space-y-2 pl-6 marker:text-primary">{children}</ul>,
  ol: ({ children }) => <ol className="my-5 list-decimal space-y-2 pl-6 marker:font-semibold marker:text-primary">{children}</ol>,
  li: ({ children }) => <li className="pl-1 leading-8">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  blockquote: ({ children }) => <blockquote className="my-8 border-l-4 border-primary pl-5 text-lg text-foreground/80 italic">{children}</blockquote>,
  hr: () => <hr className="my-12 border-border" />,
  code: ({ children }) => <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.88em]">{children}</code>,
  pre: ({ children }) => <pre className="my-6 overflow-x-auto rounded-xl bg-muted p-4 text-sm [&_code]:bg-transparent [&_code]:p-0">{children}</pre>,
  table: ({ children }) => (
    <div className="my-8 overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b bg-muted/60 px-4 py-2.5 text-left font-medium">{children}</th>,
  td: ({ children }) => <td className="border-b px-4 py-2.5 align-top last:border-b-0">{children}</td>,
  // Images in articles: lazy, rounded, with the alt text as caption when there is one.
  img: ({ src, alt }) =>
    typeof src === "string" ? (
      <figure className="my-8 grid gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- article images can come from anywhere the editor allows */}
        <img src={src} alt={alt ?? ""} loading="lazy" className="w-full rounded-xl border" />
        {alt && <figcaption className="text-center text-sm text-muted-foreground">{alt}</figcaption>}
      </figure>
    ) : null,
  a: ({ href = "", children }) =>
    // Bare "www.example.nl" in the text becomes a link in GFM; examples shouldn't.
    href.startsWith("http://www") && !text(children).startsWith("http") ? (
      <span>{children}</span>
    ) : href.startsWith("/") ? (
      <Link href={href} className="font-medium text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary">
        {children}
      </Link>
    ) : (
      <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary">
        {children}
      </a>
    ),
};

/**
 * Article bodies from the admin panel. Raw HTML in the Markdown is not
 * rendered, so content can't inject markup or scripts.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("text-[1.0625rem] text-foreground/90 [&>*:first-child]:mt-0", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  );
}
