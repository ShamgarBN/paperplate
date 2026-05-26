import type { RecipeIngredient, Recipe, MealPlanSlot } from "./db/schema";
import {
  findUnit,
  preferredDisplay,
  unitDisplay,
  type UnitDefinition,
} from "./ingredients/units";
import { formatQuantity } from "./ingredients/fractions";
import { isIndivisible } from "./ingredients/canonicalize";

export interface ShoppingItem {
  /** Stable id, used as the checkbox key. */
  id: string;
  itemCanonical: string;
  itemDisplay: string;
  /** When null we couldn't combine (no quantity). */
  totalQuantity: number | null;
  totalUnit: UnitDefinition | null;
  display: string;
  aisle: string;
  isOptional: boolean;
  perishable: boolean;
  /** Recipes contributing to this item (for the "(used in...)" tooltip). */
  contributors: string[];
}

interface AggregatorInput {
  slots: MealPlanSlot[];
  /** Recipe metadata keyed by recipe id. */
  recipesById: Map<number, Recipe>;
  /** Ingredients keyed by recipe id. */
  ingredientsByRecipeId: Map<number, RecipeIngredient[]>;
  /** Override of ingredient -> aisle (DB ingredient_aisle_map joined to aisles). */
  aisleByCanonical: Map<string, string>;
}

interface DimensionedAccumulator {
  baseQuantity: number;
  baseUnit: UnitDefinition;
  contributors: Set<string>;
  hadOptional: boolean;
  perishable: boolean;
  representativeDisplay: string;
}

interface UnitlessAccumulator {
  total: number;
  isIndivisibleHere: boolean;
  contributors: Set<string>;
  hadOptional: boolean;
  perishable: boolean;
  representativeDisplay: string;
}

/**
 * Aggregate all ingredients across the plan into a unique-by-canonical-name
 * shopping list, with units reconciled and indivisibles rounded up.
 */
export function buildShoppingList(input: AggregatorInput): ShoppingItem[] {
  const dimensioned = new Map<string, Map<string, DimensionedAccumulator>>();
  const unitless = new Map<string, UnitlessAccumulator>();
  const passthroughs: ShoppingItem[] = [];

  for (const slot of input.slots) {
    if (!slot.recipe_id) continue;
    const recipe = input.recipesById.get(slot.recipe_id);
    const ingredients = input.ingredientsByRecipeId.get(slot.recipe_id);
    if (!recipe || !ingredients) continue;
    const targetServings = slot.scaled_servings ?? recipe.base_servings;
    const factor = targetServings / Math.max(1, recipe.base_servings);

    for (const ing of ingredients) {
      const contributorLabel = recipe.title;
      if (ing.quantity == null) {
        // Pass-through ingredient (e.g., "Salt to taste").
        passthroughs.push({
          id: `passthrough-${slot.id}-${ing.id}`,
          itemCanonical: ing.item_canonical,
          itemDisplay: ing.item_display,
          totalQuantity: null,
          totalUnit: null,
          display: ing.raw_text,
          aisle: input.aisleByCanonical.get(ing.item_canonical) ?? "Other",
          isOptional: ing.is_optional === 1,
          perishable: false,
          contributors: [contributorLabel],
        });
        continue;
      }
      const unit = ing.unit ? findUnit(ing.unit) : null;
      if (!unit) {
        // Unitless count of the item.
        const key = ing.item_canonical;
        const acc =
          unitless.get(key) ??
          ({
            total: 0,
            isIndivisibleHere: isIndivisible(key),
            contributors: new Set<string>(),
            hadOptional: false,
            perishable: false,
            representativeDisplay: ing.item_display,
          } satisfies UnitlessAccumulator);
        acc.total += ing.quantity * factor;
        acc.contributors.add(contributorLabel);
        if (ing.is_optional === 1) acc.hadOptional = true;
        unitless.set(key, acc);
        continue;
      }

      // Dimensioned: bucket by canonical + dimension.
      const dimKey = `${ing.item_canonical}|${unit.dimension}`;
      const existingDim = dimensioned.get(ing.item_canonical) ?? new Map();
      const acc =
        existingDim.get(dimKey) ??
        ({
          baseQuantity: 0,
          baseUnit: unit,
          contributors: new Set<string>(),
          hadOptional: false,
          perishable: false,
          representativeDisplay: ing.item_display,
        } satisfies DimensionedAccumulator);
      // Convert this contribution into the bucket's stored dimension.
      acc.baseQuantity += ing.quantity * factor * unit.toBase;
      acc.contributors.add(contributorLabel);
      if (ing.is_optional === 1) acc.hadOptional = true;
      existingDim.set(dimKey, acc);
      dimensioned.set(ing.item_canonical, existingDim);
    }
  }

  const items: ShoppingItem[] = [];

  for (const [canonical, dimMap] of dimensioned) {
    for (const [dimKey, acc] of dimMap) {
      // Pick the friendliest output unit in the same dimension.
      const stored = acc.baseQuantity / acc.baseUnit.toBase;
      const { quantity, unit: outUnit } = preferredDisplay(stored, acc.baseUnit);
      const display = formatItemDisplay({
        itemDisplay: acc.representativeDisplay,
        quantity,
        unit: outUnit,
        canonical,
      });
      items.push({
        id: `dim-${dimKey}`,
        itemCanonical: canonical,
        itemDisplay: acc.representativeDisplay,
        totalQuantity: quantity,
        totalUnit: outUnit,
        display,
        aisle: input.aisleByCanonical.get(canonical) ?? "Other",
        isOptional: acc.hadOptional,
        perishable: acc.perishable,
        contributors: [...acc.contributors],
      });
    }
  }

  for (const [canonical, acc] of unitless) {
    const total = acc.isIndivisibleHere ? Math.ceil(acc.total) : acc.total;
    const formatted = acc.isIndivisibleHere
      ? String(total)
      : formatQuantity(total);
    const display = `${formatted} ${pluralizeNoun(
      acc.representativeDisplay,
      total,
    )}`;
    items.push({
      id: `count-${canonical}`,
      itemCanonical: canonical,
      itemDisplay: acc.representativeDisplay,
      totalQuantity: total,
      totalUnit: null,
      display,
      aisle: input.aisleByCanonical.get(canonical) ?? "Other",
      isOptional: acc.hadOptional,
      perishable: acc.perishable,
      contributors: [...acc.contributors],
    });
  }

  // Group passthroughs by canonical name so we don't show "Salt to taste" 5x.
  const passthroughByCanonical = new Map<string, ShoppingItem>();
  for (const p of passthroughs) {
    const existing = passthroughByCanonical.get(p.itemCanonical);
    if (existing) {
      const merged = new Set([...existing.contributors, ...p.contributors]);
      passthroughByCanonical.set(p.itemCanonical, {
        ...existing,
        contributors: [...merged],
        isOptional: existing.isOptional && p.isOptional,
      });
    } else {
      passthroughByCanonical.set(p.itemCanonical, p);
    }
  }
  items.push(...passthroughByCanonical.values());

  items.sort(
    (a, b) =>
      aisleSort(a.aisle) - aisleSort(b.aisle) ||
      a.itemDisplay.localeCompare(b.itemDisplay),
  );

  return items;
}

