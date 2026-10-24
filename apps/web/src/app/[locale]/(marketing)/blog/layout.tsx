import { editorialFont } from "@/components/content/editorial-font";

export default function BlogLayout({ children }: LayoutProps<"/[locale]/blog">) {
  return <div className={editorialFont.variable}>{children}</div>;
}
