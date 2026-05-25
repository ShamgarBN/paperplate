import { supabase } from "@/lib/supabase";
import type {
  Category,
  CategoryKind,
  Recipe,
  RecipeIngredient,
  RecipeStep,
} from "@/lib/db/schema";
import { parseIngredient } from "@/lib/ingredients/parser";

export interface RecipeDraft {
  title: string;
  source_url: string | null;
  image_path: string | null;
  base_servings: number;
  prep_min: number | null;
  cook_min: number | null;
  total_min: number | null;
  difficulty: "easy" | "medium" | "hard" | null;
  description: string | null;
  notes: string | null;
  raw_html: string | null;
  ingredients: Array<{
    raw: string;
    quantity: number | null;
    unit: string | null;
    item_canonical: string;
    item_display: string;
    preparation: string | null;
    is_optional: boolean;
    section_name: string | null;
  }>;
  steps: Array<{
    text: string;
    section_name: string | null;
  }>;
  categoryIds: number[];
}

export interface RecipeWithDetails {
  recipe: Recipe;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  categoryIds: number[];
}

// Supabase returns booleans where the SQLite schema used 0|1. Convert at the
// repo boundary so existing UI code, the shopping aggregator, and tests don't
// need to know the data store changed.
function normalizeIngredient(row: any): RecipeIngredient {
  return {
    ...row,
    is_optional: row.is_optional ? 1 : 0,
  };
}

export async function listCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, kind, name, sort_order")
    .order("kind")
    .order("name");
  if (error) throw error;
  return (data ?? []) as Category[];
}

export async function listCategoriesByKind(
  kind: CategoryKind,
): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, kind, name, sort_order")
    .eq("kind", kind)
    .order("name");
  if (error) throw error;
  return (data ?? []) as Category[];
}

export async function createRecipe(draft: RecipeDraft): Promise<number> {
  const { data: recipeRow, error: recErr } = await supabase
    .from("recipes")
    .insert({
      title: draft.title,
      source_url: draft.source_url,
      image_path: draft.image_path,
      base_servings: draft.base_servings,
      prep_min: draft.prep_min,
      cook_min: draft.cook_min,
      total_min: draft.total_min,
      difficulty: draft.difficulty,
      description: draft.description,
      notes: draft.notes,
      raw_html: draft.raw_html,
    })
    .select("id")
    .single();
  if (recErr || !recipeRow) throw recErr ?? new Error("Insert failed");
  const recipeId = recipeRow.id as number;

  try {
    if (draft.ingredients.length > 0) {
      const rows = draft.ingredients.map((ing, i) => ({
        recipe_id: recipeId,
        position: i,
        raw_text: ing.raw,
        quantity: ing.quantity,
        unit: ing.unit,
        item_canonical: ing.item_canonical,
        item_display: ing.item_display,
        preparation: ing.preparation,
        is_optional: ing.is_optional,
        section_name: ing.section_name,
      }));
      const { error } = await supabase.from("recipe_ingredients").insert(rows);
      if (error) throw error;
    }
    if (draft.steps.length > 0) {
      const rows = draft.steps.map((step, i) => ({
        recipe_id: recipeId,
        position: i,
        text: step.text,
        section_name: step.section_name,
      }));
      const { error } = await supabase.from("recipe_steps").insert(rows);
      if (error) throw error;
    }
    if (draft.categoryIds.length > 0) {
      const rows = draft.categoryIds.map((category_id) => ({
        recipe_id: recipeId,
        category_id,
      }));
      // Composite-PK conflict means a duplicate was already there; ignore.
      const { error } = await supabase
        .from("recipe_categories")
        .upsert(rows, { ignoreDuplicates: true });
      if (error) throw error;
    }
    return recipeId;
  } catch (err) {
    // Best-effort cleanup so we don't leave a half-built recipe. ON DELETE
    // CASCADE cleans the children.
    try {
      await supabase.from("recipes").delete().eq("id", recipeId);
    } catch {
      /* ignore */
    }
    throw err;
  }
}

