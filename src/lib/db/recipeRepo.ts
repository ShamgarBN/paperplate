import { getDb } from "@/lib/db/client";
import type {
  Category,
  CategoryKind,
  Recipe,
  RecipeIngredient,
  RecipeStep,
} from "@/lib/db/schema";
import { parseIngredient } from "@/lib/ingredients/parser";
import { withWriteLock } from "@/lib/db/writeLock";

export interface RecipeDraft {
  title: string;
  source_url: string | null;
  image_path: string | null;
  base_servings: number;
  prep_min: number | null;
  cook_min: number | null;
  total_min: number | null;
  difficulty: "easy" | "medium" | "hard" | null;
  /**
   * Source-derived recipe blurb (or user-authored description). Stored
   * separately from `notes` so we don't clobber the cook's tasting
   * notes with the scraper's output — see migration 5.
   */
  description: string | null;
  notes: string | null;
  raw_html: string | null;
  ingredients: Array<{
    raw: string;
    quantity: number | null;
    unit: string | null;
    item_canonical: string;
    item_display: string;
    preparation: string | null;
    is_optional: boolean;
    /** Optional sub-recipe section label (e.g. "Cake", "Frosting"). */
    section_name: string | null;
  }>;
  steps: Array<{
    text: string;
    /** Optional sub-recipe section label, matching the ingredient sections. */
    section_name: string | null;
  }>;
  categoryIds: number[];
}

export interface RecipeWithDetails {
  recipe: Recipe;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  categoryIds: number[];
}

export async function listCategories(): Promise<Category[]> {
  const db = await getDb();
  return db.select<Category[]>(
    "SELECT id, kind, name, sort_order FROM categories ORDER BY kind, name COLLATE NOCASE ASC",
  );
}

export async function listCategoriesByKind(
  kind: CategoryKind,
): Promise<Category[]> {
  const db = await getDb();
  return db.select<Category[]>(
    "SELECT id, kind, name, sort_order FROM categories WHERE kind = $1 ORDER BY name COLLATE NOCASE ASC",
    [kind],
  );
}

export async function createRecipe(draft: RecipeDraft): Promise<number> {
  return withWriteLock(async () => {
    const db = await getDb();
    const result = await db.execute(
      `INSERT INTO recipes
       (title, source_url, image_path, base_servings, prep_min, cook_min, total_min, difficulty, description, notes, raw_html)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        draft.title,
        draft.source_url,
        draft.image_path,
        draft.base_servings,
        draft.prep_min,
        draft.cook_min,
        draft.total_min,
        draft.difficulty,
        draft.description,
        draft.notes,
        draft.raw_html,
      ],
    );
    const recipeId = Number(result.lastInsertId);

    try {
      for (let i = 0; i < draft.ingredients.length; i++) {
        const ing = draft.ingredients[i]!;
        await db.execute(
          `INSERT INTO recipe_ingredients
           (recipe_id, position, raw_text, quantity, unit, item_canonical, item_display, preparation, is_optional, section_name)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            recipeId,
            i,
            ing.raw,
            ing.quantity,
            ing.unit,
            ing.item_canonical,
            ing.item_display,
            ing.preparation,
            ing.is_optional ? 1 : 0,
            ing.section_name,
          ],
        );
      }

      for (let i = 0; i < draft.steps.length; i++) {
        const step = draft.steps[i]!;
        await db.execute(
          `INSERT INTO recipe_steps (recipe_id, position, text, section_name) VALUES ($1, $2, $3, $4)`,
          [recipeId, i, step.text, step.section_name],
        );
      }

      for (const categoryId of draft.categoryIds) {
        await db.execute(
          `INSERT OR IGNORE INTO recipe_categories (recipe_id, category_id) VALUES ($1, $2)`,
          [recipeId, categoryId],
        );
      }

      return recipeId;
    } catch (err) {
      // Best-effort cleanup — ON DELETE CASCADE removes ingredient/step rows.
      try {
        await db.execute("DELETE FROM recipes WHERE id = $1", [recipeId]);
      } catch {
        // swallow: surface the original error
      }
      throw err;
    }
  });
}

