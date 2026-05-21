// Canonicalize ingredient names so "scallions" and "green onions" merge,
// "tomatoes, diced" collapses to "tomato", etc. Also flags items as
// indivisible (whole onions, eggs, garlic cloves) so the shopping list can
// round them up to whole units.

export interface CanonicalIngredient {
  canonical: string;
  display: string;
  isIndivisible?: boolean;
  /** Aisle name from the seeded aisle table. */
  aisle?:
    | "Produce"
    | "Meat & Seafood"
    | "Dairy & Eggs"
    | "Bakery"
    | "Pantry & Dry Goods"
    | "Spices & Oils"
    | "Frozen"
    | "Beverages"
    | "Other";
  /**
   * Approximate weight (grams) of one indivisible unit. Used for rough
   * estimating waste fractions in the planner.
   */
  approxUnitWeightGrams?: number;
  /** Optional perishable flag for waste-aware planning. */
  perishable?: boolean;
}

const ALIAS_MAP: Record<string, string> = {
  scallions: "green onion",
  scallion: "green onion",
  "spring onion": "green onion",
  "spring onions": "green onion",
  "green onions": "green onion",
  cilantro: "cilantro",
  coriander: "cilantro",
  "fresh coriander": "cilantro",
  capsicum: "bell pepper",
  "bell peppers": "bell pepper",
  "red bell peppers": "red bell pepper",
  "yellow bell peppers": "yellow bell pepper",
  "green bell peppers": "green bell pepper",
  aubergine: "eggplant",
  aubergines: "eggplant",
  courgette: "zucchini",
  courgettes: "zucchini",
  rocket: "arugula",
  "spring greens": "kale",
  "garlic cloves": "garlic clove",
  "cloves of garlic": "garlic clove",
  "onion": "yellow onion",
  "onions": "yellow onion",
  "extra virgin olive oil": "olive oil",
  "extra-virgin olive oil": "olive oil",
  "evoo": "olive oil",
  "kosher salt": "kosher salt",
  "table salt": "salt",
  "fine sea salt": "sea salt",
  "fresh ground pepper": "black pepper",
  "freshly ground black pepper": "black pepper",
  "ground black pepper": "black pepper",
  "boneless skinless chicken breasts": "chicken breast",
  "boneless skinless chicken breast": "chicken breast",
  "chicken breasts": "chicken breast",
  "chicken thighs": "chicken thigh",
  "boneless skinless chicken thighs": "chicken thigh",
  "ground beef": "ground beef",
  "lean ground beef": "ground beef",
  "ground turkey": "ground turkey",
  "ground pork": "ground pork",
  "italian sausage": "italian sausage",
  "all-purpose flour": "all-purpose flour",
  "all purpose flour": "all-purpose flour",
  "ap flour": "all-purpose flour",
  "plain flour": "all-purpose flour",
  "bread flour": "bread flour",
  "whole wheat flour": "whole wheat flour",
  "wholemeal flour": "whole wheat flour",
  "caster sugar": "granulated sugar",
  "white sugar": "granulated sugar",
  "granulated sugar": "granulated sugar",
  "brown sugar": "brown sugar",
  "light brown sugar": "brown sugar",
  "dark brown sugar": "brown sugar",
  "icing sugar": "powdered sugar",
  "confectioners sugar": "powdered sugar",
  "powdered sugar": "powdered sugar",
  // tomatoes
  "roma tomatoes": "roma tomato",
  "plum tomatoes": "roma tomato",
  "cherry tomatoes": "cherry tomato",
  "grape tomatoes": "grape tomato",
  "canned diced tomatoes": "canned diced tomatoes",
  "diced tomatoes": "tomato",
  // dairy
  "whole milk": "milk",
  "2% milk": "milk",
  "skim milk": "milk",
  "heavy cream": "heavy cream",
  "double cream": "heavy cream",
  "whipping cream": "heavy cream",
  "sour cream": "sour cream",
  "greek yogurt": "greek yogurt",
  "natural yogurt": "yogurt",
  "plain yogurt": "yogurt",
};

