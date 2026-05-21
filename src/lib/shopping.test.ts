import { describe, expect, it } from "vitest";
import { buildShoppingList, toPlainText } from "@/lib/shopping";
import type {
  MealPlanSlot,
  Recipe,
  RecipeIngredient,
} from "@/lib/db/schema";

const recipe = (
  partial: Partial<Recipe> & {
    id: number;
    title: string;
    base_servings: number;
  },
): Recipe => ({
  source_url: null,
  image_path: null,
  preferred_servings: null,
  prep_min: null,
  cook_min: null,
  total_min: null,
  difficulty: null,
  rating: null,
  last_cooked_at: null,
  notes: null,
  raw_html: null,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  ...partial,
});

const ing = (
  partial: Partial<RecipeIngredient> & {
    id: number;
    recipe_id: number;
    quantity: number | null;
    unit: string | null;
    item_canonical: string;
    item_display: string;
  },
): RecipeIngredient => ({
  position: 0,
  raw_text: "",
  preparation: null,
  is_optional: 0,
  ...partial,
});

const slot = (
  partial: Partial<MealPlanSlot> & {
    id: number;
    plan_id: number;
    recipe_id: number;
  },
): MealPlanSlot => ({
  date: "2026-01-01",
  slot: "dinner",
  scaled_servings: null,
  is_locked: 0,
  ...partial,
});

describe("buildShoppingList", () => {
  it("aggregates and reconciles units across recipes", () => {
    const r1 = recipe({ id: 1, title: "Pasta", base_servings: 4 });
    const r2 = recipe({ id: 2, title: "Bread", base_servings: 2 });
    const ingredients = new Map<number, RecipeIngredient[]>([
      [
        1,
        [
          ing({
            id: 11,
            recipe_id: 1,
            quantity: 2,
            unit: "cup",
            item_canonical: "all-purpose flour",
            item_display: "All-purpose flour",
          }),
          ing({
            id: 12,
            recipe_id: 1,
            quantity: 1,
            unit: null,
            item_canonical: "yellow onion",
            item_display: "Yellow onion",
          }),
        ],
      ],
      [
        2,
        [
          ing({
            id: 21,
            recipe_id: 2,
            quantity: 1,
            unit: "cup",
            item_canonical: "all-purpose flour",
            item_display: "All-purpose flour",
          }),
        ],
      ],
    ]);

    const items = buildShoppingList({
      slots: [
        slot({ id: 1, plan_id: 1, recipe_id: 1, scaled_servings: 4 }),
        slot({ id: 2, plan_id: 1, recipe_id: 2, scaled_servings: 4 }),
      ],
      recipesById: new Map([
        [1, r1],
        [2, r2],
      ]),
      ingredientsByRecipeId: ingredients,
      aisleByCanonical: new Map([
        ["all-purpose flour", "Pantry & Dry Goods"],
        ["yellow onion", "Produce"],
      ]),
    });

    const flour = items.find((i) => i.itemCanonical === "all-purpose flour");
    expect(flour).toBeTruthy();
    // Bread doubled (2 servings -> 4 servings) gives 2 cups, plus pasta 2 cups = 4 cups.
    expect(flour?.totalQuantity).toBeCloseTo(4, 5);
    expect(flour?.aisle).toBe("Pantry & Dry Goods");

    const onion = items.find((i) => i.itemCanonical === "yellow onion");
    expect(onion?.totalQuantity).toBe(1);
    expect(onion?.display).toContain("Yellow onion");
  });

  it("rounds indivisible items up to whole units", () => {
    const r = recipe({ id: 1, title: "Curry", base_servings: 4 });
    const items = buildShoppingList({
      slots: [
        slot({ id: 1, plan_id: 1, recipe_id: 1, scaled_servings: 6 }),
      ],
      recipesById: new Map([[1, r]]),
      ingredientsByRecipeId: new Map([
        [
          1,
          [
            ing({
              id: 1,
              recipe_id: 1,
              quantity: 1,
              unit: null,
              item_canonical: "yellow onion",
              item_display: "Yellow onion",
            }),
          ],
        ],
      ]),
      aisleByCanonical: new Map(),
    });
    // 1 onion * (6/4) = 1.5 → rounds up to 2.
    expect(items[0]?.totalQuantity).toBe(2);
    expect(items[0]?.aisle).toBe("Other");
  });

  it("preserves count units (cloves stay cloves)", () => {
    const r = recipe({ id: 1, title: "Pesto", base_servings: 2 });
    const items = buildShoppingList({
      slots: [slot({ id: 1, plan_id: 1, recipe_id: 1 })],
      recipesById: new Map([[1, r]]),
      ingredientsByRecipeId: new Map([
        [
          1,
          [
            ing({
              id: 1,
              recipe_id: 1,
              quantity: 3,
              unit: "clove",
              item_canonical: "garlic clove",
              item_display: "Garlic clove",
            }),
          ],
        ],
      ]),
      aisleByCanonical: new Map([["garlic clove", "Produce"]]),
    });
    expect(items[0]?.display).toMatch(/clove/);
  });

  it("formats plain text grouped by aisle", () => {
    const items = [
      {
        id: "a",
        itemCanonical: "yellow onion",
        itemDisplay: "Yellow onion",
        totalQuantity: 2,
        totalUnit: null,
        display: "2 Yellow onions",
        aisle: "Produce",
        isOptional: false,
        perishable: true,
        contributors: ["Pasta"],
      },
      {
        id: "b",
        itemCanonical: "all-purpose flour",
        itemDisplay: "All-purpose flour",
        totalQuantity: 4,
        totalUnit: null,
        display: "4 cups All-purpose flour",
        aisle: "Pantry & Dry Goods",
        isOptional: false,
        perishable: false,
        contributors: ["Bread"],
      },
    ];
    const text = toPlainText(items);
    expect(text).toContain("# PRODUCE");
    expect(text).toContain("- 2 Yellow onions");
    expect(text).toContain("# PANTRY & DRY GOODS");
  });
});
