import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The StageDesk Pro logo. `full` is the framed wordmark (purple on light
 * backgrounds, white on dark ones or when `onDark`); `mark` is the square
 * DJ-desk icon, which works on any background.
 */
export function Logo({ variant = "full", onDark = false, className, priority = false }: { variant?: "full" | "mark"; onDark?: boolean; className?: string; priority?: boolean }) {
  if (variant === "mark") {
    return <Image src="/brand/mark.png" alt="StageDesk Pro" width={512} height={512} priority={priority} className={cn("size-8 rounded-lg", className)} />;
  }
  // The wordmark is 640×220 (about 2.9 : 1).
  if (onDark) {
    return <Image src="/brand/logo-white.png" alt="StageDesk Pro" width={640} height={220} priority={priority} className={cn("h-9 w-auto", className)} />;
  }
  return (
    <>
      <Image src="/brand/logo.png" alt="StageDesk Pro" width={640} height={220} priority={priority} className={cn("h-9 w-auto dark:hidden", className)} />
      <Image src="/brand/logo-white.png" alt="StageDesk Pro" width={640} height={220} priority={priority} className={cn("hidden h-9 w-auto dark:block", className)} />
    </>
  );
}
