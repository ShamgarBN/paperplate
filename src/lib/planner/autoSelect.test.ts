import { describe, expect, it } from "vitest";
import { autoSelect } from "@/lib/planner/autoSelect";
import type { PlannerRecipe, PlannerSlot } from "@/lib/planner/types";

const baseOpts = {
  balance: 0.5,
  varietyWeight: 1,
  recentlyCookedDays: 14,
  restarts: 8,
  seed: 42,
};

function recipe(
  id: number,
  partial: Partial<PlannerRecipe> = {},
): PlannerRecipe {
  return {
    id,
    title: `Recipe ${id}`,
    baseServings: 4,
    cuisine: null,
    proteins: [],
    types: [],
    canonicalIngredients: new Set(),
    perishableIngredients: new Set(),
    lastCookedAt: null,
    ...partial,
  };
}

function slot(
  id: number,
  date: string,
  type: PlannerSlot["slot"] = "dinner",
): PlannerSlot {
  return { id, date, slot: type, recipeId: null, isLocked: false };
}

describe("autoSelect", () => {
  it("fills every slot when there are enough eligible recipes", () => {
    const recipes = [
      recipe(1, { cuisine: "italian" }),
      recipe(2, { cuisine: "mexican" }),
      recipe(3, { cuisine: "asian" }),
      recipe(4, { cuisine: "american" }),
    ];
    const slots = [
      slot(101, "2026-05-04"),
      slot(102, "2026-05-05"),
      slot(103, "2026-05-06"),
      slot(104, "2026-05-07"),
    ];
    const result = autoSelect(recipes, slots, baseOpts);
    for (const a of result.assignments) {
      expect(a.recipeId).not.toBeNull();
    }
  });

  it("never places the same cuisine on adjacent days", () => {
    const recipes = [
      recipe(1, { cuisine: "italian" }),
      recipe(2, { cuisine: "italian" }),
      recipe(3, { cuisine: "mexican" }),
      recipe(4, { cuisine: "asian" }),
      recipe(5, { cuisine: "american" }),
      recipe(6, { cuisine: "french" }),
    ];
    const slots = [
      slot(101, "2026-05-04"),
      slot(102, "2026-05-05"),
      slot(103, "2026-05-06"),
      slot(104, "2026-05-07"),
    ];
    const result = autoSelect(recipes, slots, baseOpts);
    const cuisineByDate: Record<string, string | null> = {};
    for (const a of result.assignments) {
      const s = slots.find((x) => x.id === a.slotId)!;
      const r = a.recipeId ? recipes.find((x) => x.id === a.recipeId) : null;
      cuisineByDate[s.date] = r?.cuisine ?? null;
    }
    const dates = Object.keys(cuisineByDate).sort();
    for (let i = 1; i < dates.length; i++) {
      const prevDate = dates[i - 1]!;
      const curDate = dates[i]!;
      const prev = cuisineByDate[prevDate]!;
      const cur = cuisineByDate[curDate]!;
      if (prev && cur) expect(prev).not.toEqual(cur);
    }
  });

  it("caps cuisines at 2 occurrences per ISO week", () => {
    const recipes = Array.from({ length: 10 }, (_, i) =>
      recipe(i + 1, { cuisine: i < 5 ? "italian" : "mexican" }),
    );
    const slots = [
      slot(1, "2026-05-04"),
      slot(2, "2026-05-05"),
      slot(3, "2026-05-06"),
      slot(4, "2026-05-07"),
      slot(5, "2026-05-08"),
    ];
    const result = autoSelect(recipes, slots, baseOpts);
    const counts = new Map<string, number>();
    for (const a of result.assignments) {
      const r = a.recipeId ? recipes.find((x) => x.id === a.recipeId) : null;
      if (r?.cuisine) counts.set(r.cuisine, (counts.get(r.cuisine) ?? 0) + 1);
    }
    for (const [, c] of counts) expect(c).toBeLessThanOrEqual(2);
  });

  it("respects locked slots", () => {
    const recipes = [
      recipe(1, { cuisine: "italian" }),
      recipe(2, { cuisine: "mexican" }),
      recipe(3, { cuisine: "asian" }),
    ];
    const slots: PlannerSlot[] = [
      { id: 101, date: "2026-05-04", slot: "dinner", recipeId: 1, isLocked: true },
      slot(102, "2026-05-05"),
      slot(103, "2026-05-06"),
    ];
    const result = autoSelect(recipes, slots, baseOpts);
    const locked = result.assignments.find((a) => a.slotId === 101);
    expect(locked?.recipeId).toBe(1);
  });

  it("prefers ingredient overlap when balance is low", () => {
    const recipes = [
      recipe(1, {
        cuisine: "italian",
        canonicalIngredients: new Set(["tomato", "garlic", "basil"]),
      }),
      recipe(2, {
        cuisine: "mexican",
        canonicalIngredients: new Set(["tomato", "garlic", "lime"]),
      }),
      recipe(3, {
        cuisine: "asian",
        canonicalIngredients: new Set(["soy sauce", "ginger", "rice"]),
      }),
      recipe(4, {
        cuisine: "american",
        canonicalIngredients: new Set(["beef", "onion", "potato"]),
      }),
    ];
    const slots = [slot(1, "2026-05-04"), slot(2, "2026-05-05")];
    const result = autoSelect(recipes, slots, {
      ...baseOpts,
      balance: 0,
      restarts: 16,
    });
    const ids = result.assignments.map((a) => a.recipeId).sort();
    // Recipes 1+2 share tomato + garlic; should prefer that pair.
    expect(ids).toEqual([1, 2]);
  });

  it("excludes recipes cooked within recentlyCookedDays", () => {
    const today = new Date().toISOString().slice(0, 10);
    const recipes = [
      recipe(1, { cuisine: "italian", lastCookedAt: today }),
      recipe(2, { cuisine: "mexican" }),
    ];
    const slots = [slot(1, "2026-05-04")];
    const result = autoSelect(recipes, slots, {
      ...baseOpts,
      recentlyCookedDays: 14,
    });
    expect(result.assignments[0]!.recipeId).toBe(2);
  });

  it("uses Breakfast-tagged recipes for breakfast slots", () => {
    const recipes = [
      recipe(1, { types: ["Breakfast"] }),
      recipe(2, { types: ["Pasta"], cuisine: "italian" }),
    ];
    const slots = [slot(101, "2026-05-04", "breakfast")];
    const result = autoSelect(recipes, slots, baseOpts);
    expect(result.assignments[0]!.recipeId).toBe(1);
  });

  it("rejects Breakfast-tagged recipes for non-breakfast slots", () => {
    const recipes = [
      recipe(1, { types: ["Breakfast"] }),
      recipe(2, { types: ["Pasta"], cuisine: "italian" }),
    ];
    const slots = [slot(101, "2026-05-04", "dinner")];
    const result = autoSelect(recipes, slots, baseOpts);
    expect(result.assignments[0]!.recipeId).toBe(2);
  });

  it("never uses the same recipe twice in the same ISO week", () => {
    // Two recipes only, but seven slots in one ISO week: at least 5 will be
    // unfilled because each recipe is restricted to a single appearance.
    const recipes = [
      recipe(1, { cuisine: "italian" }),
      recipe(2, { cuisine: "mexican" }),
    ];
    const slots = [
      slot(101, "2026-05-04"),
      slot(102, "2026-05-05"),
      slot(103, "2026-05-06"),
      slot(104, "2026-05-07"),
      slot(105, "2026-05-08"),
      slot(106, "2026-05-09"),
      slot(107, "2026-05-10"),
    ];
    const result = autoSelect(recipes, slots, baseOpts);
    const ids = result.assignments
      .map((a) => a.recipeId)
      .filter((id): id is number => id != null);
    const counts = new Map<number, number>();
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const [, count] of counts) expect(count).toBeLessThanOrEqual(1);
  });

  it("allows the same recipe across different ISO weeks", () => {
    const recipes = [recipe(1, { cuisine: "italian" })];
    // Two slots a week apart — different ISO weeks; the recipe may legally
    // appear in both.
    const slots = [slot(101, "2026-05-04"), slot(102, "2026-05-12")];
    const result = autoSelect(recipes, slots, baseOpts);
    for (const a of result.assignments) {
      expect(a.recipeId).toBe(1);
    }
  });

  it("leaves a breakfast slot empty when no breakfast recipes exist", () => {
    const recipes = [
      recipe(1, { types: ["Pasta"], cuisine: "italian" }),
      recipe(2, { types: ["Bowl"], cuisine: "asian" }),
    ];
    const slots = [
      slot(101, "2026-05-04", "breakfast"),
      slot(102, "2026-05-04", "dinner"),
    ];
    const result = autoSelect(recipes, slots, baseOpts);
    const breakfast = result.assignments.find((a) => a.slotId === 101);
    const dinner = result.assignments.find((a) => a.slotId === 102);
    expect(breakfast?.recipeId).toBeNull();
    expect(dinner?.recipeId).not.toBeNull();
  });
});
