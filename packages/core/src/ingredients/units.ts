// Unit lexicon and conversions.
// All conversions go through a base unit per dimension:
//  - volume     -> milliliters (ml)
//  - weight     -> grams (g)
//  - count/each -> count

export type UnitDimension = "volume" | "weight" | "count" | "length" | "other";

export interface UnitDefinition {
  canonical: string;
  display: string;
  pluralDisplay?: string;
  dimension: UnitDimension;
  toBase: number;
  aliases: string[];
}

export const UNITS: UnitDefinition[] = [
  // Volume - imperial
  {
    canonical: "tsp",
    display: "tsp",
    dimension: "volume",
    toBase: 4.92892,
    aliases: ["tsp", "tsps", "teaspoon", "teaspoons", "t."],
  },
  {
    canonical: "tbsp",
    display: "tbsp",
    dimension: "volume",
    toBase: 14.7868,
    aliases: ["tbsp", "tbsps", "tablespoon", "tablespoons", "tbl", "tbs", "T."],
  },
  {
    canonical: "fl oz",
    display: "fl oz",
    dimension: "volume",
    toBase: 29.5735,
    aliases: ["fl oz", "floz", "fluid ounce", "fluid ounces"],
  },
  {
    canonical: "cup",
    display: "cup",
    pluralDisplay: "cups",
    dimension: "volume",
    toBase: 236.588,
    aliases: ["cup", "cups", "c."],
  },
  {
    canonical: "pint",
    display: "pint",
    pluralDisplay: "pints",
    dimension: "volume",
    toBase: 473.176,
    aliases: ["pint", "pints", "pt"],
  },
  {
    canonical: "quart",
    display: "quart",
    pluralDisplay: "quarts",
    dimension: "volume",
    toBase: 946.353,
    aliases: ["quart", "quarts", "qt"],
  },
  {
    canonical: "gallon",
    display: "gallon",
    pluralDisplay: "gallons",
    dimension: "volume",
    toBase: 3785.41,
    aliases: ["gallon", "gallons", "gal"],
  },
  // Volume - metric
  {
    canonical: "ml",
    display: "ml",
    dimension: "volume",
    toBase: 1,
    aliases: ["ml", "milliliter", "milliliters", "millilitre", "millilitres"],
  },
  {
    canonical: "l",
    display: "L",
    dimension: "volume",
    toBase: 1000,
    aliases: ["l", "liter", "liters", "litre", "litres"],
  },
  // Weight - imperial
  {
    canonical: "oz",
    display: "oz",
    dimension: "weight",
    toBase: 28.3495,
    aliases: ["oz", "ozs", "ounce", "ounces"],
  },
  {
    canonical: "lb",
    display: "lb",
    pluralDisplay: "lbs",
    dimension: "weight",
    toBase: 453.592,
    aliases: ["lb", "lbs", "pound", "pounds"],
  },
  // Weight - metric
  {
    canonical: "g",
    display: "g",
    dimension: "weight",
    toBase: 1,
    aliases: ["g", "gr", "gram", "grams", "gramme", "grammes"],
  },
  {
    canonical: "kg",
    display: "kg",
    dimension: "weight",
    toBase: 1000,
    aliases: ["kg", "kilo", "kilos", "kilogram", "kilograms"],
  },
  // Length (occasionally for fish steaks etc.)
  {
    canonical: "inch",
    display: "inch",
    pluralDisplay: "inches",
    dimension: "length",
    toBase: 25.4,
    aliases: ["in", "inch", "inches", "\""],
  },
  {
    canonical: "cm",
    display: "cm",
    dimension: "length",
    toBase: 10,
    aliases: ["cm", "centimeter", "centimeters", "centimetre", "centimetres"],
  },
  {
    canonical: "mm",
    display: "mm",
    dimension: "length",
    toBase: 1,
    aliases: ["mm", "millimeter", "millimeters", "millimetre", "millimetres"],
  },
  // Count
  {
    canonical: "each",
    display: "",
    dimension: "count",
    toBase: 1,
    aliases: ["each", "ea", "whole"],
  },
  {
    canonical: "piece",
    display: "piece",
    pluralDisplay: "pieces",
    dimension: "count",
    toBase: 1,
    aliases: ["piece", "pieces", "pc", "pcs"],
  },
  {
    canonical: "clove",
    display: "clove",
    pluralDisplay: "cloves",
    dimension: "count",
    toBase: 1,
    aliases: ["clove", "cloves"],
  },
  {
    canonical: "head",
    display: "head",
    pluralDisplay: "heads",
    dimension: "count",
    toBase: 1,
    aliases: ["head", "heads"],
  },
  {
    canonical: "bunch",
    display: "bunch",
    pluralDisplay: "bunches",
    dimension: "count",
    toBase: 1,
    aliases: ["bunch", "bunches"],
  },
  {
    canonical: "sprig",
    display: "sprig",
    pluralDisplay: "sprigs",
    dimension: "count",
    toBase: 1,
    aliases: ["sprig", "sprigs"],
  },
  {
    canonical: "stalk",
    display: "stalk",
    pluralDisplay: "stalks",
    dimension: "count",
    toBase: 1,
    aliases: ["stalk", "stalks", "stick", "sticks"],
  },
  {
    canonical: "slice",
    display: "slice",
    pluralDisplay: "slices",
    dimension: "count",
    toBase: 1,
    aliases: ["slice", "slices"],
  },
  {
    canonical: "leaf",
    display: "leaf",
    pluralDisplay: "leaves",
    dimension: "count",
    toBase: 1,
    aliases: ["leaf", "leaves"],
  },
  {
    canonical: "can",
    display: "can",
    pluralDisplay: "cans",
    dimension: "count",
    toBase: 1,
    aliases: ["can", "cans"],
  },
  {
    canonical: "jar",
    display: "jar",
    pluralDisplay: "jars",
    dimension: "count",
    toBase: 1,
    aliases: ["jar", "jars"],
  },
  {
    canonical: "package",
    display: "package",
    pluralDisplay: "packages",
    dimension: "count",
    toBase: 1,
    aliases: ["package", "packages", "pkg", "pack", "packs"],
  },
  // Vague but seen in recipes
  {
    canonical: "pinch",
    display: "pinch",
    pluralDisplay: "pinches",
    dimension: "other",
    toBase: 1,
    aliases: ["pinch", "pinches"],
  },
  {
    canonical: "dash",
    display: "dash",
    pluralDisplay: "dashes",
    dimension: "other",
    toBase: 1,
    aliases: ["dash", "dashes"],
  },
  {
    canonical: "to taste",
    display: "to taste",
    dimension: "other",
    toBase: 1,
    aliases: ["to taste"],
  },
];

