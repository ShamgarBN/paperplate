import { getDb } from "@/lib/db/client";
import { withWriteLock } from "@/lib/db/writeLock";
import { buildShoppingList, type ShoppingItem } from "@/lib/shopping";
import { loadAisleByCanonical } from "@/lib/db/shoppingRepo";
import type {
  MealPlanSlot,
  Recipe,
  RecipeIngredient,
  ShoppingListExtraItem,
  ShoppingListRecipeEntry,
} from "@/lib/db/schema";

/**
 * Synthetic id prefix used for standalone (manually added) shopping list
 * rows. Keeping the format predictable means the checkbox React keys are
 * stable even when the row is reordered between aisles.
 */
const EXTRA_ID_PREFIX = "extra-";

export interface GlobalShoppingListResult {
  /** Combined view (recipe-derived + manually added). */
  items: ShoppingItem[];
  /** Map of itemId -> isChecked for the rendered list. */
  checked: Record<string, boolean>;
  /** Recipes currently on the list, in display order. */
  recipes: Array<{
    entryId: number;
    recipe: Recipe;
    scaledServings: number;
  }>;
}

/**
 * Build the unified shopping list from every recipe the user has explicitly
 * added (via "Add to shopping list") plus any free-form items. Reuses the
 * existing `buildShoppingList` aggregator by adapting the recipe entries
 * into the `MealPlanSlot` shape it already understands.
 */
export async function generateGlobalShoppingList(): Promise<GlobalShoppingListResult> {
  const db = await getDb();
  const recipeEntries = await db.select<ShoppingListRecipeEntry[]>(
    "SELECT id, recipe_id, scaled_servings, added_at FROM shopping_list_recipes ORDER BY added_at DESC, id DESC",
  );
  const extras = await db.select<ShoppingListExtraItem[]>(
    "SELECT id, name, quantity, unit, aisle, is_checked, added_at, checked_at FROM shopping_list_items ORDER BY added_at DESC, id DESC",
  );

  // Pull recipe + ingredient metadata in batch so we can hand the aggregator
  // a fully populated map.
  let recipesById = new Map<number, Recipe>();
  let ingredientsByRecipeId = new Map<number, RecipeIngredient[]>();
  if (recipeEntries.length) {
    const ids = Array.from(
      new Set(recipeEntries.map((e) => e.recipe_id)),
    );
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
    const recipes = await db.select<Recipe[]>(
      `SELECT * FROM recipes WHERE id IN (${placeholders})`,
      ids,
    );
    recipesById = new Map(recipes.map((r) => [r.id, r]));
    const ingredients = await db.select<RecipeIngredient[]>(
      `SELECT * FROM recipe_ingredients WHERE recipe_id IN (${placeholders}) ORDER BY recipe_id, position`,
      ids,
    );
    for (const ing of ingredients) {
      const arr = ingredientsByRecipeId.get(ing.recipe_id) ?? [];
      arr.push(ing);
      ingredientsByRecipeId.set(ing.recipe_id, arr);
    }
  }

  // Shape the recipe-list entries into the same MealPlanSlot interface that
  // buildShoppingList consumes — gives us aisle grouping, unit-merging, and
  // indivisible rounding for free.
  const slots: MealPlanSlot[] = recipeEntries.map((entry, index) => ({
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

  // Apply persisted checked state for aggregated items.
  const checks = await db.select<
    Array<{ item_id: string; is_checked: 0 | 1 }>
  >("SELECT item_id, is_checked FROM shopping_list_checks");
  const checkedSet = new Set(
    checks.filter((c) => c.is_checked === 1).map((c) => c.item_id),
  );

  // Standalone items are leaf rows — their checked state lives directly on
  // the item.
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

  const recipes = recipeEntries
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

/**
 * Toggle persisted checked state for a single shopping list line. Handles
 * both aggregate items (stored in `shopping_list_checks`) and standalone
 * items (stored directly on `shopping_list_items.is_checked`).
 */
export async function setItemChecked(
  itemId: string,
  isChecked: boolean,
): Promise<void> {
  await withWriteLock(async () => {
    const db = await getDb();
    if (itemId.startsWith(EXTRA_ID_PREFIX)) {
      // The numeric tail is the row id we stored in shopping_list_items.
      // `Number(...)` will gracefully handle the format and we reject NaN so
      // a malformed id can't reach the UPDATE.
      const numericId = Number(itemId.slice(EXTRA_ID_PREFIX.length));
      if (!Number.isFinite(numericId)) return;
      await db.execute(
        "UPDATE shopping_list_items SET is_checked = $1, checked_at = CASE WHEN $1 = 1 THEN datetime('now') ELSE NULL END WHERE id = $2",
        [isChecked ? 1 : 0, numericId],
      );
      return;
    }
    await db.execute(
      `INSERT INTO shopping_list_checks (item_id, is_checked, updated_at)
         VALUES ($1, $2, datetime('now'))
       ON CONFLICT(item_id) DO UPDATE
         SET is_checked = excluded.is_checked,
             updated_at = excluded.updated_at`,
      [itemId, isChecked ? 1 : 0],
    );
  });
}

export async function addRecipeToShoppingList(
  recipeId: number,
  scaledServings: number | null,
): Promise<void> {
  await withWriteLock(async () => {
    const db = await getDb();
    await db.execute(
      "INSERT INTO shopping_list_recipes (recipe_id, scaled_servings) VALUES ($1, $2)",
      [recipeId, scaledServings],
    );
  });
}

export async function removeRecipeFromShoppingList(
  entryId: number,
): Promise<void> {
  await withWriteLock(async () => {
    const db = await getDb();
    await db.execute(
      "DELETE FROM shopping_list_recipes WHERE id = $1",
      [entryId],
    );
  });
}

export interface ExtraItemInput {
  name: string;
  quantity: number | null;
  unit: string | null;
  aisle: string;
}

export async function addExtraItem(input: ExtraItemInput): Promise<void> {
  // Validate at trust boundary: free-form names are user input that ends up
  // in the DOM. We trim and bound the length to keep accidental megabyte
  // pastes from blowing up the list, but we deliberately don't strip
  // characters — the ingredient parser elsewhere encodes for display.
  const name = input.name.trim().slice(0, 200);
  if (!name) throw new Error("Item name is required");
  const aisle = input.aisle.trim().slice(0, 60) || "Other";
  const unit = input.unit ? input.unit.trim().slice(0, 20) || null : null;
  await withWriteLock(async () => {
    const db = await getDb();
    await db.execute(
      "INSERT INTO shopping_list_items (name, quantity, unit, aisle) VALUES ($1, $2, $3, $4)",
      [name, input.quantity, unit, aisle],
    );
  });
}

export async function removeExtraItem(id: number): Promise<void> {
  await withWriteLock(async () => {
    const db = await getDb();
    await db.execute(
      "DELETE FROM shopping_list_items WHERE id = $1",
      [id],
    );
  });
}

export async function clearCheckedExtraItems(): Promise<number> {
  return withWriteLock(async () => {
    const db = await getDb();
    const result = await db.execute(
      "DELETE FROM shopping_list_items WHERE is_checked = 1",
    );
    return Number(result.rowsAffected ?? 0);
  });
}

/**
 * Returns the parsed numeric id behind a synthetic "extra-N" key, or null
 * if the id was not in the extras namespace.
 */
export function extractExtraId(itemId: string): number | null {
  if (!itemId.startsWith(EXTRA_ID_PREFIX)) return null;
  const n = Number(itemId.slice(EXTRA_ID_PREFIX.length));
  return Number.isFinite(n) ? n : null;
}
