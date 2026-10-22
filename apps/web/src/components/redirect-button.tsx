"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** What an action that sends the user to Stripe returns: where to go, or why not. */
export type RedirectResult = { url: string } | { message: string };

export function useRedirect() {
  const [pending, startTransition] = useTransition();
  const go = (task: () => Promise<RedirectResult>) =>
    startTransition(async () => {
      const result = await task();
      if ("url" in result) window.location.assign(result.url);
      else toast.error(result.message);
    });
  return [pending, go] as const;
}

/** A button that runs a server action and follows the URL it returns (Stripe Checkout, onboarding, dashboards). */
export function RedirectButton({ action, ...props }: { action: () => Promise<RedirectResult> } & Omit<React.ComponentProps<typeof Button>, "onClick">) {
  const [pending, go] = useRedirect();
  return <Button {...props} disabled={pending || props.disabled} onClick={() => go(action)} />;
}
