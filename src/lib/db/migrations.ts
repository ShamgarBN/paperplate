// Each migration is applied in sequence; we track the current schema version
// in the user_version PRAGMA. To add a migration, append a new entry; never
// rewrite history.

export interface Migration {
  version: number;
  name: string;
  statements: string[];
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: "initial_schema",
    statements: [
      `CREATE TABLE IF NOT EXISTS recipes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        source_url TEXT,
        image_path TEXT,
        base_servings INTEGER NOT NULL DEFAULT 4,
        prep_min INTEGER,
        cook_min INTEGER,
        total_min INTEGER,
        difficulty TEXT CHECK (difficulty IN ('easy','medium','hard')),
        rating INTEGER CHECK (rating BETWEEN 0 AND 5),
        last_cooked_at TEXT,
        notes TEXT,
        raw_html TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_recipes_title ON recipes(title)`,
      `CREATE INDEX IF NOT EXISTS idx_recipes_last_cooked ON recipes(last_cooked_at)`,

      `CREATE TABLE IF NOT EXISTS recipe_ingredients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        raw_text TEXT NOT NULL,
        quantity REAL,
        unit TEXT,
        item_canonical TEXT NOT NULL,
        item_display TEXT NOT NULL,
        preparation TEXT,
        is_optional INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id)`,
      `CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_canonical ON recipe_ingredients(item_canonical)`,

      `CREATE TABLE IF NOT EXISTS recipe_steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        text TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_recipe_steps_recipe ON recipe_steps(recipe_id)`,

      `CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL CHECK (kind IN ('cuisine','protein','type','effort','tag','dietary')),
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        UNIQUE(kind, name)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_categories_kind ON categories(kind, sort_order)`,

      `CREATE TABLE IF NOT EXISTS recipe_categories (
        recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        PRIMARY KEY (recipe_id, category_id)
      )`,

      `CREATE TABLE IF NOT EXISTS meal_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,

      `CREATE TABLE IF NOT EXISTS meal_plan_slots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_id INTEGER NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        slot TEXT NOT NULL CHECK (slot IN ('lunch','dinner')),
        recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
        scaled_servings INTEGER,
        is_locked INTEGER NOT NULL DEFAULT 0,
        UNIQUE(plan_id, date, slot)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_meal_plan_slots_plan ON meal_plan_slots(plan_id)`,

      `CREATE TABLE IF NOT EXISTS shopping_lists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_id INTEGER NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
        generated_at TEXT NOT NULL DEFAULT (datetime('now')),
        items_json TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_shopping_lists_plan ON shopping_lists(plan_id)`,

      `CREATE TABLE IF NOT EXISTS aisles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        sort_order INTEGER NOT NULL DEFAULT 0
      )`,

      `CREATE TABLE IF NOT EXISTS ingredient_aisle_map (
        item_canonical TEXT PRIMARY KEY,
        aisle_id INTEGER NOT NULL REFERENCES aisles(id) ON DELETE CASCADE
      )`,
    ],
  },
  {
    version: 2,
    name: "add_breakfast_slot_kind",
    statements: [
      // SQLite cannot ALTER a CHECK constraint in place, so we recreate the
      // table with the expanded set of slot kinds and copy existing data.
      `CREATE TABLE meal_plan_slots_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_id INTEGER NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        slot TEXT NOT NULL CHECK (slot IN ('breakfast','lunch','dinner')),
        recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
        scaled_servings INTEGER,
        is_locked INTEGER NOT NULL DEFAULT 0,
        UNIQUE(plan_id, date, slot)
      )`,
      `INSERT INTO meal_plan_slots_new (id, plan_id, date, slot, recipe_id, scaled_servings, is_locked)
        SELECT id, plan_id, date, slot, recipe_id, scaled_servings, is_locked FROM meal_plan_slots`,
      `DROP TABLE meal_plan_slots`,
      `ALTER TABLE meal_plan_slots_new RENAME TO meal_plan_slots`,
      `CREATE INDEX IF NOT EXISTS idx_meal_plan_slots_plan ON meal_plan_slots(plan_id)`,
    ],
  },
  {
    version: 3,
    name: "add_preferred_servings",
    statements: [
      // User's preferred default scaling for this recipe — falls back to
      // base_servings when null. Lets the detail page remember "I always
      // halve this one" without changing the source recipe.
      `ALTER TABLE recipes ADD COLUMN preferred_servings INTEGER`,
    ],
  },
  {
    version: 4,
    name: "add_global_shopping_list",
    statements: [
      // Recipes the user has chosen to send to the global shopping list. We
      // keep a small audit trail (added_at) so the 30-day cleanup pass has
      // something to filter on.
      `CREATE TABLE IF NOT EXISTS shopping_list_recipes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        scaled_servings INTEGER,
        added_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_shopping_list_recipes_added
        ON shopping_list_recipes(added_at)`,

      // Free-form items the user types directly into the shopping list
      // (e.g. "paper towels"). Has its own is_checked because it's a leaf
      // row, not an aggregate from a recipe.
      `CREATE TABLE IF NOT EXISTS shopping_list_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        quantity REAL,
        unit TEXT,
        aisle TEXT NOT NULL DEFAULT 'Other',
        is_checked INTEGER NOT NULL DEFAULT 0,
        added_at TEXT NOT NULL DEFAULT (datetime('now')),
        checked_at TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_shopping_list_items_added
        ON shopping_list_items(added_at)`,

      // Aggregate item ids (e.g. "dim-tomato|volume") survive across
      // refreshes since they hash deterministically from the canonical
      // ingredient name. We persist their checked state here so the user
      // doesn't lose progress when adding/removing recipes.
      `CREATE TABLE IF NOT EXISTS shopping_list_checks (
        item_id TEXT PRIMARY KEY,
        is_checked INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
  },
  {
    version: 5,
    name: "add_recipe_description",
    statements: [
      // Many recipe sources (NYT Cooking, NPR, food blogs) ship a short
      // narrative blurb in their JSON-LD `description` field. We were
      // dumping that into `notes`, which clobbered the user's own notes
      // and put the wrong content under the "Notes" heading. The new
      // `description` column is a separate, scraper-owned field.
      `ALTER TABLE recipes ADD COLUMN description TEXT`,
    ],
  },
  {
    version: 6,
    name: "split_type_into_type_and_cooking_method",
    statements: [
      // SQLite can't ALTER a CHECK constraint in place, so we recreate
      // the categories table with the expanded `kind` allow-list and
      // copy the rows over. We also take the chance to migrate the
      // existing cooking-method-shaped rows (Bake, Grill, One-pot, Sheet
      // pan, Stir-fry, Roast) from `type` into the new `cooking_method`
      // bucket so the user doesn't have to re-tag every recipe by hand.
      `CREATE TABLE categories_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL CHECK (kind IN ('cuisine','protein','type','cooking_method','effort','tag','dietary')),
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        UNIQUE(kind, name)
      )`,
      // CASE expression to retag the rows we want to relocate while
      // copying. We keep the original `id` so any existing
      // recipe_categories rows continue to point at the same category.
      `INSERT INTO categories_new (id, kind, name, sort_order)
        SELECT
          id,
          CASE
            WHEN kind = 'type' AND name IN (
              'Bake', 'Grill', 'One-pot', 'Sheet pan', 'Stir-fry', 'Roast'
            ) THEN 'cooking_method'
            ELSE kind
          END AS kind,
          name,
          sort_order
        FROM categories`,
      `DROP TABLE categories`,
      `ALTER TABLE categories_new RENAME TO categories`,
      `CREATE INDEX IF NOT EXISTS idx_categories_kind ON categories(kind, sort_order)`,
    ],
  },
  {
    version: 7,
    name: "tag_global_shopping_entries_with_plan",
    statements: [
      // When the user clicks "Add this plan to my shopping list", we
      // push one `shopping_list_recipes` row per plan recipe and tag
      // each one with its source plan_id. That lets the per-plan
      // shopping list show "Add to main list" or "Remove from main
      // list" idempotently — we know which entries on the global list
      // came from which plan, without affecting recipes the user added
      // standalone from the recipe detail page.
      //
      // `ON DELETE SET NULL` rather than CASCADE: if the user deletes
      // a plan we don't want to silently yank its recipes from the
      // already-printed shopping list. Better to orphan them.
      `ALTER TABLE shopping_list_recipes
        ADD COLUMN from_plan_id INTEGER REFERENCES meal_plans(id) ON DELETE SET NULL`,
      `CREATE INDEX IF NOT EXISTS idx_shopping_list_recipes_from_plan
        ON shopping_list_recipes(from_plan_id)`,
    ],
  },
  {
    version: 8,
    name: "add_plan_day_notes",
    statements: [
      // Free-form per-day notes shown above the meal slots in the
      // planner — "kids at grandma's tonight", "use up the half-loaf of
      // bread", etc. UNIQUE(plan_id, date) so we get an idempotent
      // upsert with INSERT OR REPLACE.
      `CREATE TABLE IF NOT EXISTS meal_plan_day_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_id INTEGER NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(plan_id, date)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_meal_plan_day_notes_plan
        ON meal_plan_day_notes(plan_id)`,
    ],
  },
  {
    version: 9,
    name: "add_meal_plan_slot_recipes",
    statements: [
      // Junction table for multiple recipes per slot. Each row pairs a
      // slot with a recipe and its own scaled_servings + display order.
      // The pre-existing `meal_plan_slots.recipe_id` column is kept
      // around — populated with the first attached recipe — so older
      // queries (e.g. cleanup tasks) keep working. New code reads from
      // this junction table.
      `CREATE TABLE IF NOT EXISTS meal_plan_slot_recipes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slot_id INTEGER NOT NULL REFERENCES meal_plan_slots(id) ON DELETE CASCADE,
        recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        scaled_servings INTEGER,
        position INTEGER NOT NULL DEFAULT 0,
        UNIQUE(slot_id, recipe_id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_meal_plan_slot_recipes_slot
        ON meal_plan_slot_recipes(slot_id)`,
      // Backfill from the legacy single-recipe column so existing
      // plans don't appear empty after upgrade.
      `INSERT INTO meal_plan_slot_recipes (slot_id, recipe_id, scaled_servings, position)
        SELECT id, recipe_id, scaled_servings, 0
        FROM meal_plan_slots
        WHERE recipe_id IS NOT NULL`,
    ],
  },
  {
    version: 10,
    name: "add_recipe_section_headers",
    statements: [
      // Optional grouping label for both ingredient and instruction
      // rows so a recipe can render multiple sub-recipes ("Cake",
      // "Frosting") with their own headers. NULL means "no section"
      // (the legacy flat list), which is the default for everything
      // imported before this migration.
      `ALTER TABLE recipe_ingredients ADD COLUMN section_name TEXT`,
      `ALTER TABLE recipe_steps ADD COLUMN section_name TEXT`,
    ],
  },
];
