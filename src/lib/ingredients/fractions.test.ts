import { describe, expect, it } from "vitest";
import {
  formatQuantity,
  parseLeadingQuantity,
} from "@/lib/ingredients/fractions";

describe("parseLeadingQuantity", () => {
  it("parses integers and decimals", () => {
    expect(parseLeadingQuantity("3 onions")).toEqual({
      quantity: 3,
      remainder: "onions",
    });
    expect(parseLeadingQuantity("1.5 cups flour")).toEqual({
      quantity: 1.5,
      remainder: "cups flour",
    });
  });

  it("parses simple and mixed fractions", () => {
    expect(parseLeadingQuantity("1/2 cup milk").quantity).toBeCloseTo(0.5);
    expect(parseLeadingQuantity("2 1/3 tbsp sugar").quantity).toBeCloseTo(
      2 + 1 / 3,
    );
  });

  it("parses unicode fractions", () => {
    expect(parseLeadingQuantity("\u00BC tsp salt").quantity).toBeCloseTo(0.25);
    expect(parseLeadingQuantity("1\u00BD cups water").quantity).toBeCloseTo(
      1.5,
    );
  });
});

describe("formatQuantity", () => {
  it("rounds to common kitchen fractions", () => {
    expect(formatQuantity(0.5)).toBe("\u00BD");
    expect(formatQuantity(0.25)).toBe("\u00BC");
    expect(formatQuantity(1.5)).toBe("1 \u00BD");
    expect(formatQuantity(2)).toBe("2");
  });

  it("falls back to decimal for awkward values", () => {
    expect(formatQuantity(0.13, { decimal: true })).toBe("0.13");
  });
});
