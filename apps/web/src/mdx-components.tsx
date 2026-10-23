import type { MDXComponents } from "mdx/types";
import { Link } from "@/i18n/navigation";

/**
 * How Markdown in blog posts, help articles and the changelog renders: the
 * same type scale and colours as the rest of the site. Internal links keep
 * the reader's language.
 */
const components: MDXComponents = {
  h2: (props) => <h2 className="mt-10 mb-3 text-2xl font-semibold tracking-tight text-balance" {...props} />,
  h3: (props) => <h3 className="mt-8 mb-2 text-lg font-semibold" {...props} />,
  p: (props) => <p className="my-4 leading-7" {...props} />,
  ul: (props) => <ul className="my-4 list-disc space-y-1.5 pl-6" {...props} />,
  ol: (props) => <ol className="my-4 list-decimal space-y-1.5 pl-6" {...props} />,
  li: (props) => <li className="leading-7" {...props} />,
  strong: (props) => <strong className="font-semibold text-foreground" {...props} />,
  blockquote: (props) => <blockquote className="my-6 border-l-2 border-primary pl-4 text-muted-foreground italic" {...props} />,
  hr: () => <hr className="my-10 border-border" />,
  code: (props) => <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]" {...props} />,
  table: (props) => (
    <div className="my-6 overflow-x-auto rounded-lg border">
      <table className="w-full text-sm" {...props} />
    </div>
  ),
  th: (props) => <th className="border-b bg-muted/50 px-3 py-2 text-left font-medium" {...props} />,
  td: (props) => <td className="border-b px-3 py-2 align-top" {...props} />,
  a: ({ href = "", children, ...props }) =>
    href.startsWith("/") ? (
      <Link href={href} className="font-medium text-primary underline-offset-4 hover:underline">
        {children}
      </Link>
    ) : (
      <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-4 hover:underline" {...props}>
        {children}
      </a>
    ),
};

export function useMDXComponents(): MDXComponents {
  return components;
}
