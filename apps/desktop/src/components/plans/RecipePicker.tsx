import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { listRecipes } from "@/lib/db/recipeRepo";
import type { Recipe } from "@/lib/db/schema";
import { localImageUrl } from "@/lib/assetUrl";

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onPick: (recipe: Recipe) => void;
  title?: string;
}

export function RecipePicker({ open, onOpenChange, onPick, title }: Props) {
  const recipesQuery = useQuery({
    queryKey: ["recipes-flat"],
    queryFn: listRecipes,
  });
  const recipes = recipesQuery.data ?? [];
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recipes;
    return recipes.filter((r) => r.title.toLowerCase().includes(q));
  }, [recipes, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0">
        <DialogHeader className="border-b p-4">
          <DialogTitle className="text-base">
            {title ?? "Pick a recipe"}
          </DialogTitle>
        </DialogHeader>
        <div className="relative px-4 pt-4">
          <Search className="pointer-events-none absolute left-7 top-7 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recipes..."
            className="pl-9"
            autoFocus
          />
        </div>
        <ScrollArea className="max-h-80 px-2 py-2">
          <ul className="space-y-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                {recipes.length === 0
                  ? "Add some recipes first."
                  : "No matches."}
              </li>
            ) : (
              filtered.map((recipe) => (
                <PickerRow
                  key={recipe.id}
                  recipe={recipe}
                  onPick={() => onPick(recipe)}
                />
              ))
            )}
          </ul>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function PickerRow({
  recipe,
  onPick,
}: {
  recipe: Recipe;
  onPick: () => void;
}) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  useEffect(() => {
    if (recipe.image_path) localImageUrl(recipe.image_path).then(setImgUrl);
    else setImgUrl(null);
  }, [recipe.image_path]);
  return (
    <li>
      <button
        onClick={onPick}
        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent"
      >
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
          {imgUrl ? (
            <img src={imgUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-display text-sm text-muted-foreground/40">
              {recipe.title.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{recipe.title}</p>
          <p className="text-xs text-muted-foreground">
            {recipe.total_min ? `${recipe.total_min} min` : ""}
            {recipe.total_min && recipe.base_servings ? " · " : ""}
            {recipe.base_servings ? `${recipe.base_servings} servings` : ""}
          </p>
        </div>
      </button>
    </li>
  );
}