export async function getRecipe(
  id: number,
): Promise<RecipeWithDetails | null> {
  const { data: recipe, error: recErr } = await supabase
    .from("recipes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (recErr) throw recErr;
  if (!recipe) return null;

  const [ingResp, stpResp, catResp] = await Promise.all([
    supabase
      .from("recipe_ingredients")
      .select("*")
      .eq("recipe_id", id)
      .order("position"),
    supabase
      .from("recipe_steps")
      .select("*")
      .eq("recipe_id", id)
      .order("position"),
    supabase
      .from("recipe_categories")
      .select("category_id")
      .eq("recipe_id", id),
  ]);
  if (ingResp.error) throw ingResp.error;
  if (stpResp.error) throw stpResp.error;
  if (catResp.error) throw catResp.error;

  return {
    recipe: recipe as Recipe,
    ingredients: (ingResp.data ?? []).map(normalizeIngredient),
    steps: (stpResp.data ?? []) as RecipeStep[],
    categoryIds: (catResp.data ?? []).map((c: any) => c.category_id as number),
  };
}

export async function listRecipes(): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from("recipes")
    .select("*")
    .order("title")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Recipe[];
}

export async function deleteRecipe(id: number): Promise<void> {
  // Check whether the hero image is shared with another recipe before
  // queuing it for filesystem cleanup. Image cleanup itself stays on the
  // Tauri side (`@/lib/backup.deleteRecipeImage`) since the file lives in
  // the local images cache — Storage-based images will replace this later.
  const { data: ours } = await supabase
    .from("recipes")
    .select("image_path")
    .eq("id", id)
    .maybeSingle();
  const imagePath = (ours?.image_path as string | null | undefined) ?? null;
  const { error } = await supabase.from("recipes").delete().eq("id", id);
  if (error) throw error;
  if (imagePath) {
    const { count } = await supabase
      .from("recipes")
      .select("id", { count: "exact", head: true })
      .eq("image_path", imagePath);
    if ((count ?? 0) === 0) {
      try {
        const { deleteRecipeImage } = await import("@/lib/backup");
        await deleteRecipeImage(imagePath);
      } catch {
        /* orphan image is not worth surfacing */
      }
    }
  }
}

const RECIPE_UPDATE_COLUMNS = new Set([
  "title",
  "source_url",
  "image_path",
  "base_servings",
  "preferred_servings",
  "prep_min",
  "cook_min",
  "total_min",
  "difficulty",
  "description",
  "notes",
  "rating",
  "last_cooked_at",
]);

export async function updateRecipe(
  id: number,
  patch: Partial<{
    title: string;
    source_url: string | null;
    image_path: string | null;
    base_servings: number;
    preferred_servings: number | null;
    prep_min: number | null;
    cook_min: number | null;
    total_min: number | null;
    difficulty: "easy" | "medium" | "hard" | null;
    description: string | null;
    notes: string | null;
    rating: number | null;
    last_cooked_at: string | null;
  }>,
): Promise<void> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (RECIPE_UPDATE_COLUMNS.has(k)) clean[k] = v;
  }
  if (Object.keys(clean).length === 0) return;
  clean.updated_at = new Date().toISOString();
  const { error } = await supabase.from("recipes").update(clean).eq("id", id);
  if (error) throw error;
}

/**
 * Wholesale replace the recipe (header + ingredients + steps + categories).
 * Used by the edit flow so a partial save doesn't leave the recipe half
 * updated. Children are wiped then re-inserted; positions, sections, and
 * categories all come from the draft.
 */
