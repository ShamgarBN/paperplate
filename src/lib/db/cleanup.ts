import type Database from "@tauri-apps/plugin-sql";

/**
 * How long transient/cache data lives in the local DB before being purged
 * on the next app launch. Set to 30 days per product spec.
 *
 * The constants below intentionally do NOT cover user-authored content:
 *   - recipes, recipe_ingredients, recipe_steps
 *   - categories, recipe_categories
 *   - meal_plans, meal_plan_slots
 *
 * Those represent the user's permanent library and would be catastrophic to
 * delete on a calendar clock. The cleanup pass touches only auto-generated
 * snapshots, ad-hoc shopping list entries, and checked-off rows.
 */
const RETENTION_DAYS = 30;

export interface CleanupSummary {
  shoppingListSnapshotsDeleted: number;
  shoppingListExtraItemsDeleted: number;
  shoppingListRecipesDeleted: number;
  shoppingListChecksDeleted: number;
}

/**
 * Delete transient shopping list data older than the retention window. Run
 * on app start by the DB client so the user starts each session with a
 * tidy state — no stale checked-off items lingering forever.
 */
export async function purgeExpiredTransientData(
  db: InstanceType<typeof Database>,
): Promise<CleanupSummary> {
  // We compute the cutoff in JS so the SQLite text comparison stays simple
  // and we can keep the same string format already used elsewhere
  // (`datetime('now')` yields `YYYY-MM-DD HH:MM:SS`).
  const cutoffMs = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const cutoffIso = new Date(cutoffMs)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);

  const summary: CleanupSummary = {
    shoppingListSnapshotsDeleted: 0,
    shoppingListExtraItemsDeleted: 0,
    shoppingListRecipesDeleted: 0,
    shoppingListChecksDeleted: 0,
  };

  // Per-plan shopping list snapshots. The latest snapshot for a still-active
  // plan is regenerated on demand, so dropping stale rows is safe.
  try {
    const result = await db.execute(
      "DELETE FROM shopping_lists WHERE generated_at < $1",
      [cutoffIso],
    );
    summary.shoppingListSnapshotsDeleted = Number(result.rowsAffected ?? 0);
  } catch {
    // Table may not exist yet in very-old schemas; skip silently.
  }

  // Global shopping list — recipes the user added that were never cleared.
  try {
    const result = await db.execute(
      "DELETE FROM shopping_list_recipes WHERE added_at < $1",
      [cutoffIso],
    );
    summary.shoppingListRecipesDeleted = Number(result.rowsAffected ?? 0);
  } catch {
    // Schema may predate v4 if cleanup ran during a partial migration.
  }

  // Free-form items, including unchecked ones — the spec is "expires after
  // 30 days and clears", not "clears if checked".
  try {
    const result = await db.execute(
      "DELETE FROM shopping_list_items WHERE added_at < $1",
      [cutoffIso],
    );
    summary.shoppingListExtraItemsDeleted = Number(result.rowsAffected ?? 0);
  } catch {
    // Same fallback.
  }

  // Orphan check-state rows for aggregates older than the window.
  try {
    const result = await db.execute(
      "DELETE FROM shopping_list_checks WHERE updated_at < $1",
      [cutoffIso],
    );
    summary.shoppingListChecksDeleted = Number(result.rowsAffected ?? 0);
  } catch {
    // ditto
  }

  return summary;
}
