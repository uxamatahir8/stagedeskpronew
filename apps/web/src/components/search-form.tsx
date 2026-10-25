"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * A GET search/filter form that updates the URL in the app instead of
 * reloading the page: the fields become query parameters (empty ones left
 * out) and the server components re-render with them. Works without
 * JavaScript too, as a plain GET form.
 */
export function SearchForm({ className, children, ...props }: Omit<React.ComponentProps<"form">, "onSubmit" | "action" | "method">) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  return (
    <form
      {...props}
      method="get"
      aria-busy={pending}
      className={cn(className, pending && "opacity-80 transition-opacity")}
      onSubmit={(e) => {
        e.preventDefault();
        const params = new URLSearchParams();
        for (const [key, value] of new FormData(e.currentTarget)) {
          if (typeof value === "string" && value.trim() !== "") params.append(key, value.trim());
        }
        const query = params.toString();
        start(() => router.push(query ? `${pathname}?${query}` : pathname, { scroll: false }));
      }}
    >
      {children}
    </form>
  );
}
