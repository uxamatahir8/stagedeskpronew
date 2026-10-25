"use client";

import { ThemeProvider } from "next-themes";
import { Suspense, useSyncExternalStore } from "react";
import { ActivityBar } from "@/components/activity-bar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

const noop = () => () => {};

/**
 * next-themes renders an inline script that sets the theme before the first
 * paint. That only matters in the server HTML; when React creates the script
 * again in the browser (a later client render) it can't run and React 19 warns.
 * After hydration the script becomes a JSON data block: inert, and no warning.
 * The server snapshot keeps the first client render identical to the HTML.
 */
function useHydrated() {
  return useSyncExternalStore(noop, () => true, () => false);
}

export function Providers({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange scriptProps={hydrated ? { type: "application/json" } : undefined}>
      <TooltipProvider delayDuration={300}>
        <Suspense fallback={null}>
          <ActivityBar />
        </Suspense>
        {children}
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </ThemeProvider>
  );
}
