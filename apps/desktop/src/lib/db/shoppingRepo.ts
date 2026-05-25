import { supabase } from "@/lib/supabase";
import { buildShoppingList, type ShoppingItem } from "@/lib/shopping";
import { knownAisleEntries } from "@/lib/ingredients/canonicalize";
import type {
  MealPlanSlot,
  Recipe,
  RecipeIngredient,
} from "@/lib/db/schema";

interface ShoppingListWithChecks {
  items: ShoppingItem[];
  checked: Record<string, boolean>;
  generatedAt: string;
  snapshotId: number | null;
}

/**
 * Backfill ingredient_aisle_map with the bundled defaults if it's empty
 * (first run after a fresh Supabase project). Idempotent — if rows already
 * exist we leave them alone.
 */
export async function ensureAisleSeed(): Promise<void> {
  const { count } = await supabase
    .from("ingredient_aisle_map")
    .select("item_canonical", { count: "exact", head: true });
  if ((count ?? 0) > 0) return;

  const { data: aisles } = await supabase.from("aisles").select("id, name");
  const aisleByName = new Map(
    (aisles ?? []).map((a: any) => [a.name as string, a.id as number]),
  );
  const rows = knownAisleEntries()
    .map((entry) => ({
      item_canonical: entry.canonical,
      aisle_id: aisleByName.get(entry.aisle),
    }))
    .filter((r): r is { item_canonical: string; aisle_id: number } =>
      r.aisle_id != null,
    );
  if (rows.length === 0) return;
  // Insert in chunks; PostgREST limits payload size.
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    await supabase
      .from("ingredient_aisle_map")
      .upsert(slice, { onConflict: "item_canonical", ignoreDuplicates: true });
  }
}

export async function loadAisleByCanonical(): Promise<Map<string, string>> {
  await ensureAisleSeed();
  const { data, error } = await supabase
    .from("ingredient_aisle_map")
    .select("item_canonical, aisle:aisles(name)");
  if (error) throw error;
  const map = new Map<string, string>();
  for (const row of (data ?? []) as any[]) {
    const aisleName = Array.isArray(row.aisle)
      ? row.aisle[0]?.name
      : row.aisle?.name;
    if (aisleName) map.set(row.item_canonical, aisleName);
  }
  return map;
}

export async function generateShoppingList(
  planId: number,
): Promise<ShoppingListWithChecks> {
  // Pull every meal_plan_slot_recipes attachment joined to its parent slot.
  // Each attachment becomes one virtual slot for the aggregator (its id is
  // unique, which keeps passthrough item ids distinct).
  const { data: attachments, error: attErr } = await supabase
    .from("meal_plan_slot_recipes")
    .select(
      "id, recipe_id, scaled_servings, position, slot:meal_plan_slots!inner(id, plan_id, date, slot)",
    )
    .eq("slot.plan_id", planId)
    .order("position");
  if (attErr) throw attErr;

  const slots: MealPlanSlot[] = [];
  for (const row of (attachments ?? []) as any[]) {
    const slot = Array.isArray(row.slot) ? row.slot[0] : row.slot;
    if (!slot) continue;
    slots.push({
      id: row.id,
      plan_id: slot.plan_id,
      date: slot.date,
      slot: slot.slot,
      recipe_id: row.recipe_id,
      scaled_servings: row.scaled_servings,
      is_locked: 0 as 0 | 1,
    });
  }

  const recipeIds = Array.from(
    new Set(
      slots.map((s) => s.recipe_id).filter((id): id is number => id != null),
    ),
  );
  let recipesById = new Map<number, Recipe>();
  let ingredientsByRecipeId = new Map<number, RecipeIngredient[]>();
  if (recipeIds.length > 0) {
    const { data: recipes, error: recErr } = await supabase
      .from("recipes")
      .select("*")
      .in("id", recipeIds);
    if (recErr) throw recErr;
    recipesById = new Map((recipes ?? []).map((r: any) => [r.id, r as Recipe]));

    const { data: ingredients, error: ingErr } = await supabase
      .from("recipe_ingredients")
      .select("*")
      .in("recipe_id", recipeIds)
      .order("position");
    if (ingErr) throw ingErr;
    for (const ing of (ingredients ?? []) as any[]) {
      // Convert Postgres booleans back to the 0|1 shape the aggregator expects.
      const row: RecipeIngredient = {
        ...ing,
        is_optional: ing.is_optional ? 1 : 0,
      };
      const arr = ingredientsByRecipeId.get(row.recipe_id) ?? [];
      arr.push(row);
      ingredientsByRecipeId.set(row.recipe_id, arr);
    }
  }

  const aisleByCanonical = await loadAisleByCanonical();
  const items = buildShoppingList({
    slots,
    recipesById,
    ingredientsByRecipeId,
    aisleByCanonical,
  });

  const { data: snap } = await supabase
    .from("shopping_lists")
    .select("id, generated_at, items_json")
    .eq("plan_id", planId)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  let checked: Record<string, boolean> = {};
  let generatedAt = new Date().toISOString();
  let snapshotId: number | null = null;
  if (snap) {
    snapshotId = snap.id;
    generatedAt = snap.generated_at;
    const json = snap.items_json;
    const stored =
      typeof json === "string" ? JSON.parse(json) : (json as any) ?? {};
    checked = stored?.checked ?? {};
  }
  return { items, checked, generatedAt, snapshotId };
}

export async function saveShoppingChecks(
  planId: number,
  checked: Record<string, boolean>,
  items: ShoppingItem[],
): Promise<number> {
  const payload = {
    checked,
    items: items.map((i) => ({
      id: i.id,
      itemCanonical: i.itemCanonical,
      itemDisplay: i.itemDisplay,
      display: i.display,
      aisle: i.aisle,
      isOptional: i.isOptional,
    })),
  };
  const { data, error } = await supabase
    .from("shopping_lists")
    .insert({ plan_id: planId, items_json: payload })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("Insert failed");
  return data.id as number;
}

export async function updateShoppingChecks(
  snapshotId: number,
  checked: Record<string, boolean>,
  items: ShoppingItem[],
): Promise<void> {
  const payload = {
    checked,
    items: items.map((i) => ({
      id: i.id,
      itemCanonical: i.itemCanonical,
      itemDisplay: i.itemDisplay,
      display: i.display,
      aisle: i.aisle,
      isOptional: i.isOptional,
    })),
  };
  const { error } = await supabase
    .from("shopping_lists")
    .update({ items_json: payload, generated_at: new Date().toISOString() })
    .eq("id", snapshotId);
  if (error) throw error;
}
