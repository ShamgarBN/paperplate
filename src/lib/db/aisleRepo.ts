import { getDb } from "@/lib/db/client";
import { withWriteLock } from "@/lib/db/writeLock";
import type { Aisle } from "@/lib/db/schema";

/**
 * Aisle names are short labels used to bucket shopping-list rows
 * (e.g. "Produce", "Dairy & Eggs"). We bound them at a generous-but-
 * fixed length so a runaway paste can't blow up the picker UI.
 */
const MAX_AISLE_NAME_LENGTH = 60;

/**
 * Canonical "fallback" aisle name. Used as the default destination for
 * ingredients without an explicit override, and protected from
 * deletion (since the rest of the system assumes it always exists).
 */
export const FALLBACK_AISLE_NAME = "Other";

/**
 * List every aisle alphabetically (case-insensitive). Per the user
 * feedback the Settings page should always render aisles in
 * alphabetical order — we sort at the DB layer so every consumer (the
 * Settings editor, the add-extra form, the override picker) gets the
 * same order without re-sorting.
 */
export async function listAisles(): Promise<Aisle[]> {
  const db = await getDb();
  return db.select<Aisle[]>(
    "SELECT id, name, sort_order FROM aisles ORDER BY name COLLATE NOCASE ASC",
  );
}

/**
 * Create a new aisle. Trims + validates input at the trust boundary so
 * the editor UI doesn't have to. Returns the new id so callers can
 * focus the freshly-created row.
 */
export async function createAisle(name: string): Promise<number> {
  const trimmed = name.trim().slice(0, MAX_AISLE_NAME_LENGTH);
  if (!trimmed) throw new Error("Aisle name cannot be empty");
  return withWriteLock(async () => {
    const db = await getDb();
    // We deliberately *don't* set a custom sort_order — the column
    // exists for backwards compatibility but the new query orders by
    // name alphabetically, so any value works. We use the next
    // monotonically-increasing slot to keep INSERT OR IGNORE behaviour
    // sensible when seeding.
    const max = await db.select<Array<{ max_sort: number | null }>>(
      "SELECT MAX(sort_order) AS max_sort FROM aisles",
    );
    const nextSort = (max[0]?.max_sort ?? 0) + 10;
    const result = await db.execute(
      "INSERT INTO aisles (name, sort_order) VALUES ($1, $2)",
      [trimmed, nextSort],
    );
    return Number(result.lastInsertId);
  });
}

/**
 * Rename an aisle. Also propagates the new name to any rows in
 * `shopping_list_items` that referenced it (those store the aisle as a
 * plain TEXT column rather than an FK, so a rename would otherwise
 * silently orphan them under their old label).
 */
export async function renameAisle(
  id: number,
  name: string,
): Promise<void> {
  const trimmed = name.trim().slice(0, MAX_AISLE_NAME_LENGTH);
  if (!trimmed) throw new Error("Aisle name cannot be empty");
  await withWriteLock(async () => {
    const db = await getDb();
    const prior = await db.select<Array<{ name: string }>>(
      "SELECT name FROM aisles WHERE id = $1",
      [id],
    );
    const oldName = prior[0]?.name;
    await db.execute("UPDATE aisles SET name = $1 WHERE id = $2", [
      trimmed,
      id,
    ]);
    if (oldName && oldName !== trimmed) {
      await db.execute(
        "UPDATE shopping_list_items SET aisle = $1 WHERE aisle = $2",
        [trimmed, oldName],
      );
    }
  });
}

/**
 * Delete an aisle. Rejects deletion of the canonical "Other" aisle
 * since it's the universal fallback. Any standalone shopping list rows
 * that referenced this aisle are remapped to "Other" so the UI doesn't
 * end up with rows under a vanished section header.
 */
export async function deleteAisle(id: number): Promise<void> {
  await withWriteLock(async () => {
    const db = await getDb();
    const prior = await db.select<Array<{ name: string }>>(
      "SELECT name FROM aisles WHERE id = $1",
      [id],
    );
    const name = prior[0]?.name;
    if (!name) return;
    if (name.toLowerCase() === FALLBACK_AISLE_NAME.toLowerCase()) {
      throw new Error(`Cannot delete the "${FALLBACK_AISLE_NAME}" aisle`);
    }
    // Reassign standalone items so they continue to render somewhere.
    // (The `ingredient_aisle_map` rows that reference this aisle will
    // be cleaned up automatically by the ON DELETE CASCADE in
    // migration 1.)
    await db.execute(
      "UPDATE shopping_list_items SET aisle = $1 WHERE aisle = $2",
      [FALLBACK_AISLE_NAME, name],
    );
    await db.execute("DELETE FROM aisles WHERE id = $1", [id]);
  });
}

/**
 * Move (or set) an ingredient's preferred aisle. We delete-then-insert
 * rather than `INSERT OR REPLACE` so the row keeps a clean history if
 * we ever add audit columns. Callers pass the canonical ingredient
 * name (the same string used by the shopping list aggregator) and the
 * destination aisle's display name; we resolve the id internally.
 *
 * Returns true when the override was written, false when the aisle
 * name didn't resolve to a known row.
 */
export async function setIngredientAisle(
  itemCanonical: string,
  aisleName: string,
): Promise<boolean> {
  const canonical = itemCanonical.trim().toLowerCase();
  const target = aisleName.trim();
  if (!canonical || !target) return false;
  return withWriteLock(async () => {
    const db = await getDb();
    const aisles = await db.select<Array<{ id: number }>>(
      "SELECT id FROM aisles WHERE LOWER(name) = LOWER($1)",
      [target],
    );
    const aisleId = aisles[0]?.id;
    if (!aisleId) return false;
    await db.execute(
      "DELETE FROM ingredient_aisle_map WHERE item_canonical = $1",
      [canonical],
    );
    await db.execute(
      "INSERT INTO ingredient_aisle_map (item_canonical, aisle_id) VALUES ($1, $2)",
      [canonical, aisleId],
    );
    return true;
  });
}
