import { StarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={cn("flex gap-0.5", className)} role="img" aria-label={`${rating} / 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <StarIcon key={i} className={cn("size-4", i < rating ? "fill-warning text-warning" : "text-muted-foreground/40")} aria-hidden />
      ))}
    </span>
  );
}
