import type { MDXContent } from "mdx/types";

/** The changelog is one MDX file per language; newest release first. */
export async function loadChangelog(locale: "nl" | "en"): Promise<MDXContent> {
  return (await import(`./changelog.${locale}.mdx`)).default;
}
