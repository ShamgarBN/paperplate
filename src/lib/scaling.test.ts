import { describe, expect, it } from "vitest";
import { scaleIngredients } from "@/lib/scaling";
import type { RecipeIngredient } from "@/lib/db/schema";

const make = (
  partial: Partial<RecipeIngredient> & {
    quantity: number | null;
    unit: string | null;
    item_canonical: string;
    item_display: string;
    raw_text?: string;
  },
): RecipeIngredient => ({
  id: 1,
  recipe_id: 1,
  position: 0,
  preparation: null,
  is_optional: 0,
  raw_text: partial.raw_text ?? "",
  ...partial,
});

describe("scaleIngredients", () => {
  it("doubles ingredients when target is twice the base", () => {
    const ingredients = [
      make({
        quantity: 1,
        unit: "cup",
        item_canonical: "all-purpose flour",
        item_display: "All-purpose flour",
      }),
      make({
        quantity: 0.5,
        unit: "tsp",
        item_canonical: "salt",
        item_display: "Salt",
      }),
    ];
    const scaled = scaleIngredients(ingredients, 4, 8);
    expect(scaled[0]?.quantity).toBe(2);
    expect(scaled[0]?.displayQuantity).toBe("2");
    expect(scaled[0]?.displayUnit).toBe("cups");
    expect(scaled[1]?.quantity).toBe(1);
    expect(scaled[1]?.displayUnit).toBe("tsp");
  });

  it("rounds indivisible quantities up to whole units", () => {
    const ingredients = [
      make({
        quantity: 1,
        unit: null,
        item_canonical: "yellow onion",
        item_display: "Yellow onion",
      }),
    ];
    const scaled = scaleIngredients(ingredients, 4, 6);
    // 1 * 1.5 = 1.5 -> ceiled to nearest half = 1.5
    expect(scaled[0]?.quantity).toBe(1.5);
    expect(scaled[0]?.displayQuantity).toBe("1 \u00BD");
  });

  it("leaves null quantities alone", () => {
    const scaled = scaleIngredients(
      [
        make({
          quantity: null,
          unit: null,
          item_canonical: "salt",
          item_display: "Salt to taste",
          raw_text: "Salt to taste",
        }),
      ],
      4,
      6,
    );
    expect(scaled[0]?.quantity).toBeNull();
    expect(scaled[0]?.displayQuantity).toBe("");
  });

  it("formats friendly fractions on awkward scales", () => {
    const scaled = scaleIngredients(
      [
        make({
          quantity: 1,
          unit: "cup",
          item_canonical: "milk",
          item_display: "Milk",
        }),
      ],
      4,
      3,
    );
    expect(scaled[0]?.quantity).toBeCloseTo(0.75);
    expect(scaled[0]?.displayQuantity).toBe("\u00BE");
    expect(scaled[0]?.displayUnit).toBe("cup");
  });
});
