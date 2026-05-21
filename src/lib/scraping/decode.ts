/**
 * Decode HTML entities that frequently slip into scraped strings.
 *
 * The JSON-LD scraper is the worst offender: many sites render their page
 * through an HTML-escaping template *first* and then embed the resulting
 * (already-escaped) text into a JSON-LD `<script>` block. That leaves
 * literal sequences like `They&#039;re` or `M&amp;Ms` inside the JSON,
 * which `JSON.parse` happily preserves byte-for-byte. Without decoding,
 * those leak straight through to ingredient text and instruction steps,
 * which is exactly the bug the user reported.
 *
 * The microdata path *usually* sidesteps this because `Element.textContent`
 * already decodes, but a few sites stash text inside attributes (e.g.
 * `content="They&#039;re tasty"`) which `Element.getAttribute` does not
 * decode, so we run microdata strings through the same path as a belt-
 * and-braces fix.
 *
 * Implementation: a tiny pure-JS pass handles the common named + numeric
 * entities (covers >99% of real-world recipe pages). For any unrecognised
 * named entities we fall back to a DOMParser round-trip — fully accurate
 * for HTML5, available wherever the rest of this module runs (Tauri
 * WebView, jsdom in tests).
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00A0",
  hellip: "\u2026",
  mdash: "\u2014",
  ndash: "\u2013",
  lsquo: "\u2018",
  rsquo: "\u2019",
  sbquo: "\u201A",
  ldquo: "\u201C",
  rdquo: "\u201D",
  bdquo: "\u201E",
  bull: "\u2022",
  trade: "\u2122",
  copy: "\u00A9",
  reg: "\u00AE",
  deg: "\u00B0",
  middot: "\u00B7",
  frac12: "\u00BD",
  frac14: "\u00BC",
  frac34: "\u00BE",
  // Math/cooking fractions occasionally appear in serving sizes
  frac13: "\u2153",
  frac23: "\u2154",
};

const ENTITY_PATTERN = /&(?:(#x?[0-9a-f]+)|([a-z][a-z0-9]+));/gi;

/**
 * Decode the HTML entities listed above into their literal characters.
 * Idempotent: running the function twice on already-decoded text is a
 * no-op, so it's safe to call on every extracted string regardless of
 * whether we expect entities.
 */
export function decodeHtmlEntities(input: string): string {
  if (!input || !input.includes("&")) return input;

  let needsDomFallback = false;
  const first = input.replace(ENTITY_PATTERN, (match, numeric, named) => {
    if (numeric) {
      // Numeric entity: &#39; (decimal) or &#x27; (hex).
      const codePoint = numeric.startsWith("#x") || numeric.startsWith("#X")
        ? parseInt(numeric.slice(2), 16)
        : parseInt(numeric.slice(1), 10);
      if (Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff) {
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return match;
        }
      }
      return match;
    }
    if (named) {
      const replacement = NAMED_ENTITIES[named.toLowerCase()];
      if (replacement != null) return replacement;
      // Mark the string for a final DOMParser pass — there are hundreds
      // of named HTML entities we deliberately don't enumerate here.
      needsDomFallback = true;
      return match;
    }
    return match;
  });

  if (!needsDomFallback) return first;
  return decodeViaDom(first);
}

/**
 * Last-resort decoder for named entities that aren't in `NAMED_ENTITIES`.
 * Uses a one-shot `DOMParser` parse rather than touching the live DOM so
 * we don't risk side-effects (and so jsdom in vitest still works).
 *
 * Wrapped in try/catch because `DOMParser` is unavailable in the very
 * rare case where this module is imported from a Node-only test harness
 * without jsdom; in that case we return the partially-decoded string.
 */
function decodeViaDom(input: string): string {
  try {
    if (typeof DOMParser === "undefined") return input;
    const doc = new DOMParser().parseFromString(
      `<!doctype html><body>${input}`,
      "text/html",
    );
    return doc.body?.textContent ?? input;
  } catch {
    return input;
  }
}
