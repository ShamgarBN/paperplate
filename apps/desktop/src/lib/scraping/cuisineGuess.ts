// Best-effort heuristic to map a free-form `recipeCuisine` string from
// schema.org metadata to one of our seeded cuisine category names.

const MAP: Record<string, string> = {
  italian: "Italian",
  mexican: "Mexican",
  chinese: "Asian - Chinese",
  cantonese: "Asian - Chinese",
  szechuan: "Asian - Chinese",
  sichuan: "Asian - Chinese",
  hong: "Asian - Chinese",
  japanese: "Asian - Japanese",
  thai: "Asian - Thai",
  korean: "Asian - Korean",
  vietnamese: "Asian - Vietnamese",
  indian: "Indian",
  punjabi: "Indian",
  "south indian": "Indian",
  mediterranean: "Mediterranean",
  greek: "Mediterranean",
  spanish: "Mediterranean",
  american: "American",
  southern: "American",
  cajun: "American",
  bbq: "American",
  french: "French",
  middle: "Middle Eastern",
  lebanese: "Middle Eastern",
  turkish: "Middle Eastern",
  moroccan: "Middle Eastern",
  persian: "Middle Eastern",
  iranian: "Middle Eastern",
  asian: "Asian - Chinese",
};

export function guessCuisineCategoryName(value: string | null | undefined):
  | string
  | null {
  if (!value) return null;
  const lower = value.toLowerCase().trim();
  for (const key of Object.keys(MAP)) {
    if (lower.includes(key)) return MAP[key]!;
  }
  return null;
}
