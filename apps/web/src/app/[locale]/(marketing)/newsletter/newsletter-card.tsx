import { CheckCircle2Icon, CircleAlertIcon, MailIcon } from "lucide-react";

/** The small centered card the confirm and unsubscribe pages use. */
export function NewsletterCard({ tone, title, children }: { tone: "success" | "error" | "neutral"; title: string; children: React.ReactNode }) {
  const Icon = tone === "success" ? CheckCircle2Icon : tone === "error" ? CircleAlertIcon : MailIcon;
  return (
    <main className="mx-auto grid w-full max-w-xl px-5 py-20 sm:py-28">
      <div className="grid gap-4 rounded-2xl border bg-card p-8 shadow-sm">
        <Icon className={tone === "success" ? "size-8 text-success" : tone === "error" ? "size-8 text-destructive" : "size-8 text-primary"} aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {children}
      </div>
    </main>
  );
}