export async function updateRecipeFull(
  id: number,
  draft: RecipeDraft,
): Promise<void> {
  const { error: updErr } = await supabase
    .from("recipes")
    .update({
      title: draft.title,
      source_url: draft.source_url,
      image_path: draft.image_path,
      base_servings: draft.base_servings,
      prep_min: draft.prep_min,
      cook_min: draft.cook_min,
      total_min: draft.total_min,
      difficulty: draft.difficulty,
      description: draft.description,
      notes: draft.notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updErr) throw updErr;

  const [delIng, delStp, delCat] = await Promise.all([
    supabase.from("recipe_ingredients").delete().eq("recipe_id", id),
    supabase.from("recipe_steps").delete().eq("recipe_id", id),
    supabase.from("recipe_categories").delete().eq("recipe_id", id),
  ]);
  if (delIng.error) throw delIng.error;
  if (delStp.error) throw delStp.error;
  if (delCat.error) throw delCat.error;

  if (draft.ingredients.length > 0) {
    const rows = draft.ingredients.map((ing, i) => ({
      recipe_id: id,
      position: i,
      raw_text: ing.raw,
      quantity: ing.quantity,
      unit: ing.unit,
      item_canonical: ing.item_canonical,
      item_display: ing.item_display,
      preparation: ing.preparation,
      is_optional: ing.is_optional,
      section_name: ing.section_name,
    }));
    const { error } = await supabase.from("recipe_ingredients").insert(rows);
    if (error) throw error;
  }
  if (draft.steps.length > 0) {
    const rows = draft.steps.map((step, i) => ({
      recipe_id: id,
      position: i,
      text: step.text,
      section_name: step.section_name,
    }));
    const { error } = await supabase.from("recipe_steps").insert(rows);
    if (error) throw error;
  }
  if (draft.categoryIds.length > 0) {
    const rows = draft.categoryIds.map((category_id) => ({
      recipe_id: id,
      category_id,
    }));
    const { error } = await supabase
      .from("recipe_categories")
      .upsert(rows, { ignoreDuplicates: true });
    if (error) throw error;
  }
}

export async function setRecipeCategories(
  recipeId: number,
  categoryIds: number[],
): Promise<void> {
  const { error: delErr } = await supabase
    .from("recipe_categories")
    .delete()
    .eq("recipe_id", recipeId);
  if (delErr) throw delErr;
  if (categoryIds.length === 0) return;
  const rows = categoryIds.map((category_id) => ({
    recipe_id: recipeId,
    category_id,
  }));
  const { error } = await supabase
    .from("recipe_categories")
    .upsert(rows, { ignoreDuplicates: true });
  if (error) throw error;
}

export async function addCategory(
  kind: Category["kind"],
  name: string,
): Promise<Category> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required");
  const { data: maxRow } = await supabase
    .from("categories")
    .select("sort_order")
    .eq("kind", kind)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = (maxRow?.sort_order ?? -1) + 1;
  const { data, error } = await supabase
    .from("categories")
    .insert({ kind, name: trimmed, sort_order: nextSort })
    .select("id, kind, name, sort_order")
    .single();
  if (error || !data) throw error ?? new Error("Insert failed");
  return data as Category;
}

export async function renameCategory(
  id: number,
  name: string,
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required");
  const { error } = await supabase
    .from("categories")
    .update({ name: trimmed })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteCategory(id: number): Promise<void> {
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw error;
}

export async function getCategoriesForRecipe(
  recipeId: number,
): Promise<Category[]> {
  const { data, error } = await supabase
    .from("recipe_categories")
    .select("category:categories(id, kind, name, sort_order)")
    .eq("recipe_id", recipeId);
  if (error) throw error;
  const rows = (data ?? [])
    .map((r: any) => (Array.isArray(r.category) ? r.category[0] : r.category))
    .filter((c: any): c is Category => c != null);
  rows.sort((a: Category, b: Category) =>
    a.kind === b.kind
      ? a.name.localeCompare(b.name)
      : a.kind.localeCompare(b.kind),
  );
  return rows;
}

/**
 * Re-runs the ingredient parser over every stored raw_text. Used after the
 * canonical lexicon is updated.
 */
export async function reparseIngredients(): Promise<void> {
  const { data, error } = await supabase
    .from("recipe_ingredients")
    .select("id, raw_text");
  if (error) throw error;
  for (const row of (data ?? []) as Array<{ id: number; raw_text: string }>) {
    const parsed = parseIngredient(row.raw_text);
    await supabase
      .from("recipe_ingredients")
      .update({
        quantity: parsed.quantity,
        unit: parsed.unit,
        item_canonical: parsed.itemCanonical,
        item_display: parsed.itemDisplay,
        preparation: parsed.preparation,
        is_optional: parsed.isOptional,
      })
      .eq("id", row.id);
  }
}
