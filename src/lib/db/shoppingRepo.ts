import { getDb } from "@/lib/db/client";
import {
  buildShoppingList,
  type ShoppingItem,
} from "@/lib/shopping";
import { knownAisleEntries } from "@/lib/ingredients/canonicalize";
import type {
  Aisle,
  IngredientAisleEntry,
  MealPlanSlot,
  Recipe,
  RecipeIngredient,
  ShoppingListSnapshot,
} from "@/lib/db/schema";

interface ShoppingListWithChecks {
  items: ShoppingItem[];
  checked: Record<string, boolean>;
  generatedAt: string;
  snapshotId: number | null;
}

export async function ensureAisleSeed(): Promise<void> {
  const db = await getDb();
  const existing = await db.select<Array<{ count: number }>>(
    "SELECT COUNT(*) AS count FROM ingredient_aisle_map",
  );
  if ((existing[0]?.count ?? 0) > 0) return;

  const aisles = await db.select<Aisle[]>("SELECT id, name FROM aisles");
  const aisleByName = new Map(aisles.map((a) => [a.name, a.id]));
  for (const entry of knownAisleEntries()) {
    const aisleId = aisleByName.get(entry.aisle);
    if (!aisleId) continue;
    await db.execute(
      "INSERT OR IGNORE INTO ingredient_aisle_map (item_canonical, aisle_id) VALUES ($1, $2)",
      [entry.canonical, aisleId],
    );
  }
}

export async function loadAisleByCanonical(): Promise<Map<string, string>> {
  const db = await getDb();
  await ensureAisleSeed();
  const rows = await db.select<
    Array<IngredientAisleEntry & { aisle_name: string }>
  >(
    `SELECT iam.item_canonical, iam.aisle_id, a.name AS aisle_name
     FROM ingredient_aisle_map iam
     JOIN aisles a ON a.id = iam.aisle_id`,
  );
  const map = new Map<string, string>();
  for (const r of rows) map.set(r.item_canonical, r.aisle_name);
  return map;
}

export async function generateShoppingList(
  planId: number,
): Promise<ShoppingListWithChecks> {
  const db = await getDb();
  // Read from the junction table so multi-recipe slots contribute all
  // their recipes — not just the legacy "primary" mirror. Each
  // attachment becomes one "virtual slot" for the aggregator (it only
  // reads `recipe_id`, `scaled_servings`, and `id` from each slot, so
  // the attachment id is a fine substitute for the slot id and
  // preserves unique passthrough keys).
  const attachmentRows = await db.select<
    Array<{
      attachment_id: number;
      plan_id: number;
      date: string;
      slot: string;
      recipe_id: number;
      scaled_servings: number | null;
    }>
  >(
    `SELECT mpsr.id AS attachment_id,
            s.plan_id, s.date, s.slot,
            mpsr.recipe_id, mpsr.scaled_servings
     FROM meal_plan_slot_recipes mpsr
     JOIN meal_plan_slots s ON s.id = mpsr.slot_id
     WHERE s.plan_id = $1
     ORDER BY s.date, mpsr.position, mpsr.id`,
    [planId],
  );
  const slots: MealPlanSlot[] = attachmentRows.map((r) => ({
    id: r.attachment_id,
    plan_id: r.plan_id,
    date: r.date,
    slot: r.slot as MealPlanSlot["slot"],
    recipe_id: r.recipe_id,
    scaled_servings: r.scaled_servings,
    is_locked: 0,
  }));

  const recipeIds = Array.from(
    new Set(
      slots.map((s) => s.recipe_id).filter((id): id is number => id != null),
    ),
  );
  let recipesById = new Map<number, Recipe>();
  let ingredientsByRecipeId = new Map<number, RecipeIngredient[]>();
  if (recipeIds.length) {
    const placeholders = recipeIds.map((_, i) => `$${i + 1}`).join(",");
    const recipes = await db.select<Recipe[]>(
      `SELECT * FROM recipes WHERE id IN (${placeholders})`,
      recipeIds,
    );
    recipesById = new Map(recipes.map((r) => [r.id, r]));
    const ingredients = await db.select<RecipeIngredient[]>(
      `SELECT * FROM recipe_ingredients WHERE recipe_id IN (${placeholders}) ORDER BY recipe_id, position`,
      recipeIds,
    );
    for (const ing of ingredients) {
      const arr = ingredientsByRecipeId.get(ing.recipe_id) ?? [];
      arr.push(ing);
      ingredientsByRecipeId.set(ing.recipe_id, arr);
    }
  }

  const aisleByCanonical = await loadAisleByCanonical();
  const items = buildShoppingList({
    slots,
    recipesById,
    ingredientsByRecipeId,
    aisleByCanonical,
  });

  // Reconcile checked state with the most recent snapshot, if any.
  const snapshot = await db.select<ShoppingListSnapshot[]>(
    "SELECT * FROM shopping_lists WHERE plan_id = $1 ORDER BY id DESC LIMIT 1",
    [planId],
  );
  let checked: Record<string, boolean> = {};
  let generatedAt = new Date().toISOString();
  let snapshotId: number | null = null;
  if (snapshot[0]) {
    snapshotId = snapshot[0].id;
    generatedAt = snapshot[0].generated_at;
    try {
      const stored = JSON.parse(snapshot[0].items_json) as {
        checked?: Record<string, boolean>;
      };
      checked = stored.checked ?? {};
    } catch {
      checked = {};
    }
  }
  return { items, checked, generatedAt, snapshotId };
}

export async function saveShoppingChecks(
  planId: number,
  checked: Record<string, boolean>,
  items: ShoppingItem[],
): Promise<number> {
  const db = await getDb();
  const payload = JSON.stringify({
    checked,
    items: items.map((i) => ({
      id: i.id,
      itemCanonical: i.itemCanonical,
      itemDisplay: i.itemDisplay,
      display: i.display,
      aisle: i.aisle,
      isOptional: i.isOptional,
    })),
  });
  const result = await db.execute(
    "INSERT INTO shopping_lists (plan_id, items_json) VALUES ($1, $2)",
    [planId, payload],
  );
  return Number(result.lastInsertId);
}

export async function updateShoppingChecks(
  snapshotId: number,
  checked: Record<string, boolean>,
  items: ShoppingItem[],
): Promise<void> {
  const db = await getDb();
  const payload = JSON.stringify({
    checked,
    items: items.map((i) => ({
      id: i.id,
      itemCanonical: i.itemCanonical,
      itemDisplay: i.itemDisplay,
      display: i.display,
      aisle: i.aisle,
      isOptional: i.isOptional,
    })),
  });
  await db.execute(
    "UPDATE shopping_lists SET items_json = $1, generated_at = datetime('now') WHERE id = $2",
    [payload, snapshotId],
  );
}
