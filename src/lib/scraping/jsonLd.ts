import { parseDurationMinutes } from "@/lib/scraping/duration";
import type { ScrapedRecipe } from "@/lib/scraping/types";

const JSON_LD_PATTERN =
  /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

export function findJsonLdRecipe(html: string): unknown | null {
  for (const match of html.matchAll(JSON_LD_PATTERN)) {
    const body = match[1];
    if (!body) continue;
    const cleaned = body.replace(/\u0000+/g, "").trim();
    if (!cleaned) continue;
    try {
      const parsed = JSON.parse(cleaned);
      const recipe = findRecipeNode(parsed);
      if (recipe) return recipe;
    } catch {
      // Try to extract @graph or arrays of mixed objects from semi-broken JSON
      // by stripping HTML comments which sometimes leak in.
      try {
        const stripped = cleaned.replace(/<!--([\s\S]*?)-->/g, "");
        const parsed = JSON.parse(stripped);
        const recipe = findRecipeNode(parsed);
        if (recipe) return recipe;
      } catch {
        // ignore - try the next block
      }
    }
  }
  return null;
}

function findRecipeNode(node: unknown): unknown | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  if (isRecipeType(obj["@type"])) return obj;
  if (Array.isArray(obj["@graph"])) {
    return findRecipeNode(obj["@graph"]);
  }
  if (Array.isArray(obj["mainEntity"])) {
    return findRecipeNode(obj["mainEntity"]);
  }
  if (obj["mainEntity"]) return findRecipeNode(obj["mainEntity"]);
  return null;
}

function isRecipeType(t: unknown): boolean {
  if (!t) return false;
  if (typeof t === "string") return t.toLowerCase().includes("recipe");
  if (Array.isArray(t)) return t.some((x) => isRecipeType(x));
  return false;
}

function asString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return value.toString();
  if (Array.isArray(value)) {
    for (const item of value) {
      const s = asString(item);
      if (s) return s;
    }
    return null;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj["@value"] === "string") return obj["@value"];
    if (typeof obj["name"] === "string") return obj["name"];
    if (typeof obj["text"] === "string") return obj["text"];
    if (typeof obj["url"] === "string") return obj["url"];
  }
  return null;
}

function asStringArray(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === "string") {
    return value
      .split(/\r?\n|;|,(?=\s)/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const item of value) {
      const s = asString(item);
      if (s) out.push(s);
    }
    return out;
  }
  const single = asString(value);
  return single ? [single] : [];
}

function extractInstructions(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === "string") {
    return value
      .split(/\r?\n|\.\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const node of value) {
      out.push(...extractInstructions(node));
    }
    return out;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const t = obj["@type"];
    if (typeof t === "string" && t.toLowerCase().includes("howtosection")) {
      const items: string[] = [];
      if (obj["name"]) items.push(`### ${asString(obj["name"])}`);
      const item = obj["itemListElement"] ?? obj["item"];
      items.push(...extractInstructions(item));
      return items;
    }
    if (typeof obj["text"] === "string") return [obj["text"].trim()];
    if (typeof obj["name"] === "string" && typeof obj["text"] !== "string") {
      return [obj["name"].trim()];
    }
  }
  return [];
}

function parseServings(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.round(value));
  }
  const text = asString(value);
  if (!text) return null;
  const num = text.match(/(\d+(?:\.\d+)?)/);
  if (num) {
    const v = Number(num[1]);
    if (!Number.isNaN(v) && v > 0) return Math.round(v);
  }
  return null;
}

export function jsonLdToRecipe(
  node: unknown,
  meta: { sourceUrl: string; finalUrl: string },
): ScrapedRecipe {
  const obj = node as Record<string, unknown>;
  const title = asString(obj["name"]) ?? "Untitled recipe";
  const description = asString(obj["description"]);
  const image = asString(obj["image"]);
  const servings =
    parseServings(obj["recipeYield"]) ?? parseServings(obj["yield"]);
  const prepMinutes = parseDurationMinutes(obj["prepTime"]);
  const cookMinutes = parseDurationMinutes(obj["cookTime"]);
  const totalMinutes =
    parseDurationMinutes(obj["totalTime"]) ??
    (prepMinutes != null && cookMinutes != null
      ? prepMinutes + cookMinutes
      : (prepMinutes ?? cookMinutes));
  const cuisine = asString(obj["recipeCuisine"]);
  const category = asString(obj["recipeCategory"]);
  const keywords = asStringArray(obj["keywords"]);
  const dietary = asStringArray(obj["suitableForDiet"]).map((s) =>
    s.replace(/^https?:\/\/schema\.org\//i, "").replace(/Diet$/i, ""),
  );
  const rawIngredients = asStringArray(obj["recipeIngredient"]).filter(Boolean);
  const steps = extractInstructions(obj["recipeInstructions"]);

  return {
    title,
    description,
    imageUrl: image,
    sourceUrl: meta.sourceUrl,
    finalUrl: meta.finalUrl,
    servings,
    prepMinutes,
    cookMinutes,
    totalMinutes,
    difficulty: null,
    cuisine,
    category,
    keywords,
    dietary,
    rawIngredients,
    steps,
    source: "json-ld",
  };
}
