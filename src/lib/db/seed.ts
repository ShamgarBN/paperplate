import type Database from "@tauri-apps/plugin-sql";

interface SeedCategory {
  kind: "cuisine" | "protein" | "type" | "effort" | "dietary";
  name: string;
}

const seedCategories: SeedCategory[] = [
  // Cuisine
  { kind: "cuisine", name: "Italian" },
  { kind: "cuisine", name: "Mexican" },
  { kind: "cuisine", name: "Asian - Chinese" },
  { kind: "cuisine", name: "Asian - Japanese" },
  { kind: "cuisine", name: "Asian - Thai" },
  { kind: "cuisine", name: "Asian - Korean" },
  { kind: "cuisine", name: "Asian - Vietnamese" },
  { kind: "cuisine", name: "Indian" },
  { kind: "cuisine", name: "Mediterranean" },
  { kind: "cuisine", name: "American" },
  { kind: "cuisine", name: "French" },
  { kind: "cuisine", name: "Middle Eastern" },
  { kind: "cuisine", name: "Other" },
  // Protein
  { kind: "protein", name: "Beef" },
  { kind: "protein", name: "Pork" },
  { kind: "protein", name: "Chicken" },
  { kind: "protein", name: "Turkey" },
  { kind: "protein", name: "Fish" },
  { kind: "protein", name: "Shellfish" },
  { kind: "protein", name: "Tofu / Tempeh" },
  { kind: "protein", name: "Beans / Legumes" },
  { kind: "protein", name: "Eggs" },
  { kind: "protein", name: "Vegetarian" },
  { kind: "protein", name: "Vegan" },
  { kind: "protein", name: "Other" },
  // Type
  { kind: "type", name: "Breakfast" },
  { kind: "type", name: "Soup / Stew" },
  { kind: "type", name: "Salad" },
  { kind: "type", name: "Pasta" },
  { kind: "type", name: "Sandwich" },
  { kind: "type", name: "Bowl" },
  { kind: "type", name: "Roast" },
  { kind: "type", name: "Curry" },
  { kind: "type", name: "Stir-fry" },
  { kind: "type", name: "Bake" },
  { kind: "type", name: "Grill" },
  { kind: "type", name: "One-pot" },
  { kind: "type", name: "Sheet pan" },
  { kind: "type", name: "Other" },
  // Effort
  { kind: "effort", name: "Quick (<30 min)" },
  { kind: "effort", name: "Medium (30-60 min)" },
  { kind: "effort", name: "Long (>60 min)" },
  // Dietary
  { kind: "dietary", name: "Vegetarian" },
  { kind: "dietary", name: "Vegan" },
  { kind: "dietary", name: "Gluten-free" },
  { kind: "dietary", name: "Dairy-free" },
  { kind: "dietary", name: "Low-carb" },
];

interface SeedAisle {
  name: string;
  sort_order: number;
}

const seedAisles: SeedAisle[] = [
  { name: "Produce", sort_order: 10 },
  { name: "Meat & Seafood", sort_order: 20 },
  { name: "Dairy & Eggs", sort_order: 30 },
  { name: "Bakery", sort_order: 40 },
  { name: "Pantry & Dry Goods", sort_order: 50 },
  { name: "Spices & Oils", sort_order: 60 },
  { name: "Frozen", sort_order: 70 },
  { name: "Beverages", sort_order: 80 },
  { name: "Other", sort_order: 90 },
];

export async function seedReferenceData(
  db: InstanceType<typeof Database>,
): Promise<void> {
  // Idempotent: relies on UNIQUE(kind, name) + INSERT OR IGNORE so that
  // existing user-edited categories are preserved while any newly-seeded
  // entries (e.g. "Breakfast" added in a later release) are topped up on
  // subsequent launches.
  for (let i = 0; i < seedCategories.length; i++) {
    const c = seedCategories[i]!;
    await db.execute(
      "INSERT OR IGNORE INTO categories (kind, name, sort_order) VALUES ($1, $2, $3)",
      [c.kind, c.name, i],
    );
  }
  for (const a of seedAisles) {
    await db.execute(
      "INSERT OR IGNORE INTO aisles (name, sort_order) VALUES ($1, $2)",
      [a.name, a.sort_order],
    );
  }
}
