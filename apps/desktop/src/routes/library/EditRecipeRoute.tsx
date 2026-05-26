import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  blankDraft,
  DraftEditor,
  type DraftState,
} from "@/components/import/DraftEditor";
import type { ReviewableIngredient } from "@/components/import/IngredientReviewer";
import {
  getRecipe,
  listCategories,
  updateRecipeFull,
} from "@/lib/db/recipeRepo";
import { uploadFromUrl } from "@/lib/uploadImage";
import { parseIngredient } from "@/lib/ingredients/parser";
import { isRichTextEmpty } from "@/lib/richtext";

/**
 * Hydrates the DraftEditor with an existing recipe's full content and writes
 * it back through `updateRecipeFull` on save. Reuses the import wizard UI so
 * the editing surface is identical to the create surface.
 */
export function EditRecipeRoute() {
  const { recipeId } = useParams({ from: "/recipes/$recipeId/edit" });
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

  const [draft, setDraft] = useState<DraftState>(blankDraft);
  const [hydrated, setHydrated] = useState(false);
  const [downloadingImage, setDownloadingImage] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (hydrated) return;
    const data = recipeQuery.data;
    if (!data) return;
    // Re-run the parser so we get the full set of derived fields (canonical,
    // perishability, indivisibility, aisle, weight) without needing to store
    // them denormalized in DB. The DB-stored values are the source of truth
    // for display; the rest is regenerated.
    const ingredients: ReviewableIngredient[] = data.ingredients.map((ing) => ({
      ...parseIngredient(ing.raw_text),
      id: crypto.randomUUID(),
      raw: ing.raw_text,
      quantity: ing.quantity,
      unit: ing.unit,
      itemCanonical: ing.item_canonical,
      itemDisplay: ing.item_display,
      preparation: ing.preparation,
      isOptional: ing.is_optional === 1,
      sectionName: ing.section_name,
    }));
    setDraft({
      title: data.recipe.title,
      sourceUrl: data.recipe.source_url ?? "",
      // Show the cached image instead of a remote URL — caching is one-way
      // here; user can clear and re-import if they need a different image.
      imageUrl: null,
      imagePath: data.recipe.image_path,
      servings: data.recipe.base_servings,
      prepMin: data.recipe.prep_min,
      cookMin: data.recipe.cook_min,
      totalMin: data.recipe.total_min,
      difficulty: data.recipe.difficulty,
      description: data.recipe.description ?? "",
      notes: data.recipe.notes ?? "",
      rawHtml: data.recipe.raw_html,
      ingredients,
      steps: data.steps.map((s) => ({
        id: crypto.randomUUID(),
        text: s.text,
        sectionName: s.section_name,
      })),
      selectedCategoryIds: new Set(data.categoryIds),
    });
    setHydrated(true);
  }, [recipeQuery.data, hydrated]);

  const toggleCategory = (catId: number) =>
    setDraft((d) => {
      const next = new Set(d.selectedCategoryIds);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return { ...d, selectedCategoryIds: next };
    });

  const handleDownloadImage = async () => {
    if (!draft.imageUrl) return;
    setDownloadingImage(true);
    try {
      const result = await uploadFromUrl(draft.imageUrl);
      setDraft((d) => ({ ...d, imagePath: result.relativePath }));
    } catch (err) {
      toast.error(
        `Image download failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setDownloadingImage(false);
    }
  };

  const handleSave = async () => {
    if (!draft.title.trim()) {
      toast.error("Recipe needs a title.");
      return;
    }
    if (draft.ingredients.length === 0) {
      toast.error("A recipe needs at least one ingredient.");
      return;
    }
    setSaving(true);
    try {
      await updateRecipeFull(id, {
        title: draft.title.trim(),
        source_url: draft.sourceUrl.trim() || null,
        image_path: draft.imagePath,
        base_servings: Math.max(1, Math.round(draft.servings)),
        prep_min: draft.prepMin,
        cook_min: draft.cookMin,
        total_min: draft.totalMin,
        difficulty: draft.difficulty,
        description: draft.description.trim() || null,
        notes: draft.notes.trim() || null,
        raw_html: draft.rawHtml,
        ingredients: draft.ingredients
          .filter((ing) => ing.raw.trim().length > 0)
          .map((ing) => ({
            raw: ing.raw,
            quantity: ing.quantity,
            unit: ing.unit,
            item_canonical: ing.itemCanonical,
            item_display: ing.itemDisplay,
            preparation: ing.preparation,
            is_optional: ing.isOptional,
            section_name: ing.sectionName,
          })),
        steps: draft.steps
          .filter((s) => !isRichTextEmpty(s.text))
          .map((s) => ({ text: s.text, section_name: s.sectionName })),
        categoryIds: [...draft.selectedCategoryIds],
      });
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      queryClient.invalidateQueries({ queryKey: ["recipe", id] });
      queryClient.invalidateQueries({ queryKey: ["recipe-categories", id] });
      queryClient.invalidateQueries({ queryKey: ["recipes-flat"] });
      toast.success("Recipe updated.");
      navigate({ to: "/recipes/$recipeId", params: { recipeId: String(id) } });
    } catch (err) {
      toast.error(
        `Could not save changes: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setSaving(false);
    }
  };

  const categories = categoriesQuery.data ?? [];

  // Stable backLink so a "Cancel" trip lands the user back on detail. Kept as
  // a memo to avoid re-creating the closure on every keystroke.
  const cancelHandler = useMemo(
    () => () =>
      navigate({ to: "/recipes/$recipeId", params: { recipeId: String(id) } }),
    [navigate, id],
  );

  if (recipeQuery.isLoading || !hydrated) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-6 py-8">
        <Skeleton className="h-9 w-1/3" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
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

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-4">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="gap-1.5 text-muted-foreground"
        >
          <Link
            to="/recipes/$recipeId"
            params={{ recipeId: String(id) }}
          >
            <ChevronLeft className="h-4 w-4" />
            Back to recipe
          </Link>
        </Button>
      </div>
      <header className="mb-6">
        <h2 className="font-display text-3xl font-medium tracking-tight">
          Edit recipe
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tweak anything — title, timings, ingredients, steps, or categories.
        </p>
      </header>
      <DraftEditor
        draft={draft}
        setDraft={setDraft}
        categories={categories}
        toggleCategory={toggleCategory}
        onCancel={cancelHandler}
        onSave={handleSave}
        onDownloadImage={handleDownloadImage}
        downloadingImage={downloadingImage}
        saving={saving}
        cancelLabel="Cancel"
        saveLabel="Save changes"
      />
    </div>
  );
}
