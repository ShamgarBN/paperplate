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
  /** Sub-recipe label this row belongs to (null = ungrouped). */
  sectionName: string | null;
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
        sectionName: ing.section_name,
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
      sectionName: ing.section_name,
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
  const prep = formatPreparation(input.preparation);
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

/**
 * Render the preparation hint we stored on each ingredient so it reads
 * naturally on the recipe detail page. Bare prep ("finely chopped") gets
 * a leading comma; a parenthetical ("(bone-in)") gets a leading space so
 * we preserve the original parens the user (or the recipe author) wrote.
 * Mixed prep like "finely chopped (bone-in)" splits at the first paren so
 * each half formats the way a human would expect.
 */
function formatPreparation(prep: string | null | undefined): string {
  if (!prep) return "";
  const trimmed = prep.trim();
  if (!trimmed) return "";
  const parenIdx = trimmed.indexOf("(");
  if (parenIdx === -1) return `, ${trimmed}`;
  if (parenIdx === 0) return ` ${trimmed}`;
  const head = trimmed.slice(0, parenIdx).trim().replace(/,$/, "").trim();
  const tail = trimmed.slice(parenIdx).trim();
  if (!head) return ` ${tail}`;
  return `, ${head} ${tail}`;
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