export async function getRecipe(
  id: number,
): Promise<RecipeWithDetails | null> {
  const db = await getDb();
  const recipes = await db.select<Recipe[]>(
    "SELECT * FROM recipes WHERE id = $1",
    [id],
  );
  const recipe = recipes[0];
  if (!recipe) return null;
  const ingredients = await db.select<RecipeIngredient[]>(
    "SELECT * FROM recipe_ingredients WHERE recipe_id = $1 ORDER BY position",
    [id],
  );
  const steps = await db.select<RecipeStep[]>(
    "SELECT * FROM recipe_steps WHERE recipe_id = $1 ORDER BY position",
    [id],
  );
  const cats = await db.select<Array<{ category_id: number }>>(
    "SELECT category_id FROM recipe_categories WHERE recipe_id = $1",
    [id],
  );
  return {
    recipe,
    ingredients,
    steps,
    categoryIds: cats.map((c) => c.category_id),
  };
}

export async function listRecipes(): Promise<Recipe[]> {
  const db = await getDb();
  return db.select<Recipe[]>(
    "SELECT * FROM recipes ORDER BY title COLLATE NOCASE ASC, created_at DESC",
  );
}

export async function deleteRecipe(id: number): Promise<void> {
  const db = await getDb();
  // Look up the cached image path before the cascade-delete wipes the row,
  // so we can clean the file off disk after the DB write succeeds.
  const rows = await db.select<Array<{ image_path: string | null }>>(
    "SELECT image_path FROM recipes WHERE id = $1",
    [id],
  );
  const imagePath = rows[0]?.image_path ?? null;
  await db.execute("DELETE FROM recipes WHERE id = $1", [id]);
  if (imagePath) {
    // Image filenames are content-addressed (SHA-256), so two recipes with
    // the same hero image share the same path. Only delete the file if no
    // other recipe still references it.
    const refs = await db.select<Array<{ count: number }>>(
      "SELECT COUNT(*) AS count FROM recipes WHERE image_path = $1",
      [imagePath],
    );
    if ((refs[0]?.count ?? 0) === 0) {
      try {
        const { deleteRecipeImage } = await import("@/lib/backup");
        await deleteRecipeImage(imagePath);
      } catch {
        // The recipe is already gone and an orphaned image is not worth
        // surfacing — log silently.
      }
    }
  }
}

// Whitelist of columns we allow callers to patch. Used as a defensive guard
// against accidentally letting unbound keys flow into the dynamic UPDATE
// statement below — every key in `patch` must appear here or be rejected.
const RECIPE_UPDATE_COLUMNS = new Set([
  "title",
  "source_url",
  "image_path",
  "base_servings",
  "preferred_servings",
  "prep_min",
  "cook_min",
  "total_min",
  "difficulty",
  "description",
  "notes",
  "rating",
  "last_cooked_at",
]);

export async function updateRecipe(
  id: number,
  patch: Partial<{
    title: string;
    source_url: string | null;
    image_path: string | null;
    base_servings: number;
    preferred_servings: number | null;
    prep_min: number | null;
    cook_min: number | null;
    total_min: number | null;
    difficulty: "easy" | "medium" | "hard" | null;
    description: string | null;
    notes: string | null;
    rating: number | null;
    last_cooked_at: string | null;
  }>,
): Promise<void> {
  const db = await getDb();
  const fields = Object.keys(patch).filter((f) =>
    RECIPE_UPDATE_COLUMNS.has(f),
  );
  if (!fields.length) return;
  const set = fields.map((f, i) => `${f} = $${i + 1}`).join(", ");
  const values = fields.map((f) => (patch as Record<string, unknown>)[f]);
  await db.execute(
    `UPDATE recipes SET ${set}, updated_at = datetime('now') WHERE id = $${fields.length + 1}`,
    [...values, id],
  );
}

/**
 * Replaces a recipe's full content (header + ingredients + steps + categories)
 * inside a single write-locked batch. Used by the edit flow so a partial save
 * cannot leave a recipe in a half-updated state.
 */
