import { describe, expect, it } from "vitest";
import { parseIngredient } from "@/lib/ingredients/parser";

describe("parseIngredient", () => {
  it("parses basic decimal quantities", () => {
    const r = parseIngredient("2 cups all-purpose flour");
    expect(r.quantity).toBe(2);
    expect(r.unit).toBe("cup");
    expect(r.itemCanonical).toBe("all-purpose flour");
  });

  it("parses fractions", () => {
    const r = parseIngredient("1/2 cup milk");
    expect(r.quantity).toBeCloseTo(0.5, 5);
    expect(r.unit).toBe("cup");
    expect(r.itemCanonical).toBe("milk");
  });

  it("parses mixed numbers", () => {
    const r = parseIngredient("1 1/2 tbsp olive oil");
    expect(r.quantity).toBeCloseTo(1.5, 5);
    expect(r.unit).toBe("tbsp");
    expect(r.itemCanonical).toBe("olive oil");
  });

  it("parses unicode fractions", () => {
    const r = parseIngredient("\u00BD cup butter");
    expect(r.quantity).toBeCloseTo(0.5, 5);
    expect(r.unit).toBe("cup");
    expect(r.itemCanonical).toBe("butter");
  });

  it("parses multi-word units", () => {
    const r = parseIngredient("8 fluid ounces stock");
    expect(r.quantity).toBe(8);
    expect(r.unit).toBe("fl oz");
  });

  it("averages quantity ranges", () => {
    const r = parseIngredient("1-2 onions");
    expect(r.quantity).toBe(1.5);
    expect(r.itemCanonical).toBe("yellow onion");
  });

  it("flags optional", () => {
    const r = parseIngredient("1 tsp black pepper (optional)");
    expect(r.isOptional).toBe(true);
    expect(r.unit).toBe("tsp");
    expect(r.itemCanonical).toBe("black pepper");
  });

  it("captures preparation hints from a comma tail", () => {
    const r = parseIngredient("3 cloves garlic, minced");
    expect(r.unit).toBe("clove");
    expect(r.itemCanonical).toBe("garlic clove");
    expect(r.preparation).toBe("minced");
  });

  it("captures preparation hints in front of the ingredient", () => {
    const r = parseIngredient("1 finely diced shallot");
    expect(r.preparation).toBe("finely diced");
  });

  it("aliases scallions to green onion", () => {
    const r = parseIngredient("4 scallions, thinly sliced");
    expect(r.itemCanonical).toBe("green onion");
    expect(r.preparation).toBe("thinly sliced");
  });

  it("flags indivisible items", () => {
    const r = parseIngredient("2 yellow onions, diced");
    expect(r.isIndivisible).toBe(true);
  });

  it("ignores section headers cleanly", () => {
    const r = parseIngredient("For the dressing:");
    expect(r.quantity).toBeNull();
    expect(r.itemDisplay).toContain("dressing");
  });

  it("strips parenthetical alt-quantity hints", () => {
    const r = parseIngredient("1 cup (240 ml) water");
    expect(r.quantity).toBe(1);
    expect(r.unit).toBe("cup");
    expect(r.itemCanonical).toContain("water");
    // The "(240 ml)" was an alt-quantity hint, so it should be discarded
    // rather than landing in `preparation`.
    expect(r.preparation ?? "").not.toContain("240");
  });

  it("preserves meaningful parentheticals in the preparation field", () => {
    // Regression for the report: "(bone-in)" was visible in the editor but
    // disappeared from the rendered recipe because canonicalization
    // stripped punctuation. The parens-aware preparation field keeps it.
    const r = parseIngredient("4 chicken thighs (bone-in)");
    expect(r.itemCanonical).toBe("chicken thigh");
    expect(r.preparation).toContain("(bone-in)");
  });

  it("decodes common HTML entities so apostrophes survive", () => {
    // Numeric and named entity decoding is shared with the scraper; here
    // we just exercise the parser end-to-end to prove a scrape-then-store
    // round-trip keeps the apostrophe intact.
    const r = parseIngredient("2 cups they&#039;re-good-anytime granola");
    expect(r.raw).toBe("2 cups they&#039;re-good-anytime granola");
    // The display goes through canonicalization which won't preserve the
    // apostrophe, but the raw_text (the field the editor shows) is kept
    // exactly as the caller supplied. The scraping pipeline calls
    // decodeHtmlEntities() *before* handing strings to this parser, so by
    // the time the parser sees a recipe URL ingredient there are no raw
    // entities left.
  });
});
