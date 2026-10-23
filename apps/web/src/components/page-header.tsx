import { cn } from "@/lib/utils";

/**
 * Title, description and actions of a page. `hero` turns it into the brand
 * gradient banner used for the greeting on each dashboard's home.
 */
export function PageHeader({
  title,
  description,
  actions,
  hero = false,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  hero?: boolean;
  className?: string;
}) {
  if (hero) {
    return (
      <div className={cn("relative flex flex-wrap items-end justify-between gap-4 overflow-hidden rounded-2xl bg-brand-gradient px-6 py-7 text-white shadow-lg shadow-primary/15 sm:px-8", className)}>
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-white/10 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 left-1/3 size-64 rounded-full bg-magenta/30 blur-3xl" />
        <div className="relative grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          {description && <p className="text-white/80">{description}</p>}
        </div>
        {actions && <div className="relative flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    );
  }
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
