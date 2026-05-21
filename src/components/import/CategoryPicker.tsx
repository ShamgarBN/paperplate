import { useMemo } from "react";
import type { Category, CategoryKind } from "@/lib/db/schema";
import { cn } from "@/lib/cn";

interface Props {
  categories: Category[];
  selected: Set<number>;
  onToggle: (id: number) => void;
}

const KIND_ORDER: Array<{ kind: CategoryKind; label: string }> = [
  { kind: "cuisine", label: "Cuisine" },
  { kind: "protein", label: "Protein" },
  { kind: "type", label: "Type" },
  { kind: "effort", label: "Effort" },
  { kind: "dietary", label: "Dietary" },
  { kind: "tag", label: "Tags" },
];

export function CategoryPicker({ categories, selected, onToggle }: Props) {
  const grouped = useMemo(() => {
    const map = new Map<CategoryKind, Category[]>();
    for (const c of categories) {
      const arr = map.get(c.kind) ?? [];
      arr.push(c);
      map.set(c.kind, arr);
    }
    return map;
  }, [categories]);

  return (
    <div className="space-y-5">
      {KIND_ORDER.map(({ kind, label }) => {
        const items = grouped.get(kind);
        if (!items || items.length === 0) return null;
        return (
          <div key={kind}>
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {items.map((c) => {
                const isOn = selected.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onToggle(c.id)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition-colors",
                      isOn
                        ? "border-transparent bg-primary text-primary-foreground"
                        : "border-input bg-background hover:bg-accent hover:text-accent-foreground",
                    )}
                    aria-pressed={isOn}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
