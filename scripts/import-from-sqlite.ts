/**
 * One-time importer: paperplate SQLite (v10 schema) → Supabase.
 *
 * Reads a paperplate.db file and inserts every row into the matching
 * Postgres table, preserving primary keys so foreign keys still resolve.
 * Booleans (0/1), date strings, and items_json are converted in flight.
 *
 * Hero images are intentionally NOT uploaded by this script — image_path
 * is copied verbatim from the source DB so a follow-up image-upload pass
 * can find files by their legacy hash names. Recipes whose image_path
 * points at a non-existent file are logged at the end.
 *
 * Run from repo root:
 *   npm -w @paperplate/scripts run import -- /path/to/paperplate.db
 */

import { createClient } from "@supabase/supabase-js";
import Database from "better-sqlite3";
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

loadDotenv({ path: resolve(import.meta.dirname, "..", ".env") });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const sqlitePath = process.argv[2];
if (!sqlitePath) {
  console.error("Usage: npm -w @paperplate/scripts run import -- <path-to-paperplate.db>");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const db = new Database(sqlitePath, { readonly: true, fileMustExist: true });

const sqliteVersion = db
  .prepare("PRAGMA user_version")
  .get() as { user_version: number };
console.log(`Source DB schema version: ${sqliteVersion.user_version}`);
if (sqliteVersion.user_version !== 10) {
  console.warn(
    `WARNING: expected user_version=10, got ${sqliteVersion.user_version}. ` +
      `Importer may produce incorrect results for earlier schemas.`,
  );
}

// SQLite stores its NULL/string/0-1 idiom; Postgres wants real types.
// These helpers normalize at the row boundary.
const bool = (v: unknown): boolean => v === 1 || v === true || v === "1";
const ts = (v: unknown): string | null => {
  // SQLite text dates are "YYYY-MM-DD HH:MM:SS" (datetime('now')) or
  // ISO 8601 (when set by the app). Postgres' timestamptz parser accepts
  // both, but we add a 'Z' suffix to non-tz strings so they're treated as UTC.
  if (v == null || v === "") return null;
  const s = String(v);
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) return s;
  // "YYYY-MM-DD HH:MM:SS" → "YYYY-MM-DD HH:MM:SSZ"
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s}Z` : s;
};
const dateOnly = (v: unknown): string | null => {
  if (v == null || v === "") return null;
  return String(v).slice(0, 10);
};

interface ImportStep {
  table: string;
  rows: () => any[];
}

const steps: ImportStep[] = [
  {
    table: "aisles",
    rows: () =>
      db
        .prepare("SELECT id, name, sort_order FROM aisles")
        .all()
        .map((r: any) => ({ id: r.id, name: r.name, sort_order: r.sort_order })),
  },
  {
    table: "categories",
    rows: () =>
      db
        .prepare("SELECT id, kind, name, sort_order FROM categories")
        .all()
        .map((r: any) => ({
          id: r.id,
          kind: r.kind,
          name: r.name,
          sort_order: r.sort_order,
        })),
  },
  {
    table: "ingredient_aisle_map",
    rows: () =>
      db
        .prepare("SELECT item_canonical, aisle_id FROM ingredient_aisle_map")
        .all()
        .map((r: any) => ({
          item_canonical: r.item_canonical,
          aisle_id: r.aisle_id,
        })),
  },
  {
    table: "recipes",
    rows: () =>
      db
        .prepare(
          `SELECT id, title, description, source_url, image_path, base_servings,
                  preferred_servings, prep_min, cook_min, total_min, difficulty,
                  rating, last_cooked_at, notes, raw_html, created_at, updated_at
             FROM recipes`,
        )
        .all()
        .map((r: any) => ({
          id: r.id,
          title: r.title,
          description: r.description,
          source_url: r.source_url,
          image_path: r.image_path, // kept verbatim; image upload is a separate pass
          base_servings: r.base_servings,
          preferred_servings: r.preferred_servings,
          prep_min: r.prep_min,
          cook_min: r.cook_min,
          total_min: r.total_min,
          difficulty: r.difficulty,
          rating: r.rating,
          last_cooked_at: ts(r.last_cooked_at),
          notes: r.notes,
          raw_html: r.raw_html,
          created_at: ts(r.created_at),
          updated_at: ts(r.updated_at),
        })),
  },
  {
    table: "recipe_ingredients",
    rows: () =>
      db
        .prepare(
          `SELECT id, recipe_id, position, raw_text, quantity, unit,
                  item_canonical, item_display, preparation, is_optional, section_name
             FROM recipe_ingredients`,
        )
        .all()
        .map((r: any) => ({
          id: r.id,
          recipe_id: r.recipe_id,
          position: r.position,
          raw_text: r.raw_text,
          quantity: r.quantity,
          unit: r.unit,
          item_canonical: r.item_canonical,
          item_display: r.item_display,
          preparation: r.preparation,
          is_optional: bool(r.is_optional),
          section_name: r.section_name,
        })),
  },
  {
    table: "recipe_steps",
    rows: () =>
      db
        .prepare(
          "SELECT id, recipe_id, position, text, section_name FROM recipe_steps",
        )
        .all()
        .map((r: any) => ({
          id: r.id,
          recipe_id: r.recipe_id,
          position: r.position,
          text: r.text,
          section_name: r.section_name,
        })),
  },
  {
    table: "recipe_categories",
    rows: () =>
      db
        .prepare("SELECT recipe_id, category_id FROM recipe_categories")
        .all()
        .map((r: any) => ({
          recipe_id: r.recipe_id,
          category_id: r.category_id,
        })),
  },
  {
    table: "meal_plans",
    rows: () =>
      db
        .prepare(
          "SELECT id, name, start_date, end_date, created_at FROM meal_plans",
        )
        .all()
        .map((r: any) => ({
          id: r.id,
          name: r.name,
          start_date: dateOnly(r.start_date),
          end_date: dateOnly(r.end_date),
          created_at: ts(r.created_at),
        })),
  },
  {
    table: "meal_plan_slots",
    rows: () =>
      db
        .prepare(
          `SELECT id, plan_id, date, slot, recipe_id, scaled_servings, is_locked
             FROM meal_plan_slots`,
        )
        .all()
        .map((r: any) => ({
          id: r.id,
          plan_id: r.plan_id,
          date: dateOnly(r.date),
          slot: r.slot,
          recipe_id: r.recipe_id,
          scaled_servings: r.scaled_servings,
          is_locked: bool(r.is_locked),
        })),
  },
  {
    table: "meal_plan_slot_recipes",
    rows: () =>
      db
        .prepare(
          `SELECT id, slot_id, recipe_id, scaled_servings, position
             FROM meal_plan_slot_recipes`,
        )
        .all()
        .map((r: any) => ({
          id: r.id,
          slot_id: r.slot_id,
          recipe_id: r.recipe_id,
          scaled_servings: r.scaled_servings,
          position: r.position,
        })),
  },
  {
    table: "meal_plan_day_notes",
    rows: () =>
      db
        .prepare(
          "SELECT id, plan_id, date, notes, updated_at FROM meal_plan_day_notes",
        )
        .all()
        .map((r: any) => ({
          id: r.id,
          plan_id: r.plan_id,
          date: dateOnly(r.date),
          notes: r.notes,
          updated_at: ts(r.updated_at),
        })),
  },
  {
    table: "shopping_lists",
    rows: () =>
      db
        .prepare(
          "SELECT id, plan_id, generated_at, items_json FROM shopping_lists",
        )
        .all()
        .map((r: any) => ({
          id: r.id,
          plan_id: r.plan_id,
          generated_at: ts(r.generated_at),
          items_json: JSON.parse(r.items_json),
        })),
  },
  {
    table: "shopping_list_recipes",
    rows: () =>
      db
        .prepare(
          `SELECT id, recipe_id, scaled_servings, from_plan_id, added_at
             FROM shopping_list_recipes`,
        )
        .all()
        .map((r: any) => ({
          id: r.id,
          recipe_id: r.recipe_id,
          scaled_servings: r.scaled_servings,
          from_plan_id: r.from_plan_id,
          added_at: ts(r.added_at),
        })),
  },
  {
    table: "shopping_list_items",
    rows: () =>
      db
        .prepare(
          `SELECT id, name, quantity, unit, aisle, is_checked, added_at, checked_at
             FROM shopping_list_items`,
        )
        .all()
        .map((r: any) => ({
          id: r.id,
          name: r.name,
          quantity: r.quantity,
          unit: r.unit,
          aisle: r.aisle,
          is_checked: bool(r.is_checked),
          added_at: ts(r.added_at),
          checked_at: ts(r.checked_at),
        })),
  },
  {
    table: "shopping_list_checks",
    rows: () =>
      db
        .prepare("SELECT item_id, is_checked, updated_at FROM shopping_list_checks")
        .all()
        .map((r: any) => ({
          item_id: r.item_id,
          is_checked: bool(r.is_checked),
          updated_at: ts(r.updated_at),
        })),
  },
];

const BATCH_SIZE = 500;

async function importStep(step: ImportStep): Promise<number> {
  const rows = step.rows();
  if (rows.length === 0) {
    console.log(`  ${step.table}: 0 rows`);
    return 0;
  }
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(step.table).insert(batch);
    if (error) {
      console.error(`  ${step.table}: insert failed at batch ${i / BATCH_SIZE}`);
      console.error(error);
      throw new Error(`Insert failed for ${step.table}: ${error.message}`);
    }
  }
  console.log(`  ${step.table}: ${rows.length} rows`);
  return rows.length;
}

async function main() {
  console.log(`Importing ${sqlitePath} → ${SUPABASE_URL}`);
  console.log("");
  let total = 0;
  for (const step of steps) {
    total += await importStep(step);
  }
  console.log("");
  console.log(`Inserted ${total} rows.`);

  console.log("Bumping identity sequences past preserved MAX(id) values...");
  const { error: rpcError } = await supabase.rpc("reset_id_sequences");
  if (rpcError) {
    console.error("reset_id_sequences RPC failed:", rpcError);
    process.exit(1);
  }
  console.log("Sequences bumped.");

  const missingImages = db
    .prepare(
      `SELECT id, title, image_path
         FROM recipes
        WHERE image_path IS NOT NULL`,
    )
    .all() as Array<{ id: number; title: string; image_path: string }>;

  if (missingImages.length > 0) {
    console.log("");
    console.log(`${missingImages.length} recipes reference hero images that have NOT been uploaded:`);
    for (const r of missingImages) {
      console.log(`  recipe #${r.id}  "${r.title}"  →  ${r.image_path}`);
    }
    console.log("");
    console.log(
      "To upload them, drop the source `images/` folder (from " +
        "`~/Library/Application Support/com.paperplate.app/`) somewhere on this " +
        "machine and ask Claude to wire up the image-upload follow-up pass.",
    );
  }

  db.close();
}

main().catch((err) => {
  console.error(err);
  db.close();
  process.exit(1);
});
