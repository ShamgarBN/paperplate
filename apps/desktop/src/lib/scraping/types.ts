export interface ScrapedRecipe {
  title: string;
  description: string | null;
  imageUrl: string | null;
  sourceUrl: string;
  finalUrl: string;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
  difficulty: "easy" | "medium" | "hard" | null;
  cuisine: string | null;
  category: string | null;
  keywords: string[];
  dietary: string[];
  rawIngredients: string[];
  steps: string[];
  /** Which extractor produced the result, for telemetry/UI hints. */
  source: "json-ld" | "microdata" | "site-profile" | "manual";
}

export interface ScrapeOutcome {
  ok: boolean;
  recipe?: ScrapedRecipe;
  reason?: string;
}
