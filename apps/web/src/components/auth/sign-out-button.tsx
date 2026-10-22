"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton({
  next = "/sign-in",
  ...props
}: React.ComponentProps<typeof Button> & { next?: string }) {
  const router = useRouter();
  return (
    <Button
      type="button"
      {...props}
      onClick={async () => {
        await authClient.signOut();
        router.push(next);
        router.refresh();
      }}
    />
  );
}
