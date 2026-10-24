import { editorialFont } from "@/components/content/editorial-font";

export default function HelpLayout({ children }: LayoutProps<"/[locale]/help">) {
  return <div className={editorialFont.variable}>{children}</div>;
}
