import { differenceInCalendarDays, parseISO, getISOWeek } from "date-fns";
import type {
  AutoSelectOptions,
  AutoSelectResult,
  PlannerRecipe,
  PlannerSlot,
} from "@/lib/planner/types";
import { createPrng, shuffleInPlace } from "@/lib/planner/random";

const HARD_FAIL = -Infinity;
const BREAKFAST_TYPE = "breakfast";

function isBreakfastRecipe(recipe: PlannerRecipe): boolean {
  return recipe.types.some((t) => t.toLowerCase() === BREAKFAST_TYPE);
}

interface AssignmentState {
  slots: PlannerSlot[];
  assignments: Map<number, number | null>; // slotId -> recipeId
  cuisinesByWeek: Map<number, Map<string, number>>;
  /**
   * Recipe occurrences within each ISO week. Used to hard-reject a recipe
   * that has already been placed in the same week, regardless of how few
   * other candidates exist — the user explicitly asked for "never the same
   * recipe twice in a week".
   */
  recipesByWeek: Map<number, Set<number>>;
  usedCounts: Map<number, number>;
  selectedIngredients: Set<string>;
  perishableUsage: Map<string, number>;
  proteinCounts: Map<string, number>;
  typeCounts: Map<string, number>;
  cuisineBySlotId: Map<number, string | null>;
}

/**
 * Greedy heuristic with multiple restarts: shuffles the slot order, fills each
 * slot with the highest-scoring eligible recipe, and keeps the best run.
 *
 * Hard constraints:
 *  - No two slots that are "in a row" (same day or +/- 1 day apart) share
 *    a cuisine.
 *  - A recipe cannot appear more than once in the same ISO week.
 *  - At most 2 occurrences of a cuisine per ISO week.
 *  - Don't pick a recipe cooked in the last `recentlyCookedDays`.
 *  - Locked slots are honored: their recipeId is fixed.
 */
export function autoSelect(
  recipes: PlannerRecipe[],
  slots: PlannerSlot[],
  options: AutoSelectOptions,
): AutoSelectResult {
  if (slots.length === 0) {
    return { assignments: [], score: 0 };
  }

  const slotOrder = { breakfast: 0, lunch: 1, dinner: 2 } as const;
  const sortedSlots = [...slots].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return slotOrder[a.slot] - slotOrder[b.slot];
  });

  const today = new Date();
  const recipesById = new Map(recipes.map((r) => [r.id, r]));
  const eligibleByRecency = recipes.filter((r) => {
    if (!r.lastCookedAt) return true;
    const daysSince = differenceInCalendarDays(
      today,
      parseISO(r.lastCookedAt),
    );
    return daysSince >= options.recentlyCookedDays;
  });

  if (eligibleByRecency.length === 0) {
    return {
      assignments: sortedSlots.map((s) => ({
        slotId: s.id,
        recipeId: s.recipeId,
      })),
      score: 0,
      reason: "No recipes are eligible (everything was cooked recently).",
    };
  }

  const restarts = Math.max(1, options.restarts);
  const baseSeed = options.seed ?? Math.floor(Math.random() * 0xffffffff);

  let best: AutoSelectResult = {
    assignments: sortedSlots.map((s) => ({
      slotId: s.id,
      recipeId: s.recipeId,
    })),
    score: -Infinity,
  };

  for (let attempt = 0; attempt < restarts; attempt++) {
    const rand = createPrng(baseSeed + attempt);

    const state: AssignmentState = {
      slots: sortedSlots,
      assignments: new Map(),
      cuisinesByWeek: new Map(),
      recipesByWeek: new Map(),
      usedCounts: new Map(),
      selectedIngredients: new Set(),
      perishableUsage: new Map(),
      proteinCounts: new Map(),
      typeCounts: new Map(),
      cuisineBySlotId: new Map(),
    };

    // Apply locked / pre-existing assignments first.
    for (const slot of sortedSlots) {
      if (slot.isLocked && slot.recipeId != null) {
        const recipe = recipesById.get(slot.recipeId);
        if (recipe) {
          applyAssignment(state, slot, recipe);
        }
      }
    }

    const fillable = sortedSlots.filter((s) =>
      !(s.isLocked && s.recipeId != null),
    );
    const shuffled = shuffleInPlace([...fillable], rand);

    let total = 0;
    for (const slot of shuffled) {
      const candidates = eligibleByRecency
        .map((recipe) => ({
          recipe,
          score: scoreCandidate(slot, recipe, state, options),
        }))
        .filter((c) => c.score !== HARD_FAIL);

      shuffleInPlace(candidates, rand);
      candidates.sort((a, b) => b.score - a.score);

      const choice = candidates[0];
      if (!choice) {
        state.assignments.set(slot.id, null);
        continue;
      }
      total += choice.score;
      applyAssignment(state, slot, choice.recipe);
    }

    if (total > best.score) {
      best = {
        assignments: sortedSlots.map((s) => ({
          slotId: s.id,
          recipeId: state.assignments.get(s.id) ?? s.recipeId ?? null,
        })),
        score: total,
      };
    }
  }

  return best;
}

