import type { ScrapedRecipe } from "@/lib/scraping/types";

interface SiteProfile {
  /** Hostnames (or hostname suffixes) this profile applies to. */
  hosts: string[];
  /** Selectors for ingredients (prefer `li` items). */
  ingredientSelectors: string[];
  /** Selectors for instruction steps. */
  stepSelectors: string[];
  /** Optional override for the recipe title. */
  titleSelector?: string;
}

const PROFILES: SiteProfile[] = [
  {
    hosts: ["food52.com"],
    ingredientSelectors: [
      "ul.recipe__list--ingredients li",
      "ul.recipe-list--ingredients li",
    ],
    stepSelectors: [
      "ol.recipe__list--steps li",
      "ol.recipe-list--steps li",
    ],
    titleSelector: "h1.recipe__title, h1",
  },
  {
    hosts: ["smittenkitchen.com"],
    ingredientSelectors: [".jetpack-recipe-ingredients li"],
    stepSelectors: [".jetpack-recipe-directions p", ".jetpack-recipe-directions li"],
  },
  {
    hosts: ["seriouseats.com"],
    ingredientSelectors: [
      ".structured-ingredients__list-item",
      ".ingredient-list li",
    ],
    stepSelectors: [
      ".comp.mntl-sc-block-html",
      ".mntl-sc-block-html",
      ".structured-project__steps li",
    ],
  },
  {
    hosts: ["bonappetit.com"],
    ingredientSelectors: ["[data-testid=IngredientList] li"],
    stepSelectors: ["[data-testid=InstructionsWrapper] div p"],
  },
  {
    hosts: ["allrecipes.com"],
    ingredientSelectors: [
      "ul.mm-recipes-structured-ingredients__list li",
      "ul.ingredients-section li",
    ],
    stepSelectors: ["ol.mm-recipes-steps__content li", "ol.instructions-section li"],
  },
  {
    hosts: ["nytimes.com", "cooking.nytimes.com"],
    ingredientSelectors: ["[class*=ingredient_ingredient] li", "ul[class*=ingredient] li"],
    stepSelectors: ["[class*=preparation_step]", "ol[class*=preparation] li"],
  },
  {
    hosts: ["bbcgoodfood.com"],
    ingredientSelectors: [".ingredients-list li"],
    stepSelectors: [".method__list li"],
  },
  {
    hosts: ["budgetbytes.com"],
    ingredientSelectors: [".tasty-recipes-ingredients li"],
    stepSelectors: [".tasty-recipes-instructions li", ".tasty-recipes-instructions p"],
  },
  {
    hosts: ["minimalistbaker.com"],
    ingredientSelectors: [".tasty-recipes-ingredients li"],
    stepSelectors: [".tasty-recipes-instructions li"],
  },
  {
    hosts: ["loveandlemons.com"],
    ingredientSelectors: [".wprm-recipe-ingredient"],
    stepSelectors: [".wprm-recipe-instruction-text"],
  },
];

export function findProfile(hostname: string): SiteProfile | null {
  const lower = hostname.toLowerCase();
  for (const profile of PROFILES) {
    if (
      profile.hosts.some(
        (host) => lower === host || lower.endsWith(`.${host}`),
      )
    ) {
      return profile;
    }
  }
  return null;
}

export function siteProfileToRecipe(
  html: string,
  meta: { sourceUrl: string; finalUrl: string },
): ScrapedRecipe | null {
  let url: URL;
  try {
    url = new URL(meta.finalUrl);
  } catch {
    return null;
  }
  const profile = findProfile(url.hostname);
  if (!profile) return null;

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, "text/html");
  } catch {
    return null;
  }

  const ingredients: string[] = [];
  for (const sel of profile.ingredientSelectors) {
    doc.querySelectorAll(sel).forEach((el) => {
      const t = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (t) ingredients.push(t);
    });
    if (ingredients.length) break;
  }

  const steps: string[] = [];
  for (const sel of profile.stepSelectors) {
    doc.querySelectorAll(sel).forEach((el) => {
      const t = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (t) steps.push(t);
    });
    if (steps.length) break;
  }

  if (!ingredients.length || !steps.length) return null;

  const titleNode = profile.titleSelector
    ? doc.querySelector(profile.titleSelector)
    : doc.querySelector("h1");
  const title = (titleNode?.textContent ?? "Untitled recipe")
    .replace(/\s+/g, " ")
    .trim();

  const description =
    doc
      .querySelector('meta[name="description"]')
      ?.getAttribute("content")
      ?.trim() ?? null;

  const image =
    doc
      .querySelector('meta[property="og:image"]')
      ?.getAttribute("content")
      ?.trim() ?? null;

  return {
    title,
    description,
    imageUrl: image,
    sourceUrl: meta.sourceUrl,
    finalUrl: meta.finalUrl,
    servings: null,
    prepMinutes: null,
    cookMinutes: null,
    totalMinutes: null,
    difficulty: null,
    cuisine: null,
    category: null,
    keywords: [],
    dietary: [],
    rawIngredients: ingredients,
    steps,
    source: "site-profile",
  };
}