export async function updateRecipeFull(
  id: number,
  draft: RecipeDraft,
): Promise<void> {
  await withWriteLock(async () => {
    const db = await getDb();
    await db.execute(
      `UPDATE recipes SET
         title = $1,
         source_url = $2,
         image_path = $3,
         base_servings = $4,
         prep_min = $5,
         cook_min = $6,
         total_min = $7,
         difficulty = $8,
         description = $9,
         notes = $10,
         updated_at = datetime('now')
       WHERE id = $11`,
      [
        draft.title,
        draft.source_url,
        draft.image_path,
        draft.base_servings,
        draft.prep_min,
        draft.cook_min,
        draft.total_min,
        draft.difficulty,
        draft.description,
        draft.notes,
        id,
      ],
    );
    await db.execute(
      "DELETE FROM recipe_ingredients WHERE recipe_id = $1",
      [id],
    );
    await db.execute("DELETE FROM recipe_steps WHERE recipe_id = $1", [id]);
    await db.execute("DELETE FROM recipe_categories WHERE recipe_id = $1", [
      id,
    ]);

    for (let i = 0; i < draft.ingredients.length; i++) {
      const ing = draft.ingredients[i]!;
      await db.execute(
        `INSERT INTO recipe_ingredients
         (recipe_id, position, raw_text, quantity, unit, item_canonical, item_display, preparation, is_optional, section_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          id,
          i,
          ing.raw,
          ing.quantity,
          ing.unit,
          ing.item_canonical,
          ing.item_display,
          ing.preparation,
          ing.is_optional ? 1 : 0,
          ing.section_name,
        ],
      );
    }
    for (let i = 0; i < draft.steps.length; i++) {
      const step = draft.steps[i]!;
      await db.execute(
        `INSERT INTO recipe_steps (recipe_id, position, text, section_name) VALUES ($1, $2, $3, $4)`,
        [id, i, step.text, step.section_name],
      );
    }
    for (const categoryId of draft.categoryIds) {
      await db.execute(
        `INSERT OR IGNORE INTO recipe_categories (recipe_id, category_id) VALUES ($1, $2)`,
        [id, categoryId],
      );
    }
  });
}

export async function setRecipeCategories(
  recipeId: number,
  categoryIds: number[],
): Promise<void> {
  await withWriteLock(async () => {
    const db = await getDb();
    await db.execute("DELETE FROM recipe_categories WHERE recipe_id = $1", [
      recipeId,
    ]);
    for (const id of categoryIds) {
      await db.execute(
        "INSERT OR IGNORE INTO recipe_categories (recipe_id, category_id) VALUES ($1, $2)",
        [recipeId, id],
      );
    }
  });
}

export async function addCategory(
  kind: Category["kind"],
  name: string,
): Promise<Category> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required");
  const db = await getDb();
  const sortRows = await db.select<Array<{ max_sort: number | null }>>(
    "SELECT MAX(sort_order) AS max_sort FROM categories WHERE kind = $1",
    [kind],
  );
  const nextSort = (sortRows[0]?.max_sort ?? -1) + 1;
  const result = await db.execute(
    "INSERT INTO categories (kind, name, sort_order) VALUES ($1, $2, $3)",
    [kind, trimmed, nextSort],
  );
  const created = await db.select<Category[]>(
    "SELECT id, kind, name, sort_order FROM categories WHERE id = $1",
    [Number(result.lastInsertId)],
  );
  return created[0]!;
}

export async function renameCategory(
  id: number,
  name: string,
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required");
  const db = await getDb();
  await db.execute("UPDATE categories SET name = $1 WHERE id = $2", [
    trimmed,
    id,
  ]);
}

export async function deleteCategory(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM categories WHERE id = $1", [id]);
}

export async function getCategoriesForRecipe(
  recipeId: number,
): Promise<Category[]> {
  const db = await getDb();
  return db.select<Category[]>(
    `SELECT c.id, c.kind, c.name, c.sort_order
     FROM categories c
     JOIN recipe_categories rc ON rc.category_id = c.id
     WHERE rc.recipe_id = $1
     ORDER BY c.kind, c.name COLLATE NOCASE ASC`,
    [recipeId],
  );
}

/**
 * Re-runs the ingredient parser on every stored raw_text. Useful after the
 * canonical lexicon is updated.
 */
export async function reparseIngredients(): Promise<void> {
  const db = await getDb();
  const rows = await db.select<RecipeIngredient[]>(
    "SELECT id, raw_text FROM recipe_ingredients",
  );
  for (const row of rows) {
    const parsed = parseIngredient(row.raw_text);
    await db.execute(
      `UPDATE recipe_ingredients
       SET quantity = $1, unit = $2, item_canonical = $3, item_display = $4,
           preparation = $5, is_optional = $6
       WHERE id = $7`,
      [
        parsed.quantity,
        parsed.unit,
        parsed.itemCanonical,
        parsed.itemDisplay,
        parsed.preparation,
        parsed.isOptional ? 1 : 0,
        row.id,
      ],
    );
  }
}