const KNOWN: Record<string, Omit<CanonicalIngredient, "canonical">> = {
  // Produce - whole indivisibles
  "yellow onion": {
    display: "Yellow onion",
    isIndivisible: true,
    aisle: "Produce",
    approxUnitWeightGrams: 170,
    perishable: true,
  },
  "white onion": {
    display: "White onion",
    isIndivisible: true,
    aisle: "Produce",
    approxUnitWeightGrams: 170,
    perishable: true,
  },
  "red onion": {
    display: "Red onion",
    isIndivisible: true,
    aisle: "Produce",
    approxUnitWeightGrams: 170,
    perishable: true,
  },
  "green onion": {
    display: "Green onion",
    aisle: "Produce",
    perishable: true,
  },
  "garlic clove": {
    display: "Garlic clove",
    isIndivisible: true,
    aisle: "Produce",
    approxUnitWeightGrams: 5,
    perishable: false,
  },
  "garlic head": {
    display: "Head of garlic",
    isIndivisible: true,
    aisle: "Produce",
    approxUnitWeightGrams: 60,
    perishable: false,
  },
  "lemon": {
    display: "Lemon",
    isIndivisible: true,
    aisle: "Produce",
    approxUnitWeightGrams: 90,
    perishable: true,
  },
  "lime": {
    display: "Lime",
    isIndivisible: true,
    aisle: "Produce",
    approxUnitWeightGrams: 60,
    perishable: true,
  },
  "orange": {
    display: "Orange",
    isIndivisible: true,
    aisle: "Produce",
    approxUnitWeightGrams: 200,
    perishable: true,
  },
  "carrot": {
    display: "Carrot",
    isIndivisible: true,
    aisle: "Produce",
    approxUnitWeightGrams: 60,
    perishable: true,
  },
  "celery": {
    display: "Celery",
    aisle: "Produce",
    perishable: true,
  },
  "potato": {
    display: "Potato",
    isIndivisible: true,
    aisle: "Produce",
    approxUnitWeightGrams: 170,
    perishable: false,
  },
  "sweet potato": {
    display: "Sweet potato",
    isIndivisible: true,
    aisle: "Produce",
    approxUnitWeightGrams: 200,
    perishable: false,
  },
  "tomato": {
    display: "Tomato",
    isIndivisible: true,
    aisle: "Produce",
    approxUnitWeightGrams: 120,
    perishable: true,
  },
  "roma tomato": {
    display: "Roma tomato",
    isIndivisible: true,
    aisle: "Produce",
    approxUnitWeightGrams: 60,
    perishable: true,
  },
  "cherry tomato": {
    display: "Cherry tomato",
    aisle: "Produce",
    perishable: true,
  },
  "grape tomato": {
    display: "Grape tomato",
    aisle: "Produce",
    perishable: true,
  },
  "bell pepper": {
    display: "Bell pepper",
    isIndivisible: true,
    aisle: "Produce",
    approxUnitWeightGrams: 150,
    perishable: true,
  },
  "red bell pepper": {
    display: "Red bell pepper",
    isIndivisible: true,
    aisle: "Produce",
    approxUnitWeightGrams: 150,
    perishable: true,
  },
  "jalapeno": {
    display: "Jalapeño",
    isIndivisible: true,
    aisle: "Produce",
    approxUnitWeightGrams: 14,
    perishable: true,
  },
  "serrano": {
    display: "Serrano pepper",
    isIndivisible: true,
    aisle: "Produce",
    perishable: true,
  },
  "ginger": {
    display: "Fresh ginger",
    aisle: "Produce",
    perishable: false,
  },
  "cucumber": {
    display: "Cucumber",
    isIndivisible: true,
    aisle: "Produce",
    approxUnitWeightGrams: 200,
    perishable: true,
  },
  "zucchini": {
    display: "Zucchini",
    isIndivisible: true,
    aisle: "Produce",
    approxUnitWeightGrams: 200,
    perishable: true,
  },
  "eggplant": {
    display: "Eggplant",
    isIndivisible: true,
    aisle: "Produce",
    approxUnitWeightGrams: 450,
    perishable: true,
  },
  "avocado": {
    display: "Avocado",
    isIndivisible: true,
    aisle: "Produce",
    approxUnitWeightGrams: 200,
    perishable: true,
  },
  "spinach": {
    display: "Spinach",
    aisle: "Produce",
    perishable: true,
  },
  "kale": {
    display: "Kale",
    aisle: "Produce",
    perishable: true,
  },
  "arugula": {
    display: "Arugula",
    aisle: "Produce",
    perishable: true,
  },
  "lettuce": {
    display: "Lettuce",
    aisle: "Produce",
    perishable: true,
  },
  "mushroom": {
    display: "Mushrooms",
    aisle: "Produce",
    perishable: true,
  },
  "parsley": {
    display: "Parsley",
    aisle: "Produce",
    perishable: true,
  },
  "cilantro": {
    display: "Cilantro",
    aisle: "Produce",
    perishable: true,
  },
  "basil": {
    display: "Basil",
    aisle: "Produce",
    perishable: true,
  },
  "thyme": {
    display: "Thyme",
    aisle: "Produce",
    perishable: true,
  },
  "rosemary": {
    display: "Rosemary",
    aisle: "Produce",
    perishable: true,
  },
  "mint": {
    display: "Mint",
    aisle: "Produce",
    perishable: true,
  },
  "dill": {
    display: "Dill",
    aisle: "Produce",
    perishable: true,
  },

  // Meat & Seafood
  "chicken breast": {
    display: "Chicken breast",
    aisle: "Meat & Seafood",
    perishable: true,
  },
  "chicken thigh": {
    display: "Chicken thigh",
    aisle: "Meat & Seafood",
    perishable: true,
  },
  "ground beef": {
    display: "Ground beef",
    aisle: "Meat & Seafood",
    perishable: true,
  },
  "ground turkey": {
    display: "Ground turkey",
    aisle: "Meat & Seafood",
    perishable: true,
  },
  "ground pork": {
    display: "Ground pork",
    aisle: "Meat & Seafood",
    perishable: true,
  },
  "italian sausage": {
    display: "Italian sausage",
    aisle: "Meat & Seafood",
    perishable: true,
  },
  "bacon": {
    display: "Bacon",
    aisle: "Meat & Seafood",
    perishable: true,
  },
  "salmon": {
    display: "Salmon",
    aisle: "Meat & Seafood",
    perishable: true,
  },
  "shrimp": {
    display: "Shrimp",
    aisle: "Meat & Seafood",
    perishable: true,
  },

  // Dairy & Eggs
  "egg": {
    display: "Egg",
    isIndivisible: true,
    aisle: "Dairy & Eggs",
    approxUnitWeightGrams: 50,
    perishable: false,
  },
  "milk": { display: "Milk", aisle: "Dairy & Eggs", perishable: true },
  "butter": { display: "Butter", aisle: "Dairy & Eggs", perishable: false },
  "heavy cream": {
    display: "Heavy cream",
    aisle: "Dairy & Eggs",
    perishable: true,
  },
  "sour cream": {
    display: "Sour cream",
    aisle: "Dairy & Eggs",
    perishable: true,
  },
  "yogurt": { display: "Yogurt", aisle: "Dairy & Eggs", perishable: true },
  "greek yogurt": {
    display: "Greek yogurt",
    aisle: "Dairy & Eggs",
    perishable: true,
  },
  "parmesan": {
    display: "Parmesan",
    aisle: "Dairy & Eggs",
    perishable: false,
  },
  "mozzarella": {
    display: "Mozzarella",
    aisle: "Dairy & Eggs",
    perishable: true,
  },
  "cheddar": { display: "Cheddar", aisle: "Dairy & Eggs", perishable: false },
  "feta": { display: "Feta", aisle: "Dairy & Eggs", perishable: true },
  "cream cheese": {
    display: "Cream cheese",
    aisle: "Dairy & Eggs",
    perishable: false,
  },

  // Bakery
  "bread": { display: "Bread", aisle: "Bakery", perishable: false },
  "tortilla": { display: "Tortillas", aisle: "Bakery", perishable: false },
  "pita": { display: "Pita", aisle: "Bakery", perishable: false },
  "baguette": { display: "Baguette", aisle: "Bakery", perishable: true },

  // Pantry & dry goods
  "all-purpose flour": {
    display: "All-purpose flour",
    aisle: "Pantry & Dry Goods",
  },
  "bread flour": { display: "Bread flour", aisle: "Pantry & Dry Goods" },
  "whole wheat flour": {
    display: "Whole wheat flour",
    aisle: "Pantry & Dry Goods",
  },
  "granulated sugar": {
    display: "Granulated sugar",
    aisle: "Pantry & Dry Goods",
  },
  "brown sugar": { display: "Brown sugar", aisle: "Pantry & Dry Goods" },
  "powdered sugar": { display: "Powdered sugar", aisle: "Pantry & Dry Goods" },
  "honey": { display: "Honey", aisle: "Pantry & Dry Goods" },
  "maple syrup": { display: "Maple syrup", aisle: "Pantry & Dry Goods" },
  "rice": { display: "Rice", aisle: "Pantry & Dry Goods" },
  "jasmine rice": { display: "Jasmine rice", aisle: "Pantry & Dry Goods" },
  "basmati rice": { display: "Basmati rice", aisle: "Pantry & Dry Goods" },
  "pasta": { display: "Pasta", aisle: "Pantry & Dry Goods" },
  "spaghetti": { display: "Spaghetti", aisle: "Pantry & Dry Goods" },
  "penne": { display: "Penne", aisle: "Pantry & Dry Goods" },
  "linguine": { display: "Linguine", aisle: "Pantry & Dry Goods" },
  "rigatoni": { display: "Rigatoni", aisle: "Pantry & Dry Goods" },
  "canned diced tomatoes": {
    display: "Canned diced tomatoes",
    aisle: "Pantry & Dry Goods",
  },
  "tomato paste": { display: "Tomato paste", aisle: "Pantry & Dry Goods" },
  "tomato sauce": { display: "Tomato sauce", aisle: "Pantry & Dry Goods" },
  "chicken stock": { display: "Chicken stock", aisle: "Pantry & Dry Goods" },
  "vegetable stock": {
    display: "Vegetable stock",
    aisle: "Pantry & Dry Goods",
  },
  "beef stock": { display: "Beef stock", aisle: "Pantry & Dry Goods" },
  "soy sauce": { display: "Soy sauce", aisle: "Pantry & Dry Goods" },
  "fish sauce": { display: "Fish sauce", aisle: "Pantry & Dry Goods" },
  "rice vinegar": { display: "Rice vinegar", aisle: "Pantry & Dry Goods" },
  "white wine vinegar": {
    display: "White wine vinegar",
    aisle: "Pantry & Dry Goods",
  },
  "red wine vinegar": {
    display: "Red wine vinegar",
    aisle: "Pantry & Dry Goods",
  },
  "balsamic vinegar": {
    display: "Balsamic vinegar",
    aisle: "Pantry & Dry Goods",
  },

  // Spices & Oils
  "olive oil": { display: "Olive oil", aisle: "Spices & Oils" },
  "vegetable oil": { display: "Vegetable oil", aisle: "Spices & Oils" },
  "canola oil": { display: "Canola oil", aisle: "Spices & Oils" },
  "sesame oil": { display: "Sesame oil", aisle: "Spices & Oils" },
  "salt": { display: "Salt", aisle: "Spices & Oils" },
  "kosher salt": { display: "Kosher salt", aisle: "Spices & Oils" },
  "sea salt": { display: "Sea salt", aisle: "Spices & Oils" },
  "black pepper": { display: "Black pepper", aisle: "Spices & Oils" },
  "cumin": { display: "Cumin", aisle: "Spices & Oils" },
  "paprika": { display: "Paprika", aisle: "Spices & Oils" },
  "smoked paprika": { display: "Smoked paprika", aisle: "Spices & Oils" },
  "cinnamon": { display: "Cinnamon", aisle: "Spices & Oils" },
  "oregano": { display: "Oregano", aisle: "Spices & Oils" },
  "red pepper flakes": {
    display: "Red pepper flakes",
    aisle: "Spices & Oils",
  },
  "chili powder": { display: "Chili powder", aisle: "Spices & Oils" },
  "curry powder": { display: "Curry powder", aisle: "Spices & Oils" },
  "garlic powder": { display: "Garlic powder", aisle: "Spices & Oils" },
  "onion powder": { display: "Onion powder", aisle: "Spices & Oils" },

  // Frozen
  "frozen peas": { display: "Frozen peas", aisle: "Frozen" },
  "frozen corn": { display: "Frozen corn", aisle: "Frozen" },
  "frozen spinach": { display: "Frozen spinach", aisle: "Frozen" },

  // Beverages
  "white wine": { display: "White wine", aisle: "Beverages" },
  "red wine": { display: "Red wine", aisle: "Beverages" },
  "beer": { display: "Beer", aisle: "Beverages" },
};

