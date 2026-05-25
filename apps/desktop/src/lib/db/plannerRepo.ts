import { supabase } from "@/lib/supabase";
import type { Category } from "@/lib/db/schema";
import { isPerishable } from "@/lib/ingredients/canonicalize";
import type { PlannerRecipe } from "@/lib/planner/types";

/**
 * Loads every recipe in the library shaped for the auto-selector. Keeps the
 * heuristic in-memory so restarts iterate fast.
 */
export async function loadPlannerRecipes(): Promise<PlannerRecipe[]> {
  const { data: recipes, error: recErr } = await supabase
    .from("recipes")
    .select("id, title, base_servings, last_cooked_at");
  if (recErr) throw recErr;
  if (!recipes || recipes.length === 0) return [];

  const { data: ingredients, error: ingErr } = await supabase
    .from("recipe_ingredients")
    .select("recipe_id, item_canonical")
    .eq("is_optional", false);
  if (ingErr) throw ingErr;

  const ingByRecipe = new Map<number, string[]>();
  for (const ing of (ingredients ?? []) as any[]) {
    if (!ing.item_canonical) continue;
    const list = ingByRecipe.get(ing.recipe_id) ?? [];
    list.push(ing.item_canonical);
    ingByRecipe.set(ing.recipe_id, list);
  }

  const { data: catLinks, error: catErr } = await supabase
    .from("recipe_categories")
    .select("recipe_id, category:categories(kind, name)");
  if (catErr) throw catErr;

  const catsByRecipe = new Map<
    number,
    { kind: Category["kind"]; name: string }[]
  >();
  for (const row of (catLinks ?? []) as any[]) {
    const cat = Array.isArray(row.category) ? row.category[0] : row.category;
    if (!cat) continue;
    const list = catsByRecipe.get(row.recipe_id) ?? [];
    list.push({ kind: cat.kind, name: cat.name });
    catsByRecipe.set(row.recipe_id, list);
  }

  return (recipes as any[]).map((r) => {
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
