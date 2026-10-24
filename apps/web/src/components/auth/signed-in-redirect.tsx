import { Suspense } from "react";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getSession } from "@/lib/viewer";

async function Check() {
  const session = await getSession();
  if (session) redirect({ href: "/app", locale: (await getLocale()) as "nl" | "en" });
  return null;
}

/**
 * Sign-in, sign-up and password pages are for signed-out visitors; someone
 * who is signed in goes straight to their dashboard.
 */
export function SignedInRedirect() {
  return (
    <Suspense fallback={null}>
      <Check />
    </Suspense>
  );
}
