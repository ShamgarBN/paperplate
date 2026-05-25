import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChefHat,
  ChevronLeft,
  Clock,
  ExternalLink,
  Pencil,
  Printer,
  ShoppingBasket,
  StickyNote,
  Timer,
  Trash2,
  Undo2,
  UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { Separator } from "@/components/ui/Separator";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { CategoryPicker } from "@/components/import/CategoryPicker";
import { MultiplierBar } from "@/components/recipe/MultiplierBar";
import { ServingStepper } from "@/components/recipe/ServingStepper";
import { StarRating } from "@/components/recipe/StarRating";
import {
  deleteRecipe,
  getCategoriesForRecipe,
  getRecipe,
  listCategories,
  setRecipeCategories,
  updateRecipe,
} from "@/lib/db/recipeRepo";
import { scaleIngredients } from "@/lib/scaling";
import { toRenderableHtml } from "@/lib/richtext";
import { localImageUrl } from "@/lib/assetUrl";
import { printCurrentWindow } from "@/lib/print";
import { addRecipeToShoppingList } from "@/lib/db/globalShoppingRepo";
import { format, isSameDay as dfIsSameDay } from "date-fns";

/**
 * Returns true when an ISO timestamp falls on the same calendar day as
 * `reference`. Wraps date-fns' implementation so we can hand it raw string
 * values from the DB without polluting the call sites with parse calls.
 */
function isSameDay(iso: string, reference: Date): boolean {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  return dfIsSameDay(date, reference);
}

/**
 * Turn a stored source URL into a tidy domain label like "nytimes.com" or
 * "cooking.nytimes.com". Falls back to the raw string when the URL fails
 * to parse so the user still sees *something* useful in the header. We
 * intentionally strip the `www.` prefix because nobody calls it "www.
 * nytimes.com" out loud, but we leave other subdomains alone since some
 * sites (e.g. "cooking.nytimes.com", "blog.serious eats.com") rely on
 * them to disambiguate the section.
 */
function prettySourceLabel(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return rawUrl;
  }
}