const ALIAS_INDEX: Map<string, UnitDefinition> = (() => {
  const m = new Map<string, UnitDefinition>();
  for (const u of UNITS) {
    for (const alias of u.aliases) {
      m.set(alias.toLowerCase(), u);
    }
    m.set(u.canonical, u);
  }
  return m;
})();

export function findUnit(token: string): UnitDefinition | null {
  if (!token) return null;
  const cleaned = token
    .toLowerCase()
    .trim()
    .replace(/\.$/, "")
    .replace(/\s+/g, " ");
  return ALIAS_INDEX.get(cleaned) ?? null;
}

export function unitDisplay(unit: UnitDefinition, quantity: number | null): string {
  if (!unit.display) return "";
  if (
    unit.pluralDisplay &&
    quantity !== null &&
    quantity > 1 + 1e-6
  ) {
    return unit.pluralDisplay;
  }
  return unit.display;
}

/**
 * Convert a quantity in `from` to `to`. Returns null if dimensions don't match.
 */
export function convert(
  quantity: number,
  from: UnitDefinition,
  to: UnitDefinition,
): number | null {
  if (from.dimension !== to.dimension) return null;
  return (quantity * from.toBase) / to.toBase;
}

/**
 * Pick the friendliest US unit to display the given amount in the same dimension.
 * Used by the shopping list aggregator.
 *
 * Conservative: keeps the recipe's chosen unit unless the resulting value
 * gets unwieldy (e.g., 32+ cups should round up to "8 quarts"). For "count"
 * and "other" dimensions the input unit is preserved.
 */
export function preferredDisplay(
  quantity: number,
  unit: UnitDefinition,
): { quantity: number; unit: UnitDefinition } {
  if (unit.dimension === "count" || unit.dimension === "other") {
    return { quantity, unit };
  }
  // Keep the unit if the value sits inside a comfortable range.
  if (quantity >= 0.25 && quantity < 32) {
    return { quantity, unit };
  }
  const baseQty = quantity * unit.toBase;
  if (quantity >= 32) {
    // Up-convert to the largest unit that keeps the value >= 1.
    const candidates = UNITS.filter(
      (u) => u.dimension === unit.dimension && u.toBase > unit.toBase,
    ).sort((a, b) => b.toBase - a.toBase);
    for (const candidate of candidates) {
      const value = baseQty / candidate.toBase;
      if (value >= 1) {
        return { quantity: value, unit: candidate };
      }
    }
  }
  if (quantity < 0.25) {
    // Down-convert to a smaller unit so the value is at least 1.
    const candidates = UNITS.filter(
      (u) => u.dimension === unit.dimension && u.toBase < unit.toBase,
    ).sort((a, b) => b.toBase - a.toBase);
    for (const candidate of candidates) {
      const value = baseQty / candidate.toBase;
      if (value >= 1) {
        return { quantity: value, unit: candidate };
      }
    }
  }
  return { quantity, unit };
}