const STOPWORDS = new Set([
  "of",
  "the",
  "a",
  "an",
  "and",
  "with",
  "fresh",
  "freshly",
  "ripe",
  "raw",
  "cooked",
  "small",
  "medium",
  "large",
  "extra-large",
  "extra",
  "for",
  "to",
  "garnish",
  "optional",
  "preferably",
  "good-quality",
  "good",
  "quality",
  "best-quality",
  "homemade",
]);

const PREP_KEYWORDS = new Set([
  "chopped",
  "diced",
  "minced",
  "sliced",
  "thinly",
  "thickly",
  "cubed",
  "crushed",
  "grated",
  "shredded",
  "peeled",
  "seeded",
  "deseeded",
  "stemmed",
  "cored",
  "halved",
  "quartered",
  "julienned",
  "rinsed",
  "drained",
  "trimmed",
  "softened",
  "melted",
  "cold",
  "warm",
  "room",
  "temperature",
  "beaten",
  "whisked",
  "lightly",
  "finely",
  "coarsely",
  "roughly",
  "patted",
  "dry",
  "torn",
  "pitted",
  "boiled",
  "blanched",
  "toasted",
  "rinsed",
  "divided",
]);

export interface CanonicalizationResult {
  canonical: string;
  display: string;
  preparation: string | null;
  isIndivisible: boolean;
  aisle?: CanonicalIngredient["aisle"];
  approxUnitWeightGrams?: number;
  perishable?: boolean;
}