export function RecipeDetailRoute() {
  const { recipeId } = useParams({ from: "/recipes/$recipeId" });
  const id = Number(recipeId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const recipeQuery = useQuery({
    queryKey: ["recipe", id],
    queryFn: () => getRecipe(id),
    enabled: Number.isFinite(id),
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: listCategories,
  });

  const recipeCategoriesQuery = useQuery({
    queryKey: ["recipe-categories", id],
    queryFn: () => getCategoriesForRecipe(id),
    enabled: Number.isFinite(id),
  });

  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [servings, setServings] = useState<number | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [draftNotes, setDraftNotes] = useState("");
  const [editingCategories, setEditingCategories] = useState(false);
  const [draftCategoryIds, setDraftCategoryIds] = useState<Set<number>>(
    new Set(),
  );
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    if (recipeQuery.data?.recipe.image_path) {
      localImageUrl(recipeQuery.data.recipe.image_path).then(setImgUrl);
    } else {
      setImgUrl(null);
    }
    // Hydrate servings from preferred_servings (sticky) when present, falling
    // back to base_servings on first visit. Subsequent stepper changes flow
    // through the mutation below and update the source of truth in DB.
    const r = recipeQuery.data?.recipe;
    if (r) {
      setServings(
        (current) => current ?? r.preferred_servings ?? r.base_servings,
      );
    }
    if (recipeQuery.data?.recipe.notes != null) {
      setDraftNotes(recipeQuery.data.recipe.notes);
    }
  }, [recipeQuery.data]);

  useEffect(() => {
    if (recipeCategoriesQuery.data) {
      setDraftCategoryIds(
        new Set(recipeCategoriesQuery.data.map((c) => c.id)),
      );
    }
  }, [recipeCategoriesQuery.data]);

  const showError = (label: string) => (err: unknown) =>
    toast.error(
      `${label}: ${err instanceof Error ? err.message : String(err)}`,
    );

  const ratingMutation = useMutation({
    mutationFn: async (next: number) =>
      updateRecipe(id, { rating: next === 0 ? null : next }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipe", id] });
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
    },
    onError: showError("Could not update rating"),
  });

  // `previousCookedAtRef` remembers what `last_cooked_at` looked like before
  // the user pressed "Cooked today" so they can undo accidental presses.
  // We store it in component state so re-renders triggered by the mutation
  // don't clobber it (a `useRef` would be cleared by route remounts).
  const [previousCookedAt, setPreviousCookedAt] = useState<
    string | null | undefined
  >(undefined);

  const cookMutation = useMutation({
    mutationFn: async (params: { nextValue: string | null }) =>
      updateRecipe(id, { last_cooked_at: params.nextValue }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["recipe", id] });
      if (variables.nextValue == null) {
        toast.success("Undone — last cooked date restored.");
        setPreviousCookedAt(undefined);
      } else {
        toast.success("Marked as cooked today.");
      }
    },
    onError: showError("Could not update last cooked date"),
  });

  const handleCookedToday = () => {
    // Capture the prior timestamp so we can roll back if the user clicked
    // by mistake. We do this BEFORE writing so the rollback works whether
    // the prior value was null or an earlier ISO date.
    setPreviousCookedAt(recipeQuery.data?.recipe.last_cooked_at ?? null);
    cookMutation.mutate({ nextValue: new Date().toISOString() });
  };

  const handleUndoCooked = () => {
    // `previousCookedAt === undefined` shouldn't be reachable from the UI
    // (button is hidden), but guard defensively anyway.
    if (previousCookedAt === undefined) return;
    cookMutation.mutate({ nextValue: previousCookedAt });
  };

  // The undo button is available immediately after the user marks the
  // recipe cooked today; it disappears when they leave the page or after
  // we successfully revert.
  const justMarkedCookedToday =
    previousCookedAt !== undefined &&
    recipeQuery.data?.recipe.last_cooked_at != null &&
    isSameDay(recipeQuery.data.recipe.last_cooked_at, new Date());

  const notesMutation = useMutation({
    mutationFn: async (notes: string) =>
      updateRecipe(id, { notes: notes.trim() || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipe", id] });
      setEditingNotes(false);
      toast.success("Notes saved.");
    },
    onError: showError("Could not save notes"),
  });

  const categoriesMutation = useMutation({
    mutationFn: async (ids: number[]) => setRecipeCategories(id, ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipe-categories", id] });
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      setEditingCategories(false);
      toast.success("Categories updated.");
    },
    onError: showError("Could not update categories"),
  });

  const addToShoppingMutation = useMutation({
    mutationFn: async () =>
      addRecipeToShoppingList(
        id,
        servings ?? recipeQuery.data?.recipe.base_servings ?? null,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["global-shopping"] });
      toast.success("Added to shopping list.");
    },
    onError: showError("Could not add to shopping list"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => deleteRecipe(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      toast.success("Recipe deleted.");
      navigate({ to: "/library" });
    },
    onError: showError("Could not delete recipe"),
  });

  // Persist the user's preferred default scaling for this recipe. Debounced so
  // tapping the stepper rapidly only writes once when the value settles.
  useEffect(() => {
    const r = recipeQuery.data?.recipe;
    if (!r || servings == null) return;
    const desired =
      servings === r.base_servings ? null : servings;
    if (desired === (r.preferred_servings ?? null)) return;
    const handle = setTimeout(() => {
      updateRecipe(id, { preferred_servings: desired }).catch(() => {
        // non-fatal — the stepper still shows the in-memory value
      });
    }, 600);
    return () => clearTimeout(handle);
  }, [servings, recipeQuery.data?.recipe, id]);

  const scaledIngredients = useMemo(() => {
    const data = recipeQuery.data;
    if (!data) return [];
    return scaleIngredients(
      data.ingredients,
      data.recipe.base_servings,
      servings ?? data.recipe.base_servings,
    );
  }, [recipeQuery.data, servings]);

  if (recipeQuery.isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-6 pb-16">
        <div className="flex items-center justify-between py-4">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-32" />
        </div>
        <Skeleton className="mb-6 aspect-[16/7] w-full rounded-2xl" />
        <Skeleton className="mb-3 h-9 w-2/3" />
        <Skeleton className="mb-6 h-4 w-1/2" />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!recipeQuery.data) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h2 className="font-display text-2xl">Recipe not found</h2>
        <Button asChild className="mt-4">
          <Link to="/library">Back to library</Link>
        </Button>
      </div>
    );
  }

  const { recipe, steps } = recipeQuery.data;
  const recipeCategories = recipeCategoriesQuery.data ?? [];
  const cuisines = recipeCategories.filter((c) => c.kind === "cuisine");
  const proteins = recipeCategories.filter((c) => c.kind === "protein");
  const types = recipeCategories.filter((c) => c.kind === "type");
  const cookingMethods = recipeCategories.filter(
    (c) => c.kind === "cooking_method",
  );
  const efforts = recipeCategories.filter((c) => c.kind === "effort");
  const dietary = recipeCategories.filter((c) => c.kind === "dietary");
  const tags = recipeCategories.filter((c) => c.kind === "tag");

  return (
    <div className="mx-auto max-w-5xl px-6 pb-16" data-print-root>
      <div
        className="flex items-center justify-between py-4"
        data-print-hide
      >
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="gap-1.5 text-muted-foreground"
        >
          <Link to="/library">
            <ChevronLeft className="h-4 w-4" />
            Library
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          {justMarkedCookedToday ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleUndoCooked}
              disabled={cookMutation.isPending}
              className="gap-1.5"
            >
              <Undo2 className="h-4 w-4" />
              Undo cooked today
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCookedToday}
              disabled={cookMutation.isPending}
              className="gap-1.5"
            >
              <ChefHat className="h-4 w-4" />
              Cooked today
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => addToShoppingMutation.mutate()}
            disabled={addToShoppingMutation.isPending}
            className="gap-1.5"
          >
            <ShoppingBasket className="h-4 w-4" />
            Add to shopping list
          </Button>
          <Button
            asChild
            variant="ghost"
            size="icon"
            aria-label="Edit recipe"
          >
            <Link
              to="/recipes/$recipeId/edit"
              params={{ recipeId: String(id) }}
            >
              <Pencil className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Print recipe"
            onClick={() => {
              printCurrentWindow().catch((err) => {
                toast.error(
                  `Could not open print dialog: ${err instanceof Error ? err.message : String(err)}`,
                );
              });
            }}
          >
            <Printer className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete recipe"
            onClick={() => setShowDelete(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {imgUrl && (
        <div className="mb-6 aspect-[16/7] w-full overflow-hidden rounded-2xl bg-muted shadow-card">
          <img src={imgUrl} alt="" className="h-full w-full object-cover" />
        </div>
      )}

      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          {cuisines.map((c) => (
            <Badge key={c.id} variant="default">
              {c.name}
            </Badge>
          ))}
          {proteins.map((c) => (
            <Badge key={c.id} variant="secondary">
              {c.name}
            </Badge>
          ))}
          {types.map((c) => (
            <Badge key={c.id} variant="soft">
              {c.name}
            </Badge>
          ))}
          {cookingMethods.map((c) => (
            <Badge key={c.id} variant="outline">
              {c.name}
            </Badge>
          ))}
          {efforts.map((c) => (
            <Badge key={c.id} variant="outline">
              {c.name}
            </Badge>
          ))}
          {dietary.map((c) => (
            <Badge key={c.id} variant="outline" className="border-dashed">
              {c.name}
            </Badge>
          ))}
          {tags.map((c) => (
            <Badge key={c.id} variant="outline">
              #{c.name}
            </Badge>
          ))}
        </div>
        <h1 className="mt-3 font-display text-4xl font-medium leading-tight tracking-tight">
          {recipe.title}
        </h1>
        {recipe.description && (
          <p className="mt-3 max-w-2xl text-pretty text-[15px] leading-relaxed text-muted-foreground">
            {recipe.description}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          {recipe.total_min != null && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {recipe.total_min} min total
            </span>
          )}
          {recipe.prep_min != null && (
            <span className="flex items-center gap-1.5">
              <Timer className="h-3.5 w-3.5" />
              {recipe.prep_min} prep
            </span>
          )}
          {recipe.cook_min != null && (
            <span className="flex items-center gap-1.5">
              <UtensilsCrossed className="h-3.5 w-3.5" />
              {recipe.cook_min} cook
            </span>
          )}
          {recipe.last_cooked_at && (
            <span className="text-xs">
              Last cooked{" "}
              {format(new Date(recipe.last_cooked_at), "MMM d, yyyy")}
            </span>
          )}
          {recipe.source_url && (
            <a
              href={recipe.source_url}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1.5 text-primary hover:underline"
            >
              Source: {prettySourceLabel(recipe.source_url)}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
        <div className="mt-3 flex items-center gap-3" data-print-hide>
          <StarRating
            value={recipe.rating ?? 0}
            onChange={(v) => ratingMutation.mutate(v)}
          />
          <span className="text-xs text-muted-foreground">
            {recipe.rating ? `${recipe.rating}/5` : "Unrated"}
          </span>
        </div>
      </header>

      <Separator className="my-2" />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[300px_1fr]">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-2xl tracking-tight">
              Ingredients
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({servings ?? recipe.base_servings} servings)
              </span>
            </h2>
            <div className="flex flex-col items-end gap-2" data-print-hide>
              <ServingStepper
                base={recipe.base_servings}
                value={servings ?? recipe.base_servings}
                onChange={(next) => setServings(next)}
              />
              <MultiplierBar
                base={recipe.base_servings}
                value={servings ?? recipe.base_servings}
                onChange={(next) => setServings(next)}
              />
            </div>
          </div>
          <IngredientList ingredients={scaledIngredients} />
        </section>

        <section>
          <h2 className="mb-4 font-display text-2xl tracking-tight">
            Instructions
          </h2>
          {steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No instructions saved.
            </p>
          ) : (
            <StepList steps={steps} />
          )}
        </section>
      </div>

      <Separator className="my-10" data-print-hide />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2" data-print-hide>
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-display text-lg">
                <StickyNote className="h-4 w-4 text-muted-foreground" />
                Notes
              </h3>
              {!editingNotes && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5"
                  onClick={() => setEditingNotes(true)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
              )}
            </div>
            {editingNotes ? (
              <div className="space-y-2">
                <Textarea
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                  rows={5}
                />
                <div className="flex items-center justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDraftNotes(recipe.notes ?? "");
                      setEditingNotes(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => notesMutation.mutate(draftNotes)}
                    disabled={notesMutation.isPending}
                  >
                    Save
                  </Button>
                </div>
              </div>
            ) : recipe.notes ? (
              <p className="whitespace-pre-line text-sm text-muted-foreground">
                {recipe.notes}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Add tasting notes, swaps, or memories for next time.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg">Categories</h3>
              {!editingCategories && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5"
                  onClick={() => setEditingCategories(true)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
              )}
            </div>
            {editingCategories ? (
              <div className="space-y-3">
                <CategoryPicker
                  categories={categoriesQuery.data ?? []}
                  selected={draftCategoryIds}
                  onToggle={(catId) => {
                    const next = new Set(draftCategoryIds);
                    if (next.has(catId)) next.delete(catId);
                    else next.add(catId);
                    setDraftCategoryIds(next);
                  }}
                />
                <div className="flex items-center justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDraftCategoryIds(
                        new Set(
                          (recipeCategoriesQuery.data ?? []).map((c) => c.id),
                        ),
                      );
                      setEditingCategories(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      categoriesMutation.mutate([...draftCategoryIds])
                    }
                    disabled={categoriesMutation.isPending}
                  >
                    Save
                  </Button>
                </div>
              </div>
            ) : recipeCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No categories yet.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {recipeCategories.map((c) => (
                  <Badge key={c.id} variant="soft">
                    {c.name}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this recipe?</DialogTitle>
            <DialogDescription>
              "{recipe.title}" and any meal plan slots that reference it will be
              cleared. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Render an ingredient list grouped by sub-recipe section. Rows with
 * `sectionName === null` are emitted under no header; rows with a
 * name are emitted under a small uppercase header so multi-component
 * recipes ("Cake", "Frosting") visually separate.
 */
function IngredientList({
  ingredients,
}: {
  ingredients: import("@/lib/scaling").ScaledIngredient[];
}) {
  const groups = groupBySection(ingredients, (i) => i.sectionName);
  return (
    <div className="space-y-4">
      {groups.map((group, gIdx) => (
        <div key={`${group.name ?? "none"}-${gIdx}`}>
          {group.name !== null && (
            <h3 className="mb-2 font-display text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {group.name}
            </h3>
          )}
          <ul className="space-y-1.5 text-[15px] leading-relaxed">
            {group.items.map((ing) => (
              <li
                key={ing.id}
                className="flex items-start gap-2 border-b border-border/50 py-1.5 last:border-b-0"
              >
                <span className="text-foreground">{ing.display}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * Render an instruction list grouped by sub-recipe section. Step
 * numbers restart within each section so the user has a clear "step
 * 1 of Cake / step 1 of Frosting" mental model — matching most
 * printed cookbook conventions.
 */
function StepList({
  steps,
}: {
  steps: Array<{ id: number; position: number; text: string; section_name: string | null }>;
}) {
  const groups = groupBySection(steps, (s) => s.section_name);
  return (
    <div className="space-y-6">
      {groups.map((group, gIdx) => (
        <div key={`${group.name ?? "none"}-${gIdx}`}>
          {group.name !== null && (
            <h3 className="mb-3 font-display text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {group.name}
            </h3>
          )}
          <ol className="space-y-4 text-[15px] leading-relaxed">
            {group.items.map((step, idx) => (
              <li key={step.id} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-display text-sm font-medium text-primary">
                  {idx + 1}
                </span>
                {/*
                  Step text is sanitized HTML produced by our editor.
                  `toRenderableHtml` runs every read through DOMPurify
                  with the same allowlist used at save time — this is
                  the single XSS boundary for instruction rendering.
                */}
                <p
                  className="flex-1 text-pretty"
                  dangerouslySetInnerHTML={{
                    __html: toRenderableHtml(step.text),
                  }}
                />
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

/**
 * Walk an ordered array, batching consecutive items that share a
 * section name into the same group. Order within groups is preserved.
 * A `null` section becomes a group with `name: null` — the renderer
 * treats it as the unlabelled top-level list.
 */
function groupBySection<T>(
  items: T[],
  getSection: (item: T) => string | null,
): Array<{ name: string | null; items: T[] }> {
  const groups: Array<{ name: string | null; items: T[] }> = [];
  for (const item of items) {
    const section = getSection(item);
    const last = groups[groups.length - 1];
    if (last && last.name === section) {
      last.items.push(item);
    } else {
      groups.push({ name: section, items: [item] });
    }
  }
  return groups;
}
