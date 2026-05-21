import { cn } from "@/lib/cn";

/**
 * Subtle animated placeholder for async content. Render a small grid of these
 * in the shape of the eventual content so the page doesn't reflow.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted/70",
        className,
      )}
      aria-hidden
      {...props}
    />
  );
}