/**
 * Reduce a parsed ingredient name to a canonical key (e.g., "Roma tomatoes,
 * diced" -> { canonical: "roma tomato", preparation: "diced" }).
 */
export function canonicalizeName(rawName: string): CanonicalizationResult {
  const original = rawName;

  // Pull out comma-tail preparation hints.
  let head = original;
  const prepParts: string[] = [];
  const commaIdx = original.indexOf(",");
  if (commaIdx >= 0) {
    head = original.slice(0, commaIdx).trim();
    const tail = original.slice(commaIdx + 1).trim();
    if (tail) prepParts.push(tail);
  }

  // Tokenize and pull leading prep words ("finely chopped onion" -> prep="finely chopped").
  const tokens = head
    .toLowerCase()
    .replace(/[^a-z0-9\s\-/+]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const leadingPrep: string[] = [];
  while (tokens.length && PREP_KEYWORDS.has(tokens[0]!)) {
    leadingPrep.push(tokens.shift()!);
  }
  if (leadingPrep.length) prepParts.unshift(leadingPrep.join(" "));

  // Drop trailing prep words like "shredded".
  while (tokens.length && PREP_KEYWORDS.has(tokens[tokens.length - 1]!)) {
    prepParts.unshift(tokens.pop()!);
  }

  const cleaned = tokens.filter((t) => !STOPWORDS.has(t));
  const noun = cleaned.join(" ").trim();
  if (!noun) {
    return {
      canonical: rawName.toLowerCase().trim(),
      display: rawName.trim(),
      preparation: prepParts.length ? prepParts.join(", ") : null,
      isIndivisible: false,
    };
  }

  const singularized = singularize(noun);
  const aliasKey =
    ALIAS_MAP[noun] ?? ALIAS_MAP[singularized] ?? singularized;
  const known = KNOWN[aliasKey];

  return {
    canonical: aliasKey,
    display: known?.display ?? toTitleCase(aliasKey),
    preparation: prepParts.length ? prepParts.join(", ") : null,
    isIndivisible: known?.isIndivisible ?? false,
    aisle: known?.aisle,
    approxUnitWeightGrams: known?.approxUnitWeightGrams,
    perishable: known?.perishable,
  };
}

function singularize(word: string): string {
  if (word.length < 4) return word;
  // Multi-word: singularize only the last token.
  if (word.includes(" ")) {
    const parts = word.split(" ");
    parts[parts.length - 1] = singularize(parts[parts.length - 1]!);
    return parts.join(" ");
  }
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("ches") || word.endsWith("shes") || word.endsWith("xes"))
    return word.slice(0, -2);
  if (word.endsWith("oes") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us"))
    return word.slice(0, -1);
  return word;
}

function toTitleCase(s: string): string {
  return s
    .split(/(\s|-)/)
    .map((part, idx) =>
      part.match(/\s|-/) || idx > 0 && (part === "of" || part === "and")
        ? part
        : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join("");
}

export function aisleFor(canonical: string): CanonicalIngredient["aisle"] | undefined {
  const known = KNOWN[canonical];
  return known?.aisle;
}

export function isIndivisible(canonical: string): boolean {
  return KNOWN[canonical]?.isIndivisible ?? false;
}

export function approxUnitWeight(canonical: string): number | undefined {
  return KNOWN[canonical]?.approxUnitWeightGrams;
}

export function isPerishable(canonical: string): boolean {
  return KNOWN[canonical]?.perishable ?? false;
}

/**
 * Used by Phase 6 to seed the ingredient -> aisle table from this canonical
 * map. Returns every (canonical, aisle) pair for known ingredients.
 */
export function knownAisleEntries(): Array<{
  canonical: string;
  aisle: NonNullable<CanonicalIngredient["aisle"]>;
}> {
  return Object.entries(KNOWN)
    .filter(([, v]) => v.aisle)
    .map(([k, v]) => ({ canonical: k, aisle: v.aisle! }));
}
