// Schema types live in @paperplate/core now (shared between desktop and
// mobile). This file is a stable proxy so existing `@/lib/db/schema`
// imports across the desktop codebase keep working without churn.
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
} from "@paperplate/core";
export { MEAL_SLOT_ORDER } from "@paperplate/core";
