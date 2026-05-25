import { useEffect, useMemo, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { Search } from "lucide-react";
import type { Recipe } from "@/lib/db/schema";
import { Input } from "@/components/ui/Input";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { localImageUrl } from "@/lib/assetUrl";
import { cn } from "@/lib/cn";

interface Props {
  recipes: Recipe[];
  /** Recipe id currently mid-drag, used to fade the source. */
  activeRecipeId: number | null;
}

/**
 * Compact library panel rendered alongside the meal-plan calendar so the user
 * can drag a recipe straight onto a date+slot. Each card uses dnd-kit's
 * `useDraggable` with an id of `lib-${recipe.id}` to disambiguate from the
 * existing slot-to-slot drag system.
 */
export function LibraryPanel({ recipes, activeRecipeId }: Props) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recipes;
    return recipes.filter((r) => r.title.toLowerCase().includes(q));
  }, [recipes, query]);

  return (
    <aside className="flex h-full min-h-0 w-72 shrink-0 flex-col gap-3 rounded-lg border bg-card/40 p-3">
      <div>
        <h3 className="font-display text-sm tracking-tight">Library</h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Drag a recipe onto any slot.
        </p>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          className="h-8 pl-8 text-xs"
        />
      </div>
      <ScrollArea className="-mx-3 flex-1 px-3">
        {filtered.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            {recipes.length === 0
              ? "Add some recipes first."
              : "No matches."}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {filtered.map((recipe) => (
              <DraggableLibraryRow
                key={recipe.id}
                recipe={recipe}
                isDragging={activeRecipeId === recipe.id}
              />
            ))}
          </ul>
        )}
      </ScrollArea>
    </aside>
  );
}

function DraggableLibraryRow({
  recipe,
  isDragging,
}: {
  recipe: Recipe;
  isDragging: boolean;
}) {
  const draggable = useDraggable({
    id: `lib-${recipe.id}`,
    data: { kind: "library", recipeId: recipe.id },
  });
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  useEffect(() => {
    if (recipe.image_path) localImageUrl(recipe.image_path).then(setImgUrl);
    else setImgUrl(null);
  }, [recipe.image_path]);
  return (
    <li
      ref={draggable.setNodeRef}
      style={{
        transform: draggable.transform
          ? `translate(${draggable.transform.x}px, ${draggable.transform.y}px)`
          : undefined,
        opacity: isDragging ? 0.4 : 1,
      }}
      {...draggable.listeners}
      {...draggable.attributes}
      className={cn(
        "flex cursor-grab items-center gap-2 rounded-md border bg-background p-2 transition-colors hover:bg-accent active:cursor-grabbing",
      )}
    >
      <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-muted">
        {imgUrl ? (
          <img src={imgUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-display text-xs text-muted-foreground/40">
            {recipe.title.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium leading-tight">
          {recipe.title}
        </p>
        <p className="truncate text-[10px] text-muted-foreground">
          {recipe.total_min ? `${recipe.total_min} min` : ""}
          {recipe.total_min && recipe.base_servings ? " · " : ""}
          {recipe.base_servings ? `${recipe.base_servings}` : ""}
        </p>
      </div>
    </li>
  );
}
