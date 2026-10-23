import "../globals.css";

/**
 * Root layout for agency websites, separate from StageDesk's own pages: no
 * StageDesk chrome, fonts or theme. The page sets the language on its content.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body className="min-h-svh bg-white antialiased">{children}</body>
    </html>
  );
}
