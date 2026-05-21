import { useMemo } from "react";
import type { Category, CategoryKind } from "@/lib/db/schema";
import { useLibraryStore } from "@/store/libraryStore";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Star } from "lucide-react";

const SECTIONS: Array<{
  kind: CategoryKind;
  label: string;
  storeKey: "cuisines" | "proteins" | "types" | "effort" | "tags" | "dietary";
}> = [
  { kind: "cuisine", label: "Cuisine", storeKey: "cuisines" },
  { kind: "protein", label: "Protein", storeKey: "proteins" },
  { kind: "type", label: "Type", storeKey: "types" },
  { kind: "effort", label: "Effort", storeKey: "effort" },
  { kind: "dietary", label: "Dietary", storeKey: "dietary" },
  { kind: "tag", label: "Tags", storeKey: "tags" },
];

interface FilterRailProps {
  categories: Category[];
}

export function FilterRail({ categories }: FilterRailProps) {
  const grouped = useMemo(() => {
    const map = new Map<CategoryKind, Category[]>();
    for (const c of categories) {
      const arr = map.get(c.kind) ?? [];
      arr.push(c);
      map.set(c.kind, arr);
    }
    return map;
  }, [categories]);

  const cuisines = useLibraryStore((s) => s.selectedCuisines);
  const proteins = useLibraryStore((s) => s.selectedProteins);
  const types = useLibraryStore((s) => s.selectedTypes);
  const effort = useLibraryStore((s) => s.selectedEffort);
  const tags = useLibraryStore((s) => s.selectedTags);
  const dietary = useLibraryStore((s) => s.selectedDietary);
  const minRating = useLibraryStore((s) => s.minRating);
  const toggle = useLibraryStore((s) => s.toggleSelected);
  const setMinRating = useLibraryStore((s) => s.setMinRating);
  const reset = useLibraryStore((s) => s.reset);

  const selectedByKey: Record<string, number[]> = {
    cuisines,
    proteins,
    types,
    effort,
    tags,
    dietary,
  };

  const totalActive =
    cuisines.length +
    proteins.length +
    types.length +
    effort.length +
    tags.length +
    dietary.length +
    (minRating > 0 ? 1 : 0);

  return (
    <aside className="hidden w-56 shrink-0 flex-col gap-6 px-2 lg:flex">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Filters
        </h3>
        {totalActive > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={reset}
          >
            Clear
          </Button>
        )}
      </div>

      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Min rating
        </div>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              aria-label={`Min rating ${value}`}
              onClick={() => setMinRating(minRating === value ? 0 : value)}
              className={cn(
                "p-0.5 transition-colors",
                value <= minRating
                  ? "text-amber-500"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Star
                className={cn(
                  "h-4 w-4",
                  value <= minRating && "fill-current",
                )}
              />
            </button>
          ))}
        </div>
      </div>

      {SECTIONS.map(({ kind, label, storeKey }) => {
        const items = grouped.get(kind) ?? [];
        if (items.length === 0) return null;
        const selected = selectedByKey[storeKey] ?? [];
        return (
          <div key={kind}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {label}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {items.map((c) => {
                const on = selected.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggle(storeKey, c.id)}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                      on
                        ? "border-transparent bg-primary text-primary-foreground"
                        : "border-input bg-background hover:bg-accent",
                    )}
                    aria-pressed={on}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </aside>
  );
}
