import { useMemo } from "react";
import { Trash2, AlertCircle, Plus } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import type { ParsedIngredient } from "@/lib/ingredients/parser";
import { parseIngredient } from "@/lib/ingredients/parser";
import { cn } from "@/lib/cn";

export interface ReviewableIngredient extends ParsedIngredient {
  id: string;
}

interface Props {
  items: ReviewableIngredient[];
  onChange: (items: ReviewableIngredient[]) => void;
}

export function IngredientReviewer({ items, onChange }: Props) {
  const issues = useMemo(
    () =>
      items.map((item) => {
        const noQuantity = item.quantity === null;
        const tooShort = item.itemCanonical.length < 2;
        return { noQuantity, tooShort };
      }),
    [items],
  );

  const updateRaw = (id: string, raw: string) => {
    onChange(
      items.map((item) =>
        item.id === id ? { ...parseIngredient(raw), id } : item,
      ),
    );
  };

  const remove = (id: string) =>
    onChange(items.filter((item) => item.id !== id));

  const toggleOptional = (id: string) =>
    onChange(
      items.map((item) =>
        item.id === id ? { ...item, isOptional: !item.isOptional } : item,
      ),
    );

  const add = () => {
    const id = crypto.randomUUID();
    onChange([...items, { ...parseIngredient(""), id }]);
  };

  return (
    <div className="space-y-2">
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No ingredients yet. Add lines manually below.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item, idx) => (
            <li
              key={item.id}
              className="group grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 rounded-md border bg-card/40 px-2 py-1.5 hover:bg-card/70"
            >
              <span className="w-6 select-none text-right text-xs text-muted-foreground">
                {idx + 1}
              </span>
              <div className="flex items-center gap-2">
                <Input
                  value={item.raw}
                  onChange={(event) => updateRaw(item.id, event.target.value)}
                  className="h-8 border-transparent bg-transparent shadow-none focus-visible:bg-background focus-visible:ring-1"
                />
                {(issues[idx]?.noQuantity || issues[idx]?.tooShort) &&
                  !!item.raw && (
                    <span
                      title="Could not detect a quantity for this line. The shopping list will keep it as-is."
                      className={cn(
                        "shrink-0 text-amber-500",
                        "transition-opacity",
                      )}
                    >
                      <AlertCircle className="h-4 w-4" />
                    </span>
                  )}
              </div>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Checkbox
                  checked={item.isOptional}
                  onCheckedChange={() => toggleOptional(item.id)}
                />
                optional
              </label>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => remove(item.id)}
                aria-label="Remove ingredient"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="outline" size="sm" onClick={add} className="gap-1.5">
        <Plus className="h-3.5 w-3.5" />
        Add ingredient
      </Button>
    </div>
  );
}
