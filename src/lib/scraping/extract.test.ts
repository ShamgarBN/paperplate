import { describe, expect, it } from "vitest";
import { extractRecipe } from "@/lib/scraping/extract";

const sampleJsonLdHtml = `
<!doctype html>
<html><head>
<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Recipe",
  name: "Quick Pasta",
  description: "Weeknight pasta with garlic and olive oil.",
  image: "https://example.test/hero.jpg",
  recipeYield: "4 servings",
  prepTime: "PT10M",
  cookTime: "PT15M",
  totalTime: "PT25M",
  recipeCuisine: "Italian",
  recipeCategory: "Pasta",
  keywords: ["weeknight", "pasta"],
  recipeIngredient: [
    "1 lb spaghetti",
    "1/4 cup olive oil",
    "4 cloves garlic, minced",
    "1/2 tsp red pepper flakes",
    "Salt to taste",
  ],
  recipeInstructions: [
    { "@type": "HowToStep", text: "Boil pasta until al dente." },
    { "@type": "HowToStep", text: "Sizzle garlic in oil." },
    { "@type": "HowToStep", text: "Toss together and serve." },
  ],
})}
</script>
</head><body><h1>Quick Pasta</h1></body></html>
`;

const microdataHtml = `
<!doctype html><html><body>
<article itemscope itemtype="https://schema.org/Recipe">
  <h1 itemprop="name">Tomato Soup</h1>
  <p itemprop="description">Comforting tomato soup.</p>
  <meta itemprop="image" content="https://example.test/soup.jpg" />
  <meta itemprop="recipeYield" content="6" />
  <meta itemprop="prepTime" content="PT5M" />
  <meta itemprop="cookTime" content="PT25M" />
  <meta itemprop="recipeCuisine" content="American" />
  <ul>
    <li itemprop="recipeIngredient">2 tbsp butter</li>
    <li itemprop="recipeIngredient">1 yellow onion, diced</li>
    <li itemprop="recipeIngredient">2 cans crushed tomatoes</li>
    <li itemprop="recipeIngredient">2 cups vegetable stock</li>
  </ul>
  <div itemprop="recipeInstructions">
    <p>Sauté the onion in butter.</p>
    <p>Add tomatoes and stock and simmer for 25 minutes.</p>
    <p>Blend and season.</p>
  </div>
</article>
</body></html>
`;

describe("extractRecipe", () => {
  it("extracts a JSON-LD recipe", () => {
    const result = extractRecipe(sampleJsonLdHtml, {
      sourceUrl: "https://example.test/pasta",
      finalUrl: "https://example.test/pasta",
    });
    expect(result.ok).toBe(true);
    const recipe = result.recipe!;
    expect(recipe.title).toBe("Quick Pasta");
    expect(recipe.servings).toBe(4);
    expect(recipe.prepMinutes).toBe(10);
    expect(recipe.cookMinutes).toBe(15);
    expect(recipe.totalMinutes).toBe(25);
    expect(recipe.cuisine).toBe("Italian");
    expect(recipe.rawIngredients).toHaveLength(5);
    expect(recipe.steps).toHaveLength(3);
    expect(recipe.source).toBe("json-ld");
  });

  it("extracts a microdata recipe", () => {
    const result = extractRecipe(microdataHtml, {
      sourceUrl: "https://example.test/soup",
      finalUrl: "https://example.test/soup",
    });
    expect(result.ok).toBe(true);
    const recipe = result.recipe!;
    expect(recipe.title).toBe("Tomato Soup");
    expect(recipe.servings).toBe(6);
    expect(recipe.rawIngredients).toHaveLength(4);
    expect(recipe.steps.length).toBeGreaterThan(0);
    expect(recipe.source).toBe("microdata");
  });

  it("falls through to a friendly error on plain pages", () => {
    const result = extractRecipe(
      "<html><body><h1>Just an article</h1></body></html>",
      { sourceUrl: "https://example.test", finalUrl: "https://example.test" },
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it("handles JSON-LD wrapped in @graph", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebPage", url: "https://example.test/" },
        {
          "@type": "Recipe",
          name: "Embedded",
          recipeIngredient: ["1 cup water", "1 tsp salt"],
          recipeInstructions: ["Boil water.", "Add salt."],
        },
      ],
    })}</script>`;
    const result = extractRecipe(html, {
      sourceUrl: "https://example.test/",
      finalUrl: "https://example.test/",
    });
    expect(result.ok).toBe(true);
    expect(result.recipe?.title).toBe("Embedded");
  });
});
