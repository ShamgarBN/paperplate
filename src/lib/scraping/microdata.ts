import { parseDurationMinutes } from "@/lib/scraping/duration";
import type { ScrapedRecipe } from "@/lib/scraping/types";

/**
 * Best-effort microdata extractor for `itemtype` set to `schema.org/Recipe`.
 * Implemented purely with the DOM (we run in a Tauri WebView, so DOMParser is
 * available). For sites that publish JSON-LD this is unused; we only fall back
 * here when the JSON-LD extractor returns null.
 */
export function microdataToRecipe(
  html: string,
  meta: { sourceUrl: string; finalUrl: string },
): ScrapedRecipe | null {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, "text/html");
  } catch {
    return null;
  }

  const scope = doc.querySelector(
    '[itemtype$="/Recipe"], [itemtype$="://schema.org/Recipe"]',
  );
  if (!scope) return null;

  const title =
    text(scope.querySelector('[itemprop="name"]')) ??
    text(doc.querySelector("h1")) ??
    "Untitled recipe";

  const description = text(scope.querySelector('[itemprop="description"]'));
  const image =
    attr(scope.querySelector('[itemprop="image"]'), "src") ??
    attr(scope.querySelector('[itemprop="image"]'), "content") ??
    text(scope.querySelector('[itemprop="image"]'));
  const servings = parseInt(
    text(scope.querySelector('[itemprop="recipeYield"]')) ??
      attr(scope.querySelector('[itemprop="recipeYield"]'), "content") ??
      "",
    10,
  );
  const prepMinutes = parseDurationMinutes(
    attr(scope.querySelector('[itemprop="prepTime"]'), "datetime") ??
      attr(scope.querySelector('[itemprop="prepTime"]'), "content") ??
      text(scope.querySelector('[itemprop="prepTime"]')),
  );
  const cookMinutes = parseDurationMinutes(
    attr(scope.querySelector('[itemprop="cookTime"]'), "datetime") ??
      attr(scope.querySelector('[itemprop="cookTime"]'), "content") ??
      text(scope.querySelector('[itemprop="cookTime"]')),
  );
  const totalMinutes =
    parseDurationMinutes(
      attr(scope.querySelector('[itemprop="totalTime"]'), "datetime") ??
        attr(scope.querySelector('[itemprop="totalTime"]'), "content") ??
        text(scope.querySelector('[itemprop="totalTime"]')),
    ) ??
    (prepMinutes != null && cookMinutes != null
      ? prepMinutes + cookMinutes
      : (prepMinutes ?? cookMinutes));
  const cuisine = text(scope.querySelector('[itemprop="recipeCuisine"]'));
  const category = text(scope.querySelector('[itemprop="recipeCategory"]'));
  const keywords = (text(scope.querySelector('[itemprop="keywords"]')) ?? "")
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const ingredientNodes = scope.querySelectorAll(
    '[itemprop="recipeIngredient"], [itemprop="ingredients"]',
  );
  const rawIngredients: string[] = [];
  ingredientNodes.forEach((node) => {
    const t = text(node);
    if (t) rawIngredients.push(t);
  });

  const stepNodes = scope.querySelectorAll(
    '[itemprop="recipeInstructions"] [itemprop="text"], [itemprop="recipeInstructions"] li, [itemprop="recipeInstructions"] p, [itemprop="recipeInstruction"]',
  );
  let steps: string[] = [];
  stepNodes.forEach((node) => {
    const t = text(node);
    if (t) steps.push(t);
  });
  if (!steps.length) {
    const single = scope.querySelector('[itemprop="recipeInstructions"]');
    if (single) {
      const txt = single.textContent ?? "";
      steps = txt
        .split(/\r?\n|\.\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

  if (!rawIngredients.length || !steps.length) return null;

  return {
    title,
    description,
    imageUrl: image,
    sourceUrl: meta.sourceUrl,
    finalUrl: meta.finalUrl,
    servings: Number.isFinite(servings) && servings > 0 ? servings : null,
    prepMinutes,
    cookMinutes,
    totalMinutes,
    difficulty: null,
    cuisine,
    category,
    keywords,
    dietary: [],
    rawIngredients,
    steps,
    source: "microdata",
  };
}

function text(node: Element | null): string | null {
  if (!node) return null;
  return (node.textContent ?? "").replace(/\s+/g, " ").trim() || null;
}

function attr(node: Element | null, name: string): string | null {
  if (!node) return null;
  const v = node.getAttribute(name);
  return v ? v.trim() : null;
}