function formatItemDisplay({
  itemDisplay,
  quantity,
  unit,
  canonical,
}: {
  itemDisplay: string;
  quantity: number;
  unit: UnitDefinition;
  canonical: string;
}): string {
  if (unit.dimension === "count") {
    const total = isIndivisible(canonical) ? Math.ceil(quantity) : quantity;
    const noun = pluralizeNoun(itemDisplay, total);
    const u = unitDisplay(unit, total);
    if (!u) return `${formatQuantity(total)} ${noun}`;
    return `${formatQuantity(total)} ${u} ${noun}`;
  }
  const qty = formatQuantity(quantity);
  const u = unitDisplay(unit, quantity);
  return u ? `${qty} ${u} ${itemDisplay}` : `${qty} ${itemDisplay}`;
}

function pluralizeNoun(noun: string, quantity: number): string {
  if (!noun) return "";
  if (Math.abs(quantity - 1) < 1e-6) return noun;
  if (quantity <= 1) return noun;
  if (/(s|x|sh|ch)$/i.test(noun)) return noun + "es";
  if (/y$/i.test(noun) && !/[aeiou]y$/i.test(noun))
    return noun.slice(0, -1) + "ies";
  return noun + "s";
}

const AISLE_ORDER: Record<string, number> = {
  Produce: 10,
  "Meat & Seafood": 20,
  "Dairy & Eggs": 30,
  Bakery: 40,
  "Pantry & Dry Goods": 50,
  "Spices & Oils": 60,
  Frozen: 70,
  Beverages: 80,
  Other: 90,
};

function aisleSort(name: string): number {
  return AISLE_ORDER[name] ?? 100;
}

/** Format a shopping list as plain text grouped by aisle. */
export function toPlainText(items: ShoppingItem[]): string {
  const byAisle = new Map<string, ShoppingItem[]>();
  for (const item of items) {
    const arr = byAisle.get(item.aisle) ?? [];
    arr.push(item);
    byAisle.set(item.aisle, arr);
  }
  const ordered = [...byAisle.keys()].sort(
    (a, b) => aisleSort(a) - aisleSort(b),
  );
  const lines: string[] = [];
  for (const aisle of ordered) {
    lines.push(`# ${aisle.toUpperCase()}`);
    for (const item of byAisle.get(aisle) ?? []) {
      lines.push(`- ${item.display}${item.isOptional ? " (optional)" : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim() + "\n";
}
