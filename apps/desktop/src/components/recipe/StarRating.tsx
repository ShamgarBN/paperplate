import { Star } from "lucide-react";
import { cn } from "@/lib/cn";

interface Props {
  value: number;
  onChange: (next: number) => void;
  size?: "sm" | "md";
}

export function StarRating({ value, onChange, size = "md" }: Props) {
  const cls = size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";
  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          aria-label={`Set rating to ${star}`}
          onClick={() => onChange(value === star ? 0 : star)}
          className={cn(
            "rounded p-0.5 transition-colors",
            star <= value
              ? "text-amber-500"
              : "text-muted-foreground/40 hover:text-foreground",
          )}
        >
          <Star className={cn(cls, star <= value && "fill-current")} />
        </button>
      ))}
    </div>
  );
}
