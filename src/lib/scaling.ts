import { findUnit, unitDisplay } from "@/lib/ingredients/units";
import { formatQuantity } from "@/lib/ingredients/fractions";
import { isIndivisible } from "@/lib/ingredients/canonicalize";
import type { RecipeIngredient } from "@/lib/db/schema";

export interface ScaledIngredient {
  id: number;
  position: number;
  quantity: number | null;
  unit: string | null;
  itemDisplay: string;
  itemCanonical: string;
  preparation: string | null;
  isOptional: boolean;
  raw: string;
  /** Pre-formatted quantity (e.g. "1 \u00BD") for display. */
  displayQuantity: string;
  /** Pre-formatted unit (singular/plural correct). */
  displayUnit: string;
  /** Final assembled display string. */
  display: string;
}

/**
 * Scale a list of recipe ingredients from `baseServings` to `targetServings`.
 * Pure function so it's trivially testable.
 */
export function scaleIngredients(
  ingredients: RecipeIngredient[],
  baseServings: number,
  targetServings: number,
): ScaledIngredient[] {
  if (baseServings <= 0 || targetServings <= 0) {
    return ingredients.map((ing) =>
      formatIngredient({
        id: ing.id,
        position: ing.position,
        quantity: ing.quantity,
        unit: ing.unit,
        itemDisplay: ing.item_display,
        itemCanonical: ing.item_canonical,
        preparation: ing.preparation,
        isOptional: ing.is_optional === 1,
        raw: ing.raw_text,
      }),
    );
  }
  const factor = targetServings / baseServings;
  return ingredients.map((ing) => {
    const scaled = ing.quantity == null ? null : ing.quantity * factor;
    return formatIngredient({
      id: ing.id,
      position: ing.position,
      quantity: scaled,
      unit: ing.unit,
      itemDisplay: ing.item_display,
      itemCanonical: ing.item_canonical,
      preparation: ing.preparation,
      isOptional: ing.is_optional === 1,
      raw: ing.raw_text,
    });
  });
}

export function scaleQuantity(
  quantity: number | null,
  baseServings: number,
  targetServings: number,
): number | null {
  if (quantity == null) return null;
  if (baseServings <= 0 || targetServings <= 0) return quantity;
  return quantity * (targetServings / baseServings);
}

export function formatIngredient(
  input: Omit<ScaledIngredient, "displayQuantity" | "displayUnit" | "display">,
): ScaledIngredient {
  const unitDef = input.unit ? findUnit(input.unit) : null;
  const isCount = unitDef?.dimension === "count";
  const indivisible = isIndivisible(input.itemCanonical);

  let qty = input.quantity;
  if (qty != null && (indivisible || isCount)) {
    qty = ceilToHalf(qty);
  }

  const displayQuantity = qty == null ? "" : formatQuantity(qty);
  const displayUnit = unitDef ? unitDisplay(unitDef, qty) : input.unit ?? "";

  const noun = pluralizeNoun(input.itemDisplay, qty, !!unitDef);
  const prep = input.preparation ? `, ${input.preparation}` : "";
  const optional = input.isOptional ? " (optional)" : "";

  const parts: string[] = [];
  if (displayQuantity) parts.push(displayQuantity);
  if (displayUnit) parts.push(displayUnit);
  parts.push(noun);
  const display = `${parts.join(" ").trim()}${prep}${optional}`;

  return {
    ...input,
    quantity: qty,
    displayQuantity,
    displayUnit,
    display,
  };
}

function ceilToHalf(value: number): number {
  if (!Number.isFinite(value)) return value;
  const halves = Math.ceil(value * 2 - 1e-9);
  return halves / 2;
}

function pluralizeNoun(
  noun: string,
  quantity: number | null,
  hasUnit: boolean,
): string {
  if (!noun) return "";
  if (hasUnit) return noun;
  if (quantity == null) return noun;
  const isPlural = quantity > 1 + 1e-6;
  if (!isPlural) return noun;
  if (/(s|x|sh|ch)$/i.test(noun)) return noun + "es";
  if (/y$/i.test(noun) && !/[aeiou]y$/i.test(noun))
    return noun.slice(0, -1) + "ies";
  return noun + "s";
}
