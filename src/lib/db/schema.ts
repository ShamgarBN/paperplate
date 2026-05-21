// Type definitions that mirror the SQLite schema (see migrations.ts).
// Kept in plain TypeScript rather than Drizzle so we have one source of truth
// that runs in Tauri's bundled SQLite plugin without extra runtime tooling.

export interface Recipe {
  id: number;
  title: string;
  source_url: string | null;
  image_path: string | null;
  base_servings: number;
  preferred_servings: number | null;
  prep_min: number | null;
  cook_min: number | null;
  total_min: number | null;
  difficulty: "easy" | "medium" | "hard" | null;
  rating: number | null;
  last_cooked_at: string | null;
  /**
   * Narrative blurb pulled from the source page (or written by the user
   * in the editor). Rendered at the top of the recipe detail page,
   * directly under the title. Distinct from `notes`, which is meant for
   * the cook's *own* tasting notes and is rendered at the bottom.
   */
  description: string | null;
  notes: string | null;
  raw_html: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecipeIngredient {
  id: number;
  recipe_id: number;
  position: number;
  raw_text: string;
  quantity: number | null;
  unit: string | null;
  item_canonical: string;
  item_display: string;
  preparation: string | null;
  is_optional: 0 | 1;
  /**
   * Optional grouping label for sub-recipes. When set, the recipe
   * detail page renders this name as a header above the corresponding
   * group of ingredients (e.g. "Cake", "Frosting"). NULL means the
   * row belongs to the unlabelled top-level list.
   */
  section_name: string | null;
}

export interface RecipeStep {
  id: number;
  recipe_id: number;
  position: number;
  text: string;
  /** See {@link RecipeIngredient.section_name}. */
  section_name: string | null;
}

/**
 * Categorisation axis for a recipe. `type` describes *what the dish is*
 * ("Main", "Soup/Stew", "Dessert"), whereas `cooking_method` describes
 * *how it's prepared* ("Oven", "Grill", "Air-Fryer"). They used to share
 * a single bucket but the user feedback was that "Stir-fry the Pasta" is
 * a perfectly normal combination, and so the two axes needed to live
 * independently — see migration 5 for the split.
 */
export type CategoryKind =
  | "cuisine"
  | "protein"
  | "type"
  | "cooking_method"
  | "effort"
  | "tag"
  | "dietary";

export interface Category {
  id: number;
  kind: CategoryKind;
  name: string;
  sort_order: number;
}

export interface RecipeCategory {
  recipe_id: number;
  category_id: number;
}

export interface MealPlan {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  created_at: string;
}

export type MealSlotKind = "breakfast" | "lunch" | "dinner";

/**
 * Stable ordinal for a meal slot — used to sort slots within a day in
 * chronological order regardless of the underlying string value.
 */
export const MEAL_SLOT_ORDER: Record<MealSlotKind, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
};

export interface MealPlanSlot {
  id: number;
  plan_id: number;
  date: string;
  slot: MealSlotKind;
  /**
   * @deprecated Legacy single-recipe column. Kept for the cleanup pass
   * and shopping-list aggregation fallback, but the canonical source of
   * truth for "which recipes are in this slot" is the
   * `meal_plan_slot_recipes` junction table. New code should consume
   * {@link PlanSlotWithRecipes.recipes} from `planRepo.ts`.
   */
  recipe_id: number | null;
  /** @deprecated See note on `recipe_id`. */
  scaled_servings: number | null;
  is_locked: 0 | 1;
}

/**
 * One recipe attached to a meal-plan slot. Slots can have multiple
 * attachments (e.g. "main course" + "side"), each scaled independently.
 * Position controls the display order in the calendar cell.
 */
export interface MealPlanSlotRecipe {
  id: number;
  slot_id: number;
  recipe_id: number;
  scaled_servings: number | null;
  position: number;
}

export interface ShoppingListSnapshot {
  id: number;
  plan_id: number;
  generated_at: string;
  items_json: string;
}

export interface Aisle {
  id: number;
  name: string;
  sort_order: number;
}

export interface IngredientAisleEntry {
  item_canonical: string;
  aisle_id: number;
}

export interface ShoppingListRecipeEntry {
  id: number;
  recipe_id: number;
  scaled_servings: number | null;
  added_at: string;
}

export interface ShoppingListExtraItem {
  id: number;
  name: string;
  quantity: number | null;
  unit: string | null;
  aisle: string;
  is_checked: 0 | 1;
  added_at: string;
  checked_at: string | null;
}

export interface ShoppingListCheck {
  item_id: string;
  is_checked: 0 | 1;
  updated_at: string;
}
