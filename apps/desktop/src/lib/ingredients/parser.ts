import { findUnit } from "@/lib/ingredients/units";
import { parseLeadingQuantity } from "@/lib/ingredients/fractions";
import { canonicalizeName } from "@/lib/ingredients/canonicalize";

export interface ParsedIngredient {
  raw: string;
  quantity: number | null;
  unit: string | null;
  itemDisplay: string;
  itemCanonical: string;
  preparation: string | null;
  isOptional: boolean;
  isIndivisible: boolean;
  perishable: boolean;
  aisle: string | null;
  /** Approximate weight in grams of one indivisible unit. */
  approxUnitWeightGrams: number | null;
}

const OPTIONAL_PATTERNS = [
  /\(optional\)/i,
  /,\s*optional\s*$/i,
  /\boptional\b\s*[:\-]/i,
];

const SECTION_HEADER = /^(?:For|For the|To serve|To garnish)\b/i;

const MULTI_UNIT_PHRASES = [
  "fl oz",
  "fluid ounce",
  "fluid ounces",
];

/**
 * Parse a single recipe ingredient line. Tolerant of:
 *  - Leading bullets and dashes
 *  - Decimal, fraction, and Unicode-fraction quantities ("1 1/2", "½", "1.5")
 *  - Range quantities ("1-2 onions" -> uses average)
 *  - Multi-word units ("fluid ounces")
 *  - Inline preparation ("1/2 onion, finely diced")
 *  - "(optional)" markers
 */
export function parseIngredient(input: string): ParsedIngredient {
  let line = input
    .replace(/^[\s\-\u2022\*\u00B7]+/, "")
    .replace(/\s+/g, " ")
    .trim();

  let isOptional = false;
  for (const pattern of OPTIONAL_PATTERNS) {
    if (pattern.test(line)) {
      isOptional = true;
      line = line.replace(pattern, "").replace(/\s+/g, " ").trim();
    }
  }

  if (SECTION_HEADER.test(line)) {
    // Treat as a passthrough header - no quantity/unit, full text becomes name.
    return {
      raw: input,
      quantity: null,
      unit: null,
      itemDisplay: line,
      itemCanonical: line.toLowerCase(),
      preparation: null,
      isOptional,
      isIndivisible: false,
      perishable: false,
      aisle: null,
      approxUnitWeightGrams: null,
    };
  }

  const { quantity, remainder } = parseLeadingQuantity(line);
  let working = remainder;

  let unitToken: string | null = null;
  if (quantity !== null && working) {
    const lower = working.toLowerCase();
    const matched = MULTI_UNIT_PHRASES.find(
      (phrase) =>
        lower.startsWith(phrase + " ") || lower === phrase,
    );
    if (matched) {
      const def = findUnit(matched);
      unitToken = def?.canonical ?? matched;
      working = working.slice(matched.length).trim();
    } else {
      const firstWord = working.split(/\s+/)[0] ?? "";
      const cleanedToken = firstWord.replace(/\.$/, "");
      const found = findUnit(cleanedToken);
      if (found && found.canonical !== "each") {
        unitToken = found.canonical;
        working = working.slice(firstWord.length).trim();
      }
    }
  }

  // Handle parenthetical alt-quantities like "(about 8 oz)" — drop them —
  // and capture the meaningful "(bone-in)" / "(packed)" / "(at room
  // temperature)" parentheticals so they survive canonicalization. The
  // canonicalizer aggressively strips punctuation, so anything we want to
  // show on the recipe detail page has to ride along in the preparation
  // string instead of the head noun.
  const preservedParentheticals: string[] = [];
  working = working.replace(/\(([^)]*)\)/g, (_, inner) => {
    const stripped = String(inner).trim().toLowerCase();
    if (
      stripped.startsWith("about") ||
      stripped.startsWith("approx") ||
      stripped.startsWith("roughly") ||
      /^\d/.test(stripped)
    ) {
      return "";
    }
    const text = String(inner).trim();
    if (text) preservedParentheticals.push(`(${text})`);
    return " ";
  });
  working = working.replace(/\s+/g, " ").trim();

  let canon = canonicalizeName(working || input);

  // Light unit-aware canonicalization upgrades. Examples:
  //   "3 cloves garlic"   -> canonical "garlic clove"
  //   "1 head garlic"     -> canonical "garlic head"
  //   "2 sprigs thyme"    keeps canonical "thyme" (sprig is just a counting hint)
  if (unitToken === "clove" && canon.canonical === "garlic") {
    const upgraded = canonicalizeName("garlic clove");
    canon = { ...upgraded, preparation: canon.preparation };
  } else if (unitToken === "head" && canon.canonical === "garlic") {
    const upgraded = canonicalizeName("garlic head");
    canon = { ...upgraded, preparation: canon.preparation };
  }

  // Merge canonicalizer-derived prep (e.g. "finely chopped") with the
  // parentheticals we yanked out earlier. We keep the parens intact so
  // the renderer can format them as " (bone-in)" instead of ", bone-in".
  const prepParts: string[] = [];
  if (canon.preparation) prepParts.push(canon.preparation);
  for (const paren of preservedParentheticals) prepParts.push(paren);
  const preparation = prepParts.length ? prepParts.join(" ") : null;

  return {
    raw: input,
    quantity,
    unit: unitToken,
    itemDisplay: canon.display,
    itemCanonical: canon.canonical,
    preparation,
    isOptional,
    isIndivisible: canon.isIndivisible,
    perishable: canon.perishable ?? false,
    aisle: canon.aisle ?? null,
    approxUnitWeightGrams: canon.approxUnitWeightGrams ?? null,
  };
}
