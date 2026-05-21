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
  });
});
