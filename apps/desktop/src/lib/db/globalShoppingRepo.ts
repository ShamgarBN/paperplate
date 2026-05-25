import { supabase } from "@/lib/supabase";
import { buildShoppingList, type ShoppingItem } from "@/lib/shopping";
import { loadAisleByCanonical } from "@/lib/db/shoppingRepo";
import type {
  MealPlanSlot,
  Recipe,
  RecipeIngredient,
  ShoppingListExtraItem,
} from "@/lib/db/schema";

const EXTRA_ID_PREFIX = "extra-";

export interface GlobalShoppingListResult {
  items: ShoppingItem[];
  checked: Record<string, boolean>;
  recipes: Array<{
    entryId: number;
    recipe: Recipe;
    scaledServings: number;
  }>;
}

function normalizeIngredient(row: any): RecipeIngredient {
  return { ...row, is_optional: row.is_optional ? 1 : 0 };
}

function normalizeExtra(row: any): ShoppingListExtraItem {
  return { ...row, is_checked: row.is_checked ? 1 : 0 };
}

export async function generateGlobalShoppingList(): Promise<GlobalShoppingListResult> {
  const [entriesResp, extrasResp] = await Promise.all([
    supabase
      .from("shopping_list_recipes")
      .select("id, recipe_id, scaled_servings, added_at")
      .order("added_at", { ascending: false })
      .order("id", { ascending: false }),
    supabase
      .from("shopping_list_items")
      .select("id, name, quantity, unit, aisle, is_checked, added_at, checked_at")
      .order("added_at", { ascending: false })
      .order("id", { ascending: false }),
  ]);
  if (entriesResp.error) throw entriesResp.error;
  if (extrasResp.error) throw extrasResp.error;

  const entries = (entriesResp.data ?? []) as Array<{
    id: number;
    recipe_id: number;
    scaled_servings: number | null;
    added_at: string;
  }>;
  const extras = ((extrasResp.data ?? []) as any[]).map(normalizeExtra);

  let recipesById = new Map<number, Recipe>();
  let ingredientsByRecipeId = new Map<number, RecipeIngredient[]>();
  if (entries.length > 0) {
    const ids = Array.from(new Set(entries.map((e) => e.recipe_id)));
    const [rResp, iResp] = await Promise.all([
      supabase.from("recipes").select("*").in("id", ids),
      supabase
        .from("recipe_ingredients")
        .select("*")
        .in("recipe_id", ids)
        .order("position"),
    ]);
    if (rResp.error) throw rResp.error;
    if (iResp.error) throw iResp.error;
    recipesById = new Map((rResp.data ?? []).map((r: any) => [r.id, r as Recipe]));
    for (const ing of ((iResp.data ?? []) as any[]).map(normalizeIngredient)) {
      const arr = ingredientsByRecipeId.get(ing.recipe_id) ?? [];
      arr.push(ing);
      ingredientsByRecipeId.set(ing.recipe_id, arr);
    }
  }

  // Adapt each shopping-list recipe entry into a synthetic MealPlanSlot so
  // we can reuse the per-plan aggregator without duplicating its logic.
  const slots: MealPlanSlot[] = entries.map((entry, index) => ({
    id: entry.id ?? index + 1,
    plan_id: 0,
    date: entry.added_at.slice(0, 10),
    slot: "dinner",
    recipe_id: entry.recipe_id,
    scaled_servings:
      entry.scaled_servings ??
      recipesById.get(entry.recipe_id)?.base_servings ??
      null,
    is_locked: 0,
  }));

  const aisleByCanonical = await loadAisleByCanonical();
  const recipeItems = buildShoppingList({
    slots,
    recipesById,
    ingredientsByRecipeId,
    aisleByCanonical,
  });

  const { data: checks } = await supabase
    .from("shopping_list_checks")
    .select("item_id, is_checked");
  const checkedSet = new Set(
    ((checks ?? []) as any[])
      .filter((c) => c.is_checked)
      .map((c) => c.item_id as string),
  );

  const extraItems: ShoppingItem[] = extras.map((row) => ({
    id: `${EXTRA_ID_PREFIX}${row.id}`,
    itemCanonical: row.name.toLowerCase(),
    itemDisplay: row.name,
    totalQuantity: row.quantity,
    totalUnit: null,
    display: formatExtraDisplay(row),
    aisle: row.aisle || "Other",
    isOptional: false,
    perishable: false,
    contributors: ["Added by you"],
  }));

  const items = [...recipeItems, ...extraItems];
  const checkedMap: Record<string, boolean> = {};
  for (const item of recipeItems) {
    checkedMap[item.id] = checkedSet.has(item.id);
  }
  for (const row of extras) {
    checkedMap[`${EXTRA_ID_PREFIX}${row.id}`] = row.is_checked === 1;
  }

  const recipes = entries
    .map((entry) => {
      const recipe = recipesById.get(entry.recipe_id);
      if (!recipe) return null;
      return {
        entryId: entry.id,
        recipe,
        scaledServings: entry.scaled_servings ?? recipe.base_servings,
      };
    })
    .filter(
      (x): x is { entryId: number; recipe: Recipe; scaledServings: number } =>
        x !== null,
    );

  return { items, checked: checkedMap, recipes };
}

function formatExtraDisplay(row: ShoppingListExtraItem): string {
  const quantityPart =
    row.quantity != null
      ? row.unit
        ? `${row.quantity} ${row.unit} `
        : `${row.quantity} `
      : "";
  return `${quantityPart}${row.name}`.trim();
}

