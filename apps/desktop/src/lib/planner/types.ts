export interface PlannerRecipe {
  id: number;
  title: string;
  baseServings: number;
  cuisine: string | null;
  proteins: string[];
  types: string[];
  /** Set of canonical ingredient names. */
  canonicalIngredients: Set<string>;
  /** Subset of canonicalIngredients flagged perishable. */
  perishableIngredients: Set<string>;
  lastCookedAt: string | null;
}

export interface PlannerSlot {
  id: number;
  date: string; // YYYY-MM-DD
  slot: "breakfast" | "lunch" | "dinner";
  recipeId: number | null;
  isLocked: boolean;
}

export interface AutoSelectOptions {
  /** Maps 0..1: 0 = pure overlap, 1 = pure waste reduction. */
  balance: number;
  /** Multiplier for the variety bonus. */
  varietyWeight: number;
  /** Number of days back to enforce "recently cooked" hard constraint. */
  recentlyCookedDays: number;
  /** Number of restarts in the greedy heuristic. */
  restarts: number;
  /** Optional deterministic seed (for tests). */
  seed?: number;
}

export interface AutoSelectResult {
  assignments: Array<{ slotId: number; recipeId: number | null }>;
  score: number;
  reason?: string;
}
