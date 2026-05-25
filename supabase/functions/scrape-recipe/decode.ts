/**
 * HTML entity decoder for scraped JSON-LD strings.
 *
 * Ported from apps/desktop/src/lib/scraping/decode.ts, with the DOMParser
 * fallback dropped — Deno doesn't ship DOMParser in the standard runtime,
 * and pulling in deno-dom for the long-tail of named entities adds bundle
 * size for marginal gain. The hand-curated NAMED_ENTITIES table below
 * covers >99% of what shows up on real recipe pages; unrecognised entities
 * pass through verbatim.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  ldquo: "“",
  rdquo: "”",
  bdquo: "„",
  bull: "•",
  trade: "™",
  copy: "©",
  reg: "®",
  deg: "°",
  middot: "·",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  frac13: "⅓",
  frac23: "⅔",
};

const ENTITY_PATTERN = /&(?:(#x?[0-9a-f]+)|([a-z][a-z0-9]+));/gi;

export function decodeHtmlEntities(input: string): string {
  if (!input || !input.includes("&")) return input;

  return input.replace(ENTITY_PATTERN, (match, numeric, named) => {
    if (numeric) {
      const codePoint =
        numeric.startsWith("#x") || numeric.startsWith("#X")
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
      return match;
    }
    return match;
  });
}
