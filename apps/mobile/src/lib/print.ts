/**
 * Cross-platform print helper.
 *
 * On web (the PWA build) we open a clean popup with our own HTML and let
 * the browser handle the print sheet. On native (Expo Go / EAS builds) we
 * hand the same HTML to expo-print, which surfaces the iOS share sheet
 * with AirPrint as an option.
 *
 * Building our own HTML side-steps the React Native Web render — RN's
 * inline styles don't translate well to `@media print` rules, and the
 * tab bar + action buttons would need separate hide logic. A standalone
 * HTML doc is simpler and looks better on paper.
 */
import { Platform } from "react-native";
import * as Print from "expo-print";

export async function printHtml(html: string, _jobTitle?: string) {
  if (Platform.OS === "web") {
    const win = window.open("", "_blank", "width=900,height=1200");
    if (!win) {
      // Pop-up blocker; we can't do much here.
      console.warn("Could not open print window (pop-up blocked?)");
      return;
    }
    win.document.write(html);
    win.document.close();
    // Wait a tick so images can start loading before we trigger the
    // dialog — the browser will hold the dialog until they finish.
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch (e) {
        console.warn("print() failed", e);
      }
    }, 250);
    return;
  }
  // Native: expo-print surfaces the iOS share sheet (AirPrint, PDF, etc.).
  try {
    await Print.printAsync({ html });
  } catch (e) {
    console.warn("expo-print failed", e);
  }
}

// ----- Recipe -----

interface RecipeForPrint {
  title: string;
  description: string | null;
  base_servings: number;
  preferred_servings: number | null;
  total_min: number | null;
  source_url: string | null;
  notes: string | null;
  image_path: string | null;
}

interface IngredientForPrint {
  raw_text: string;
  item_display: string;
  quantity: number | null;
  unit: string | null;
  is_optional: boolean;
  section_name: string | null;
}

interface StepForPrint {
  position: number;
  text: string;
  section_name: string | null;
}

export function recipePrintHtml(
  recipe: RecipeForPrint,
  ingredients: IngredientForPrint[],
  steps: StepForPrint[],
  scaleFactor: number,
  effectiveServings: number,
): string {
  const ingredientHtml = groupBySection(ingredients)
    .map(([section, list]) => {
      const items = list
        .map(
          (it) =>
            `<li>${escapeHtml(formatScaled(it, scaleFactor))}${
              it.is_optional ? ' <em style="color:#777">(optional)</em>' : ""
            }</li>`,
        )
        .join("");
      return section
        ? `<h3 class="subsection">${escapeHtml(section)}</h3><ul>${items}</ul>`
        : `<ul>${items}</ul>`;
    })
    .join("");

  const stepHtml = groupBySection(steps)
    .map(([section, list]) => {
      const items = list
        .map((s) => `<li>${escapeHtml(s.text)}</li>`)
        .join("");
      return section
        ? `<h3 class="subsection">${escapeHtml(section)}</h3><ol>${items}</ol>`
        : `<ol>${items}</ol>`;
    })
    .join("");

  const heroImg =
    recipe.image_path && /^https?:\/\//.test(recipe.image_path)
      ? `<img src="${escapeAttr(recipe.image_path)}" class="hero" alt="" />`
      : "";

  return baseHtml(recipe.title, `
    ${heroImg}
    <h1>${escapeHtml(recipe.title)}</h1>
    <p class="meta">
      Serves ${effectiveServings}${recipe.total_min ? ` · ${recipe.total_min} min` : ""}
    </p>
    ${recipe.description ? `<p class="desc">${escapeHtml(recipe.description)}</p>` : ""}
    <h2>Ingredients</h2>
    ${ingredientHtml}
    <h2>Steps</h2>
    ${stepHtml}
    ${recipe.notes ? `<h2>Notes</h2><p class="notes">${escapeHtml(recipe.notes)}</p>` : ""}
    ${recipe.source_url ? `<p class="source">Source: ${escapeHtml(recipe.source_url)}</p>` : ""}
  `);
}

// ----- Shopping list -----

interface ShoppingItemForPrint {
  name: string;
  quantity: string | null;
  isOptional: boolean;
}

interface AisleGroupForPrint {
  aisle: string;
  items: ShoppingItemForPrint[];
}

export function shoppingListPrintHtml(
  title: string,
  groups: AisleGroupForPrint[],
): string {
  const body = groups
    .map(
      (g) => `
    <h2>${escapeHtml(g.aisle)}</h2>
    <ul class="checklist">
      ${g.items
        .map(
          (it) => `
        <li>
          <span class="box">&#9744;</span>
          ${escapeHtml(it.name)}${
            it.quantity ? ` <span class="qty">— ${escapeHtml(it.quantity)}</span>` : ""
          }${it.isOptional ? ' <em style="color:#777">(optional)</em>' : ""}
        </li>`,
        )
        .join("")}
    </ul>`,
    )
    .join("");

  return baseHtml(title, `
    <h1>${escapeHtml(title)}</h1>
    ${body}
  `);
}

// ----- helpers -----

function baseHtml(pageTitle: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(pageTitle)}</title>
  <style>
    @page { margin: 0.6in; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      color: #000;
      max-width: 7in;
      margin: 0 auto;
      line-height: 1.45;
    }
    h1 {
      font-size: 26pt;
      margin: 0 0 4pt;
      font-family: Georgia, "Times New Roman", serif;
    }
    h2 {
      font-size: 14pt;
      margin: 18pt 0 6pt;
      border-bottom: 1pt solid #333;
      padding-bottom: 2pt;
    }
    h3.subsection {
      font-size: 12pt;
      margin: 10pt 0 4pt;
      color: #555;
    }
    .meta {
      font-size: 11pt;
      color: #555;
      margin: 0 0 8pt;
    }
    .desc {
      font-style: italic;
      color: #444;
      margin: 0 0 12pt;
    }
    .hero {
      max-width: 100%;
      max-height: 3in;
      object-fit: cover;
      border-radius: 6pt;
      margin: 0 0 12pt;
    }
    ul, ol { margin: 0 0 8pt 18pt; padding: 0; }
    li { margin: 2pt 0; font-size: 11pt; }
    .checklist { list-style: none; margin-left: 0; }
    .checklist li { padding: 2pt 0; }
    .box { display: inline-block; width: 14pt; font-size: 13pt; }
    .qty { color: #555; font-size: 10pt; }
    .notes { font-size: 11pt; }
    .source { font-size: 9pt; color: #777; margin-top: 16pt; word-break: break-all; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

function groupBySection<T extends { section_name: string | null }>(
  rows: T[],
): Array<[string | null, T[]]> {
  const groups = new Map<string | null, T[]>();
  for (const r of rows) {
    const key = r.section_name && r.section_name.length > 0 ? r.section_name : null;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  return Array.from(groups.entries());
}

function formatScaled(it: IngredientForPrint, factor: number): string {
  if (it.quantity != null) {
    const scaled = it.quantity * factor;
    const qtyStr = formatNumber(scaled);
    const unit = it.unit ? ` ${it.unit}` : "";
    return `${qtyStr}${unit} ${it.item_display}`;
  }
  return it.raw_text && it.raw_text.trim().length > 0
    ? it.raw_text
    : it.item_display;
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 100) / 100);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
