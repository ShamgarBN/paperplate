import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { BookOpen, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { RecipeCard } from "@/components/recipe/RecipeCard";
import { FilterRail } from "@/components/recipe/FilterRail";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  listCategoriesByKindMap,
  listRecipesWithCategories,
} from "@/lib/db/queries";
import { deleteRecipe } from "@/lib/db/recipeRepo";
import type { Recipe } from "@/lib/db/schema";
import { useLibraryStore } from "@/store/libraryStore";

export function LibraryRoute() {
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState<Recipe | null>(null);

  const recipesQuery = useQuery({
    queryKey: ["recipes"],
    queryFn: listRecipesWithCategories,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteRecipe(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      toast.success("Recipe deleted.");
      setConfirmDelete(null);
    },
    onError: (err) => {
      toast.error(
        `Could not delete recipe: ${err instanceof Error ? err.message : String(err)}`,
      );
    },
  });
  const categoriesQuery = useQuery({
    queryKey: ["categories-by-kind"],
    queryFn: listCategoriesByKindMap,
  });

  const search = useLibraryStore((s) => s.search);
  const cuisines = useLibraryStore((s) => s.selectedCuisines);
  const proteins = useLibraryStore((s) => s.selectedProteins);
  const types = useLibraryStore((s) => s.selectedTypes);
  const cookingMethods = useLibraryStore((s) => s.selectedCookingMethods);
  const effort = useLibraryStore((s) => s.selectedEffort);
  const tags = useLibraryStore((s) => s.selectedTags);
  const dietary = useLibraryStore((s) => s.selectedDietary);
  const minRating = useLibraryStore((s) => s.minRating);

  const cuisineNameById = useMemo(() => {
    const map = new Map<number, string>();
    const cuisines = categoriesQuery.data?.cuisine ?? [];
    for (const c of cuisines) map.set(c.id, c.name);
    return map;
  }, [categoriesQuery.data]);

  const filtered = useMemo(() => {
    const recipes = recipesQuery.data ?? [];
    const term = search.trim().toLowerCase();
    return recipes.filter((r) => {
      if (term) {
        const inTitle = r.title.toLowerCase().includes(term);
        const inIngredients = r.ingredientHaystack.includes(term);
        if (!inTitle && !inIngredients) return false;
      }
      if (minRating > 0 && (r.rating ?? 0) < minRating) return false;
      const ids = new Set(r.categoryIds);
      if (cuisines.length && !cuisines.some((c) => ids.has(c))) return false;
      if (proteins.length && !proteins.some((c) => ids.has(c))) return false;
      if (types.length && !types.some((c) => ids.has(c))) return false;
      if (
        cookingMethods.length &&
        !cookingMethods.some((c) => ids.has(c))
      )
        return false;
      if (effort.length && !effort.some((c) => ids.has(c))) return false;
      if (tags.length && !tags.some((c) => ids.has(c))) return false;
      if (dietary.length && !dietary.some((c) => ids.has(c))) return false;
      return true;
    });
  }, [
    recipesQuery.data,
    search,
    cuisines,
    proteins,
    types,
    cookingMethods,
    effort,
    tags,
    dietary,
    minRating,
  ]);

  const allCategories = useMemo(() => {
    const data = categoriesQuery.data;
    if (!data) return [];
    return [
      ...(data.cuisine ?? []),
      ...(data.protein ?? []),
      ...(data.type ?? []),
      ...(data.cooking_method ?? []),
      ...(data.effort ?? []),
      ...(data.tag ?? []),
      ...(data.dietary ?? []),
    ];
  }, [categoriesQuery.data]);

  if (recipesQuery.isLoading) {
    return (
      <div className="mx-auto flex max-w-7xl gap-6 px-6 py-6">
        <div className="hidden w-56 shrink-0 flex-col gap-6 px-2 lg:flex">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="mb-4">
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-3">
                <Skeleton className="aspect-[4/3] w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if ((recipesQuery.data ?? []).length === 0) {
    return <EmptyLibrary />;
  }

  return (
    <div className="mx-auto flex max-w-7xl gap-6 px-6 py-6">
      <FilterRail categories={allCategories} />
      <div className="flex-1 min-w-0">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {filtered.length} of {recipesQuery.data?.length ?? 0} recipes
          </p>
        </div>
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-card/40 p-12 text-center text-sm text-muted-foreground">
            No recipes match the current filters.
          </div>
        ) : (
          <motion.div
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: {
                transition: { staggerChildren: 0.04, delayChildren: 0.05 },
              },
            }}
          >
            {filtered.map((recipe) => {
              const cuisineId = recipe.categoryIds.find((id) =>
                cuisineNameById.has(id),
              );
              return (
                <motion.div
                  key={recipe.id}
                  variants={{
                    hidden: { opacity: 0, y: 12 },
                    show: { opacity: 1, y: 0 },
                  }}
                  transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                >
                  <RecipeCard
                    recipe={recipe}
                    cuisineName={
                      cuisineId ? cuisineNameById.get(cuisineId) : null
                    }
                    onDelete={(r) => setConfirmDelete(r)}
                  />
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>

      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(next) => !next && setConfirmDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Delete this recipe?
            </DialogTitle>
            <DialogDescription>
              {confirmDelete
                ? `"${confirmDelete.title}" and its ingredients, steps, and any meal-plan slots that use it will be removed. This cannot be undone.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (confirmDelete) deleteMutation.mutate(confirmDelete.id);
              }}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete recipe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyLibrary() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center justify-center px-6 py-24 text-center">
      <div className="rounded-full border bg-card/60 p-5 shadow-card">
        <BookOpen className="h-7 w-7 text-primary" />
      </div>
      <h2 className="mt-6 font-display text-3xl font-medium tracking-tight">
        Your library is empty
      </h2>
      <p className="mt-3 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
        Paste a recipe URL and Paperplate pulls the ingredients and instructions
        cleanly. Everything is stored locally on this Mac.
      </p>
      <div className="mt-6 flex gap-3">
        <Button asChild>
          <Link to="/import">
            <Plus className="h-4 w-4" />
            Add your first recipe
          </Link>
        </Button>
      </div>
    </div>
  );
}