export async function setItemChecked(
  itemId: string,
  isChecked: boolean,
): Promise<void> {
  if (itemId.startsWith(EXTRA_ID_PREFIX)) {
    const numericId = Number(itemId.slice(EXTRA_ID_PREFIX.length));
    if (!Number.isFinite(numericId)) return;
    const { error } = await supabase
      .from("shopping_list_items")
      .update({
        is_checked: isChecked,
        checked_at: isChecked ? new Date().toISOString() : null,
      })
      .eq("id", numericId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("shopping_list_checks").upsert(
    {
      item_id: itemId,
      is_checked: isChecked,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "item_id" },
  );
  if (error) throw error;
}

export async function addRecipeToShoppingList(
  recipeId: number,
  scaledServings: number | null,
): Promise<void> {
  const { error } = await supabase
    .from("shopping_list_recipes")
    .insert({ recipe_id: recipeId, scaled_servings: scaledServings });
  if (error) throw error;
}

/**
 * Push every assigned recipe in a plan onto the global shopping list,
 * tagging each new row with `from_plan_id` so it can be cleanly removed
 * later. Skips plan-recipes already on the list (matched by plan + recipe).
 */
export async function addPlanToGlobalShoppingList(
  planId: number,
): Promise<{ inserted: number }> {
  // Read every attached recipe across the plan via embedded slot filter.
  const { data: attachments, error: attErr } = await supabase
    .from("meal_plan_slot_recipes")
    .select("recipe_id, scaled_servings, slot:meal_plan_slots!inner(plan_id)")
    .eq("slot.plan_id", planId);
  if (attErr) throw attErr;

  // Deduplicate by recipe; keep the largest servings count seen so the
  // aggregated quantity covers every slot.
  const byRecipe = new Map<
    number,
    { recipeId: number; servings: number | null }
  >();
  for (const a of (attachments ?? []) as any[]) {
    const existing = byRecipe.get(a.recipe_id);
    const servings = a.scaled_servings ?? null;
    if (!existing) {
      byRecipe.set(a.recipe_id, { recipeId: a.recipe_id, servings });
    } else if (servings != null && (existing.servings ?? 0) < servings) {
      existing.servings = servings;
    }
  }

  const { data: existingRows } = await supabase
    .from("shopping_list_recipes")
    .select("recipe_id")
    .eq("from_plan_id", planId);
  const alreadyHave = new Set(
    ((existingRows ?? []) as any[]).map((r) => r.recipe_id as number),
  );

  const inserts = Array.from(byRecipe.values())
    .filter((r) => !alreadyHave.has(r.recipeId))
    .map((r) => ({
      recipe_id: r.recipeId,
      scaled_servings: r.servings,
      from_plan_id: planId,
    }));
  if (inserts.length === 0) return { inserted: 0 };
  const { error } = await supabase
    .from("shopping_list_recipes")
    .insert(inserts);
  if (error) throw error;
  return { inserted: inserts.length };
}

export async function removePlanFromGlobalShoppingList(
  planId: number,
): Promise<{ removed: number }> {
  const { data: before } = await supabase
    .from("shopping_list_recipes")
    .select("id")
    .eq("from_plan_id", planId);
  const { error } = await supabase
    .from("shopping_list_recipes")
    .delete()
    .eq("from_plan_id", planId);
  if (error) throw error;
  return { removed: (before ?? []).length };
}

export async function countPlanEntriesOnGlobalList(
  planId: number,
): Promise<number> {
  const { count, error } = await supabase
    .from("shopping_list_recipes")
    .select("id", { count: "exact", head: true })
    .eq("from_plan_id", planId);
  if (error) throw error;
  return count ?? 0;
}

export async function removeRecipeFromShoppingList(
  entryId: number,
): Promise<void> {
  const { error } = await supabase
    .from("shopping_list_recipes")
    .delete()
    .eq("id", entryId);
  if (error) throw error;
}

export async function updateRecipeScaledServings(
  entryId: number,
  scaledServings: number,
): Promise<void> {
  if (!Number.isFinite(scaledServings) || scaledServings <= 0) {
    throw new Error("scaledServings must be a positive number");
  }
  const rounded = Math.max(1, Math.round(scaledServings));
  const { error } = await supabase
    .from("shopping_list_recipes")
    .update({ scaled_servings: rounded })
    .eq("id", entryId);
  if (error) throw error;
}

export interface ExtraItemInput {
  name: string;
  quantity: number | null;
  unit: string | null;
  aisle: string;
}

export async function addExtraItem(input: ExtraItemInput): Promise<void> {
  const name = input.name.trim().slice(0, 200);
  if (!name) throw new Error("Item name is required");
  const aisle = input.aisle.trim().slice(0, 60) || "Other";
  const unit = input.unit ? input.unit.trim().slice(0, 20) || null : null;
  const { error } = await supabase.from("shopping_list_items").insert({
    name,
    quantity: input.quantity,
    unit,
    aisle,
  });
  if (error) throw error;
}

export async function removeExtraItem(id: number): Promise<void> {
  const { error } = await supabase
    .from("shopping_list_items")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function setExtraItemAisle(
  id: number,
  aisleName: string,
): Promise<void> {
  const aisle = aisleName.trim().slice(0, 60) || "Other";
  const { error } = await supabase
    .from("shopping_list_items")
    .update({ aisle })
    .eq("id", id);
  if (error) throw error;
}

export async function clearCheckedExtraItems(): Promise<number> {
  const { data, error } = await supabase
    .from("shopping_list_items")
    .delete()
    .eq("is_checked", true)
    .select("id");
  if (error) throw error;
  return (data ?? []).length;
}

export function extractExtraId(itemId: string): number | null {
  if (!itemId.startsWith(EXTRA_ID_PREFIX)) return null;
  const n = Number(itemId.slice(EXTRA_ID_PREFIX.length));
  return Number.isFinite(n) ? n : null;
}
