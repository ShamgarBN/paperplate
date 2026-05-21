import { getDb } from "@/lib/db/client";
import type {
  Recipe,
  RecipeIngredient,
  Category,
} from "@/lib/db/schema";
import { isPerishable } from "@/lib/ingredients/canonicalize";
import type { PlannerRecipe } from "@/lib/planner/types";

/**
 * Loads every recipe in the library shaped for the auto-selector. The shape
 * keeps things in-memory so the heuristic can iterate quickly across restarts.
 */
export async function loadPlannerRecipes(): Promise<PlannerRecipe[]> {
  const db = await getDb();
  const recipes = await db.select<Recipe[]>(
    "SELECT id, title, base_servings, last_cooked_at FROM recipes",
  );
  if (recipes.length === 0) return [];

  const ingredients = await db.select<RecipeIngredient[]>(
    "SELECT recipe_id, item_canonical FROM recipe_ingredients WHERE is_optional = 0",
  );
  const ingByRecipe = new Map<number, string[]>();
  for (const ing of ingredients) {
    if (!ing.item_canonical) continue;
    const list = ingByRecipe.get(ing.recipe_id) ?? [];
    list.push(ing.item_canonical);
    ingByRecipe.set(ing.recipe_id, list);
  }

  const cats = await db.select<
    Array<{ recipe_id: number; kind: Category["kind"]; name: string }>
  >(
    `SELECT rc.recipe_id, c.kind, c.name
     FROM recipe_categories rc
     JOIN categories c ON c.id = rc.category_id`,
  );
  const catsByRecipe = new Map<number, { kind: Category["kind"]; name: string }[]>();
  for (const c of cats) {
    const list = catsByRecipe.get(c.recipe_id) ?? [];
    list.push({ kind: c.kind, name: c.name });
    catsByRecipe.set(c.recipe_id, list);
  }

  return recipes.map((r) => {
    const items = ingByRecipe.get(r.id) ?? [];
    const canonical = new Set(items);
    const perishable = new Set(items.filter((i) => isPerishable(i)));
    const recipeCats = catsByRecipe.get(r.id) ?? [];
    const cuisine =
      recipeCats.find((c) => c.kind === "cuisine")?.name.toLowerCase() ?? null;
    const proteins = recipeCats
      .filter((c) => c.kind === "protein")
      .map((c) => c.name.toLowerCase());
    const types = recipeCats
      .filter((c) => c.kind === "type")
      .map((c) => c.name.toLowerCase());
    return {
      id: r.id,
      title: r.title,
      baseServings: r.base_servings,
      cuisine,
      proteins,
      types,
      canonicalIngredients: canonical,
      perishableIngredients: perishable,
      lastCookedAt: r.last_cooked_at,
    } satisfies PlannerRecipe;
  });
}
