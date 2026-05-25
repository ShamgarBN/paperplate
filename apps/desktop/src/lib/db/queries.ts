import { supabase } from "@/lib/supabase";
import type { Recipe, Category, CategoryKind } from "@/lib/db/schema";

export interface RecipeWithCategoryIds extends Recipe {
  categoryIds: number[];
  /** Lower-case bag of canonical ingredient names + display names, used for
   *  fast client-side text search across the library. */
  ingredientHaystack: string;
}

/**
 * Aggregates each recipe's categories + ingredient haystack into a single
 * row for the library view's text search and filter rail. Done via three
 * round-trips so the shape stays predictable (PostgREST's nested embeds
 * would also work but make caller code branchier).
 */
export async function listRecipesWithCategories(): Promise<
  RecipeWithCategoryIds[]
> {
  const { data: recipes, error: recErr } = await supabase
    .from("recipes")
    .select("*")
    .order("title")
    .order("created_at", { ascending: false });
  if (recErr) throw recErr;
  if (!recipes || recipes.length === 0) return [];

  const recipeIds = recipes.map((r: any) => r.id as number);

  const [linksResp, ingResp] = await Promise.all([
    supabase
      .from("recipe_categories")
      .select("recipe_id, category_id")
      .in("recipe_id", recipeIds),
    supabase
      .from("recipe_ingredients")
      .select("recipe_id, item_canonical, item_display")
      .in("recipe_id", recipeIds),
  ]);
  if (linksResp.error) throw linksResp.error;
  if (ingResp.error) throw ingResp.error;

  const byRecipe = new Map<number, number[]>();
  for (const l of (linksResp.data ?? []) as any[]) {
    const arr = byRecipe.get(l.recipe_id) ?? [];
    arr.push(l.category_id);
    byRecipe.set(l.recipe_id, arr);
  }

  const haystackByRecipe = new Map<number, string>();
  for (const ing of (ingResp.data ?? []) as any[]) {
    const prev = haystackByRecipe.get(ing.recipe_id) ?? "";
    haystackByRecipe.set(
      ing.recipe_id,
      `${prev} ${ing.item_canonical} ${ing.item_display}`.toLowerCase(),
    );
  }

  return (recipes as Recipe[]).map((r) => ({
    ...r,
    categoryIds: byRecipe.get(r.id) ?? [],
    ingredientHaystack: haystackByRecipe.get(r.id) ?? "",
  }));
}

export async function listCategoriesByKindMap(): Promise<
  Record<CategoryKind, Category[]>
> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, kind, name, sort_order")
    .order("kind")
    .order("name");
  if (error) throw error;
  const out: Record<CategoryKind, Category[]> = {
    cuisine: [],
    protein: [],
    type: [],
    cooking_method: [],
    effort: [],
    tag: [],
    dietary: [],
  };
  for (const c of (data ?? []) as Category[]) out[c.kind].push(c);
  return out;
}
