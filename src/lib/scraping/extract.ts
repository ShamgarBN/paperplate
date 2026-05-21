import { findJsonLdRecipe, jsonLdToRecipe } from "@/lib/scraping/jsonLd";
import { microdataToRecipe } from "@/lib/scraping/microdata";
import { siteProfileToRecipe } from "@/lib/scraping/siteProfiles";
import type { ScrapedRecipe, ScrapeOutcome } from "@/lib/scraping/types";

export function extractRecipe(
  html: string,
  meta: { sourceUrl: string; finalUrl: string },
): ScrapeOutcome {
  // Tier A: JSON-LD
  const json = findJsonLdRecipe(html);
  if (json) {
    const recipe = jsonLdToRecipe(json, meta);
    if (recipeIsViable(recipe)) {
      return { ok: true, recipe };
    }
  }

  // Tier B: microdata
  try {
    const micro = microdataToRecipe(html, meta);
    if (micro && recipeIsViable(micro)) {
      return { ok: true, recipe: micro };
    }
  } catch {
    /* fall through */
  }

  // Tier C: site-specific profile
  const profile = siteProfileToRecipe(html, meta);
  if (profile && recipeIsViable(profile)) {
    return { ok: true, recipe: profile };
  }

  return {
    ok: false,
    reason:
      "Could not extract a recipe from this page. Try the manual entry tab to copy/paste the ingredients and steps.",
  };
}

function recipeIsViable(recipe: ScrapedRecipe): boolean {
  return recipe.rawIngredients.length >= 2 && recipe.steps.length >= 1;
}
