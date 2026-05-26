/**
 * Find a hero-image URL on a fetched recipe page.
 *
 * The desktop's main `extractRecipe` pipeline only surfaces the image
 * when JSON-LD has one. Plenty of real-world recipe pages stash the
 * image in og:image / twitter:image / a regular `<img>` tag instead, so
 * the import-time flow misses it and the recipe ends up with no hero.
 *
 * This module mirrors the strategy of `scripts/backfill-hero-images.ts`
 * so the in-app "Re-fetch hero image" button on the recipe detail view
 * recovers the same images the one-shot backfill could.
 *
 * Tier order:
 *   1. JSON-LD Recipe.image (string, {url}, or array of either)
 *   2. <meta property="og:image"> / og:image:secure_url
 *   3. <meta name="twitter:image"> / twitter:image:src
 *   4. First <img src> in the document
 */

const JSON_LD_PATTERN =
  /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

export function findHeroImage(html: string, sourceUrl: string): string | null {
  // 1. JSON-LD recipe.image
  for (const match of html.matchAll(JSON_LD_PATTERN)) {
    const body = match[1];
    if (!body) continue;
    const cleaned = body.replace(/ +/g, "").trim();
    if (!cleaned) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      try {
        parsed = JSON.parse(cleaned.replace(/<!--([\s\S]*?)-->/g, ""));
      } catch {
        continue;
      }
    }
    const recipe = findRecipeNode(parsed);
    if (recipe) {
      const img = asImageString(recipe["image"]);
      if (img) return absolutize(img, sourceUrl);
    }
  }

  // 2. og:image
  const og = matchMetaContent(
    html,
    /(property|name)=["']og:image(?::secure_url)?["']/i,
  );
  if (og) return absolutize(og, sourceUrl);

  // 3. twitter:image
  const tw = matchMetaContent(
    html,
    /(property|name)=["']twitter:image(?::src)?["']/i,
  );
  if (tw) return absolutize(tw, sourceUrl);

  // 4. First <img>. Last resort — may pick up a logo on a poorly-marked-up
  // page, but better than nothing for a manual recovery action.
  const img = html.match(/<img\b[^>]+\bsrc=["']([^"']+)["']/i);
  if (img && img[1]) return absolutize(img[1], sourceUrl);

  return null;
}

function findRecipeNode(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  const t = obj["@type"];
  const isRecipe =
    (typeof t === "string" && t.toLowerCase().includes("recipe")) ||
    (Array.isArray(t) &&
      t.some(
        (x) => typeof x === "string" && x.toLowerCase().includes("recipe"),
      ));
  if (isRecipe) return obj;
  if (Array.isArray(obj["@graph"])) return findRecipeNode(obj["@graph"]);
  if (Array.isArray(obj["mainEntity"])) return findRecipeNode(obj["mainEntity"]);
  if (obj["mainEntity"]) return findRecipeNode(obj["mainEntity"]);
  return null;
}

function asImageString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    for (const v of value) {
      const s = asImageString(v);
      if (s) return s;
    }
    return null;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj["url"] === "string") return obj["url"].trim();
    if (typeof obj["@id"] === "string") return obj["@id"].trim();
    if (typeof obj["contentUrl"] === "string") return obj["contentUrl"].trim();
  }
  return null;
}

function matchMetaContent(html: string, attrPattern: RegExp): string | null {
  // Cover both attribute orderings: `<meta x=... content=...>` and
  // `<meta content=... x=...>`.
  const attrSrc = attrPattern.source;
  const flags = attrPattern.flags.replace("g", "");
  const a = new RegExp(
    `<meta\\b[^>]*${attrSrc}[^>]*\\bcontent=["']([^"']+)["']`,
    flags,
  );
  const b = new RegExp(
    `<meta\\b[^>]*\\bcontent=["']([^"']+)["'][^>]*${attrSrc}`,
    flags,
  );
  const aMatch = html.match(a);
  if (aMatch && aMatch[aMatch.length - 1])
    return aMatch[aMatch.length - 1]!.trim();
  const bMatch = html.match(b);
  if (bMatch && bMatch[1]) return bMatch[1].trim();
  return null;
}

function absolutize(url: string, base: string): string {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}
