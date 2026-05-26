// Shared core: types, planner heuristic, ingredient parsing/canonicalization,
// shopping aggregation. Consumed by both apps/desktop and apps/mobile.

// ---------- Types (originally apps/desktop/src/lib/db/schema.ts) ----------
export type {
  Recipe,
  RecipeIngredient,
  RecipeStep,
  Category,
  CategoryKind,
  RecipeCategory,
  MealPlan,
  MealSlotKind,
  MealPlanSlot,
  MealPlanSlotRecipe,
  ShoppingListSnapshot,
  Aisle,
  IngredientAisleEntry,
  ShoppingListRecipeEntry,
  ShoppingListExtraItem,
  ShoppingListCheck,
} from "./db/schema";
export { MEAL_SLOT_ORDER } from "./db/schema";

// ---------- Ingredients ----------
export {
  canonicalizeName,
  aisleFor,
  isIndivisible,
  approxUnitWeight,
  isPerishable,
  knownAisleEntries,
} from "./ingredients/canonicalize";
export type {
  CanonicalIngredient,
  CanonicalizationResult,
} from "./ingredients/canonicalize";

export {
  formatQuantity,
  normalizeFractionGlyphs,
  parseLeadingQuantity,
} from "./ingredients/fractions";

export { parseIngredient } from "./ingredients/parser";
export type { ParsedIngredient } from "./ingredients/parser";

export {
  UNITS,
  findUnit,
  unitDisplay,
  convert,
  preferredDisplay,
} from "./ingredients/units";
export type { UnitDefinition, UnitDimension } from "./ingredients/units";

// ---------- Shopping ----------
export { buildShoppingList, toPlainText } from "./shopping";
export type { ShoppingItem } from "./shopping";

// ---------- Planner ----------
export { autoSelect } from "./planner/autoSelect";
export type {
  AutoSelectOptions,
  AutoSelectResult,
  PlannerRecipe,
  PlannerSlot,
} from "./planner/types";
export { createPrng, shuffleInPlace } from "./planner/random";
