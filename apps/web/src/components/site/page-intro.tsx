/** The opening of a website page: label, title and one paragraph. */
export function PageIntro({ eyebrow, title, intro, children }: { eyebrow?: string; title: string; intro?: string; children?: React.ReactNode }) {
  return (
    <header className="grid max-w-3xl gap-4">
      {eyebrow && <p className="text-sm font-medium text-primary">{eyebrow}</p>}
      <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">{title}</h1>
      {intro && <p className="text-lg text-muted-foreground">{intro}</p>}
      {children}
    </header>
  );
}
