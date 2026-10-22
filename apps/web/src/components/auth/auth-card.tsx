import { cn } from "@/lib/utils";

export function AuthCard({
  title,
  description,
  children,
  footer,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid w-full max-w-sm gap-6", className)}>
      <div className="grid gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
      {footer && <div className="text-sm text-muted-foreground">{footer}</div>}
    </div>
  );
}

export function FormMessage({ tone = "error", children }: { tone?: "error" | "success"; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-lg px-3 py-2 text-sm",
        tone === "error" ? "bg-destructive/10 text-destructive" : "bg-success/12 text-success",
      )}
    >
      {children}
    </p>
  );
}