function applyAssignment(
  state: AssignmentState,
  slot: PlannerSlot,
  recipe: PlannerRecipe,
) {
  state.assignments.set(slot.id, recipe.id);
  state.cuisineBySlotId.set(slot.id, recipe.cuisine);
  state.usedCounts.set(recipe.id, (state.usedCounts.get(recipe.id) ?? 0) + 1);
  const week = isoWeekKey(slot.date);
  const weekRecipes = state.recipesByWeek.get(week) ?? new Set<number>();
  weekRecipes.add(recipe.id);
  state.recipesByWeek.set(week, weekRecipes);
  if (recipe.cuisine) {
    const cuisineMap =
      state.cuisinesByWeek.get(week) ?? new Map<string, number>();
    cuisineMap.set(
      recipe.cuisine,
      (cuisineMap.get(recipe.cuisine) ?? 0) + 1,
    );
    state.cuisinesByWeek.set(week, cuisineMap);
  }
  for (const ing of recipe.canonicalIngredients) {
    state.selectedIngredients.add(ing);
  }
  for (const ing of recipe.perishableIngredients) {
    state.perishableUsage.set(
      ing,
      (state.perishableUsage.get(ing) ?? 0) + 1,
    );
  }
  for (const protein of recipe.proteins) {
    state.proteinCounts.set(
      protein,
      (state.proteinCounts.get(protein) ?? 0) + 1,
    );
  }
  for (const type of recipe.types) {
    state.typeCounts.set(type, (state.typeCounts.get(type) ?? 0) + 1);
  }
}

function scoreCandidate(
  slot: PlannerSlot,
  recipe: PlannerRecipe,
  state: AssignmentState,
  options: AutoSelectOptions,
): number {
  // Slot-kind partition: breakfast slots only accept recipes tagged with
  // the "Breakfast" type, and non-breakfast slots reject them. Recipes
  // without any type tag fall on the non-breakfast side, since most
  // savory/dinner recipes from scrapers won't carry a type label.
  const recipeIsBreakfast = isBreakfastRecipe(recipe);
  if (slot.slot === "breakfast") {
    if (!recipeIsBreakfast) return HARD_FAIL;
  } else if (recipeIsBreakfast) {
    return HARD_FAIL;
  }

  // Hard rule: a recipe must not appear more than once in the same ISO week.
  const week = isoWeekKey(slot.date);
  if (state.recipesByWeek.get(week)?.has(recipe.id)) {
    return HARD_FAIL;
  }

  if (recipe.cuisine) {
    for (const adj of adjacentSlots(state.slots, slot)) {
      const otherCuisine = state.cuisineBySlotId.get(adj.id);
      if (otherCuisine && otherCuisine === recipe.cuisine) {
        return HARD_FAIL;
      }
    }
    const weekCount =
      state.cuisinesByWeek.get(week)?.get(recipe.cuisine) ?? 0;
    if (weekCount >= 2) return HARD_FAIL;
  }

  let score = 0;

  let overlap = 0;
  for (const ing of recipe.canonicalIngredients) {
    if (state.selectedIngredients.has(ing)) overlap += 1;
  }

  let wasteReduction = 0;
  for (const ing of recipe.perishableIngredients) {
    const usage = state.perishableUsage.get(ing) ?? 0;
    wasteReduction += Math.min(usage + 1, 3);
  }

  const balance = clamp01(options.balance);
  score += (1 - balance) * overlap * 1.0;
  score += balance * wasteReduction * 0.7;

  let varietyBonus = 0;
  for (const protein of recipe.proteins) {
    if ((state.proteinCounts.get(protein) ?? 0) === 0) varietyBonus += 0.6;
  }
  for (const type of recipe.types) {
    if ((state.typeCounts.get(type) ?? 0) === 0) varietyBonus += 0.4;
  }
  score += options.varietyWeight * varietyBonus;

  // Soft penalty for cross-week reuse — the same-week hard rule above already
  // covers within-week. This nudges the heuristic to keep total reuse low
  // across longer plans (e.g. month-long).
  const reuse = state.usedCounts.get(recipe.id) ?? 0;
  score -= reuse * 4;

  return score;
}

function adjacentSlots(slots: PlannerSlot[], current: PlannerSlot) {
  const out: PlannerSlot[] = [];
  const currentDate = parseISO(current.date);
  for (const slot of slots) {
    if (slot.id === current.id) continue;
    if (slot.date === current.date) {
      out.push(slot);
      continue;
    }
    const days = differenceInCalendarDays(parseISO(slot.date), currentDate);
    if (Math.abs(days) === 1) out.push(slot);
  }
  return out;
}

function isoWeekKey(dateString: string): number {
  const date = parseISO(dateString);
  return getISOWeek(date) + date.getFullYear() * 100;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
