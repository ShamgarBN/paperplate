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

/**
 * Push every assigned recipe in a plan onto the global shopping list,
 * tagging each new entry with `from_plan_id` so it can be cleanly
 * removed later via {@link removePlanFromGlobalShoppingList}. Skips
 * plan-recipes that are already on the list (matched by plan + recipe),
 * so calling this twice is a no-op rather than producing duplicates.
 */
export async function addPlanToGlobalShoppingList(
  planId: number,
): Promise<{ inserted: number }> {
  return withWriteLock(async () => {
    const db = await getDb();
    // Read every attached recipe across the plan — junction table is
    // the canonical source for multi-recipe slots.
    const attachments = await db.select<
      Array<{ recipe_id: number; scaled_servings: number | null }>
    >(
      `SELECT mpsr.recipe_id, mpsr.scaled_servings
       FROM meal_plan_slot_recipes mpsr
       JOIN meal_plan_slots s ON s.id = mpsr.slot_id
       WHERE s.plan_id = $1`,
      [planId],
    );
    // Deduplicate by recipe within the plan so we don't insert one row
    // per slot when the same recipe is scheduled twice.
    const byRecipe = new Map<number, { recipeId: number; servings: number | null }>();
    for (const a of attachments) {
      const existing = byRecipe.get(a.recipe_id);
      const servings = a.scaled_servings ?? null;
      if (!existing) {
        byRecipe.set(a.recipe_id, { recipeId: a.recipe_id, servings });
      } else if (servings != null && (existing.servings ?? 0) < servings) {
        // Keep the larger of the two so the aggregate is at least as
        // big as the plan calls for.
        existing.servings = servings;
      }
    }
    const existingRows = await db.select<Array<{ recipe_id: number }>>(
      "SELECT recipe_id FROM shopping_list_recipes WHERE from_plan_id = $1",
      [planId],
    );
    const alreadyHave = new Set(existingRows.map((r) => r.recipe_id));
    let inserted = 0;
    for (const { recipeId, servings } of byRecipe.values()) {
      if (alreadyHave.has(recipeId)) continue;
      await db.execute(
        "INSERT INTO shopping_list_recipes (recipe_id, scaled_servings, from_plan_id) VALUES ($1, $2, $3)",
        [recipeId, servings, planId],
      );
      inserted += 1;
    }
    return { inserted };
  });
}

/**
 * Remove every shopping-list entry that was added by
 * {@link addPlanToGlobalShoppingList} for this plan. Leaves alone any
 * recipes the user added to the global list standalone (those have
 * `from_plan_id = NULL`).
 */
export async function removePlanFromGlobalShoppingList(
  planId: number,
): Promise<{ removed: number }> {
  return withWriteLock(async () => {
    const db = await getDb();
    const before = await db.select<Array<{ id: number }>>(
      "SELECT id FROM shopping_list_recipes WHERE from_plan_id = $1",
      [planId],
    );
    await db.execute(
      "DELETE FROM shopping_list_recipes WHERE from_plan_id = $1",
      [planId],
    );
    return { removed: before.length };
  });
}

/**
 * Returns the count of shopping-list entries that came from this plan.
 * The UI uses a `> 0` check to flip the button between "Add" / "Remove"
 * states.
 */
export async function countPlanEntriesOnGlobalList(
  planId: number,
): Promise<number> {
  const db = await getDb();
  const rows = await db.select<Array<{ count: number }>>(
    "SELECT COUNT(*) AS count FROM shopping_list_recipes WHERE from_plan_id = $1",
    [planId],
  );
  return rows[0]?.count ?? 0;
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

/**
 * Update the cached servings count for one of the recipes the user has
 * pushed onto the global shopping list. The aggregator rebuilds the line
 * items from `scaled_servings` on every read, so changing this value is
 * how the user scales a recipe up to "4x" without going back to the
 * recipe detail page.
 *
 * Validates that `scaledServings` is a positive integer at the trust
 * boundary — the call site eventually feeds it into a SQL UPDATE that
 * widens to support any int, but we don't want a runaway value (negative
 * or NaN) to corrupt the row and crash the aggregation pass.
 */
export async function updateRecipeScaledServings(
  entryId: number,
  scaledServings: number,
): Promise<void> {
  if (!Number.isFinite(scaledServings) || scaledServings <= 0) {
    throw new Error("scaledServings must be a positive number");
  }
  const rounded = Math.max(1, Math.round(scaledServings));
  await withWriteLock(async () => {
    const db = await getDb();
    await db.execute(
      "UPDATE shopping_list_recipes SET scaled_servings = $1 WHERE id = $2",
      [rounded, entryId],
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

/**
 * Update the aisle label on a standalone shopping list row. Unlike the
 * aggregate items (which read their aisle from `ingredient_aisle_map`),
 * extras keep their aisle directly on the row, so this is just a one-
 * column UPDATE. Trimming + length-bounding happens here so the UI
 * doesn't have to repeat the validation it would also need on the
 * Settings → Aisles page.
 */
export async function setExtraItemAisle(
  id: number,
  aisleName: string,
): Promise<void> {
  const aisle = aisleName.trim().slice(0, 60) || "Other";
  await withWriteLock(async () => {
    const db = await getDb();
    await db.execute(
      "UPDATE shopping_list_items SET aisle = $1 WHERE id = $2",
      [aisle, id],
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
