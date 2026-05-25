// Fraction handling for cooking-friendly display.

const VULGAR_FRACTIONS: Record<string, number> = {
  "\u00BC": 0.25, // ¼
  "\u00BD": 0.5, // ½
  "\u00BE": 0.75, // ¾
  "\u2150": 1 / 7,
  "\u2151": 1 / 9,
  "\u2152": 0.1,
  "\u2153": 1 / 3,
  "\u2154": 2 / 3,
  "\u2155": 0.2,
  "\u2156": 0.4,
  "\u2157": 0.6,
  "\u2158": 0.8,
  "\u2159": 1 / 6,
  "\u215A": 5 / 6,
  "\u215B": 0.125,
  "\u215C": 0.375,
  "\u215D": 0.625,
  "\u215E": 0.875,
};

export function normalizeFractionGlyphs(text: string): string {
  let out = text;
  for (const [glyph, value] of Object.entries(VULGAR_FRACTIONS)) {
    if (out.includes(glyph)) {
      // Insert a space between an adjacent digit and the fraction so that
      // "1\u00BD" becomes "1 1/2" rather than "11/2".
      const replacement = decimalToFraction(value);
      out = out
        .split(glyph)
        .map((part, idx, arr) => {
          if (idx === arr.length - 1) return part;
          const needsLeftSpace = /\d$/.test(part);
          return part + (needsLeftSpace ? " " : "") + replacement + " ";
        })
        .join("");
    }
  }
  return out
    .replace(/\s+/g, " ")
    .replace(/(\d)\s+(\d+\/\d+)/g, "$1 $2")
    .trim();
}

function decimalToFraction(value: number): string {
  const denominators = [2, 3, 4, 6, 8, 16];
  for (const d of denominators) {
    const numerator = Math.round(value * d);
    if (Math.abs(numerator / d - value) < 1e-9 && numerator > 0) {
      return `${numerator}/${d}`;
    }
  }
  return value.toString();
}

/**
 * Parse the leading numeric quantity from a string. Handles:
 * - Plain integers and decimals: "2", "1.5"
 * - Simple fractions: "1/2"
 * - Mixed numbers: "1 1/2"
 * - Unicode fractions: "1½", "¾"
 * - Ranges: "1-2", "1 to 2", "1–2" (returns the average)
 */
export function parseLeadingQuantity(input: string): {
  quantity: number | null;
  remainder: string;
} {
  const trimmed = normalizeFractionGlyphs(input).trim();
  if (!trimmed) return { quantity: null, remainder: "" };

  const rangePattern =
    /^(\d+(?:[.,]\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)\s*(?:-|–|to)\s*(\d+(?:[.,]\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)\s+(.*)$/iu;
  const range = trimmed.match(rangePattern);
  if (range) {
    const a = parseSingle(range[1]!);
    const b = parseSingle(range[2]!);
    if (a !== null && b !== null) {
      return { quantity: (a + b) / 2, remainder: range[3]!.trim() };
    }
  }

  const mixed = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)\s+(.*)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const num = Number(mixed[2]);
    const den = Number(mixed[3]);
    if (den !== 0) {
      return { quantity: whole + num / den, remainder: mixed[4]!.trim() };
    }
  }

  const fraction = trimmed.match(/^(\d+)\/(\d+)\s+(.*)$/);
  if (fraction) {
    const num = Number(fraction[1]);
    const den = Number(fraction[2]);
    if (den !== 0) {
      return { quantity: num / den, remainder: fraction[3]!.trim() };
    }
  }

  const decimal = trimmed.match(/^(\d+(?:[.,]\d+)?)\s+(.*)$/);
  if (decimal) {
    const value = Number(decimal[1]!.replace(",", "."));
    if (!Number.isNaN(value)) {
      return { quantity: value, remainder: decimal[2]!.trim() };
    }
  }

  const onlyNumber = trimmed.match(/^(\d+(?:[.,]\d+)?)$/);
  if (onlyNumber) {
    const value = Number(onlyNumber[1]!.replace(",", "."));
    if (!Number.isNaN(value)) {
      return { quantity: value, remainder: "" };
    }
  }

  return { quantity: null, remainder: trimmed };
}

function parseSingle(input: string): number | null {
  const cleaned = input.trim();
  const mixed = cleaned.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const num = Number(mixed[2]);
    const den = Number(mixed[3]);
    if (den !== 0) return whole + num / den;
  }
  const fraction = cleaned.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    const num = Number(fraction[1]);
    const den = Number(fraction[2]);
    if (den !== 0) return num / den;
  }
  const value = Number(cleaned.replace(",", "."));
  return Number.isNaN(value) ? null : value;
}

/**
 * Convert a decimal back into a kitchen-friendly mixed fraction display
 * like "1 ½" or "¾". For values that don't fit common fraction bases the
 * decimal is returned with up to two digits.
 */
export function formatQuantity(value: number, opts?: { decimal?: boolean }): string {
  if (!Number.isFinite(value)) return "";
  if (value === 0) return "0";
  if (opts?.decimal) return trimDecimal(value);

  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const whole = Math.floor(abs);
  const frac = abs - whole;
  if (Math.abs(frac) < 1e-6) return `${sign}${whole}`;

  const denominators = [2, 3, 4, 6, 8, 16];
  for (const d of denominators) {
    const num = Math.round(frac * d);
    if (num === 0 || num === d) continue;
    const approx = num / d;
    if (Math.abs(approx - frac) < 1 / (d * 16)) {
      const fracStr = vulgarFraction(num, d);
      return whole > 0 ? `${sign}${whole} ${fracStr}` : `${sign}${fracStr}`;
    }
  }
  return `${sign}${trimDecimal(abs)}`;
}

function trimDecimal(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function vulgarFraction(numerator: number, denominator: number): string {
  const key = `${numerator}/${denominator}`;
  const map: Record<string, string> = {
    "1/2": "\u00BD",
    "1/3": "\u2153",
    "2/3": "\u2154",
    "1/4": "\u00BC",
    "3/4": "\u00BE",
    "1/8": "\u215B",
    "3/8": "\u215C",
    "5/8": "\u215D",
    "7/8": "\u215E",
  };
  return map[key] ?? `${numerator}/${denominator}`;
}
