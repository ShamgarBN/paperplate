import { getDb } from "@/lib/db/client";
import type { Recipe, Category, CategoryKind } from "@/lib/db/schema";

export interface RecipeWithCategoryIds extends Recipe {
  categoryIds: number[];
  /** Lower-case bag of canonical ingredient names + display names, used for
   *  fast client-side text search across the library. */
  ingredientHaystack: string;
}

/**
 * Aggregates each recipe's categories into a single column for fast filtering
 * in the library view. Done with two queries instead of GROUP_CONCAT to keep
 * the type simple and dialect-portable.
 */
export async function listRecipesWithCategories(): Promise<
  RecipeWithCategoryIds[]
> {
  const db = await getDb();
  // Default ordering is alphabetical by title (case-insensitive), with
  // created_at as a stable tiebreaker so two recipes with the same name
  // never swap places between renders. The library UI doesn't expose a
  // user-controlled sort yet; if/when it does we can branch here.
  const recipes = await db.select<Recipe[]>(
    "SELECT * FROM recipes ORDER BY title COLLATE NOCASE ASC, created_at DESC",
  );
  if (recipes.length === 0) return [];

  const placeholders = recipes.map((_, i) => `$${i + 1}`).join(",");
  const recipeIdParams = recipes.map((r) => r.id);

  const links = await db.select<
    Array<{ recipe_id: number; category_id: number }>
  >(
    `SELECT recipe_id, category_id FROM recipe_categories WHERE recipe_id IN (${placeholders})`,
    recipeIdParams,
  );

  const ingredients = await db.select<
    Array<{ recipe_id: number; item_canonical: string; item_display: string }>
  >(
    `SELECT recipe_id, item_canonical, item_display FROM recipe_ingredients WHERE recipe_id IN (${placeholders})`,
    recipeIdParams,
  );

  const byRecipe = new Map<number, number[]>();
  for (const l of links) {
    const arr = byRecipe.get(l.recipe_id) ?? [];
    arr.push(l.category_id);
    byRecipe.set(l.recipe_id, arr);
  }

  const haystackByRecipe = new Map<number, string>();
  for (const ing of ingredients) {
    const prev = haystackByRecipe.get(ing.recipe_id) ?? "";
    haystackByRecipe.set(
      ing.recipe_id,
      `${prev} ${ing.item_canonical} ${ing.item_display}`.toLowerCase(),
    );
  }

  return recipes.map((r) => ({
    ...r,
    categoryIds: byRecipe.get(r.id) ?? [],
    ingredientHaystack: haystackByRecipe.get(r.id) ?? "",
  }));
}

export async function listCategoriesByKindMap(): Promise<
  Record<CategoryKind, Category[]>
> {
  const db = await getDb();
  // Alphabetical within each kind. We keep `sort_order` in the SELECT so
  // any consumer that wants to override the default ordering still has it
  // available, but the database returns the list pre-sorted so the UI
  // doesn't need to re-sort downstream.
  const all = await db.select<Category[]>(
    "SELECT id, kind, name, sort_order FROM categories ORDER BY kind, name COLLATE NOCASE ASC",
  );
  const out: Record<CategoryKind, Category[]> = {
    cuisine: [],
    protein: [],
    type: [],
    cooking_method: [],
    effort: [],
    tag: [],
    dietary: [],
  };
  for (const c of all) out[c.kind].push(c);
  return out;
}
