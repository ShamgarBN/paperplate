/**
 * Rich-text helpers for recipe step instructions.
 *
 * Surface area is intentionally tiny: bold / italic / underline plus a
 * fixed 8-color palette applied via class names. We persist sanitized
 * HTML in `recipe_steps.text` (legacy plain-text rows stay readable
 * because none of them contain HTML tags).
 *
 * Security model:
 *   - `sanitizeStepHtml` is the single gate every render path must use.
 *   - The allowlist below intentionally excludes anchors, images,
 *     iframes, scripts, event handlers, styles, ids, and data-* attrs.
 *   - We never call `dangerouslySetInnerHTML` with anything that
 *     hasn't gone through this function (or with anything from a
 *     non-trusted source — all stored HTML originated inside our own
 *     editor or our scraper-to-HTML normalizer).
 */
import DOMPurify, { type Config as DOMPurifyConfig } from "dompurify";

export type RichTextColor =
  | "default"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "teal"
  | "blue"
  | "purple"
  | "pink";

/**
 * Preset palette. Hex values are the *light-mode* swatch; the matching
 * CSS class in `index.css` overrides for dark mode so contrast stays
 * legible. Hex is what we surface in the toolbar; class is what we
 * persist in HTML.
 */
export const RICH_TEXT_PALETTE: ReadonlyArray<{
  id: RichTextColor;
  label: string;
  swatch: string;
  className: string | null;
}> = [
  { id: "default", label: "Default", swatch: "currentColor", className: null },
  { id: "red", label: "Red", swatch: "#c0392b", className: "rt-color-red" },
  {
    id: "orange",
    label: "Orange",
    swatch: "#d97706",
    className: "rt-color-orange",
  },
  {
    id: "yellow",
    label: "Yellow",
    swatch: "#ca8a04",
    className: "rt-color-yellow",
  },
  {
    id: "green",
    label: "Green",
    swatch: "#16a34a",
    className: "rt-color-green",
  },
  { id: "teal", label: "Teal", swatch: "#0d9488", className: "rt-color-teal" },
  { id: "blue", label: "Blue", swatch: "#2563eb", className: "rt-color-blue" },
  {
    id: "purple",
    label: "Purple",
    swatch: "#7c3aed",
    className: "rt-color-purple",
  },
  { id: "pink", label: "Pink", swatch: "#db2777", className: "rt-color-pink" },
];

const ALLOWED_CLASSES = new Set(
  RICH_TEXT_PALETTE.map((c) => c.className).filter(
    (c): c is string => c !== null,
  ),
);

const PURIFY_CONFIG: DOMPurifyConfig = {
  ALLOWED_TAGS: ["b", "strong", "i", "em", "u", "span", "br"],
  ALLOWED_ATTR: ["class"],
  FORBID_ATTR: [
    "style",
    "id",
    "onclick",
    "onerror",
    "onload",
    "onmouseover",
    "onfocus",
    "onblur",
  ],
  KEEP_CONTENT: true,
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
};

let hookInstalled = false;

/**
 * Install a DOMPurify hook that strips any `class` value not in our
 * palette allowlist. Runs once per page; subsequent calls are no-ops.
 */
function ensureHook() {
  if (hookInstalled) return;
  hookInstalled = true;
  DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
    if (data.attrName !== "class") return;
    const classes = data.attrValue
      .split(/\s+/)
      .filter((c) => ALLOWED_CLASSES.has(c));
    if (classes.length === 0) {
      data.keepAttr = false;
      return;
    }
    data.attrValue = classes.join(" ");
  });
}

/**
 * Sanitize HTML coming out of the editor (or coming in from storage)
 * before letting it touch the DOM via `dangerouslySetInnerHTML`. This
 * is the only place HTML flows past the React escaping wall — every
 * caller must use this function.
 */
export function sanitizeStepHtml(html: string): string {
  ensureHook();
  return DOMPurify.sanitize(html, {
    ...PURIFY_CONFIG,
    RETURN_TRUSTED_TYPE: false,
  }) as string;
}

/**
 * Escape a plain-text string into HTML-safe text. Newlines become
 * `<br>` because step text legacy rows sometimes contain embedded
 * newlines and we want them to render visibly.
 */
export function plainTextToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  return escaped.replace(/\r?\n/g, "<br>");
}

/**
 * Heuristic: does this string look like rich-text HTML we previously
 * produced, or like a legacy plain-text step?
 *
 * Two signals count as "this is HTML, don't re-escape":
 *   1. Any of our allowed tags is present.
 *   2. Any of the entities our own escape function emits is present
 *      (e.g. `&lt;`, `&amp;`). This catches the case where the user
 *      typed into the editor — the resulting serialized HTML has no
 *      tags but does have entities, and we must not double-encode it
 *      on the next render.
 *
 * If you write something with a literal `&amp;` in your scraper plain
 * text and never edit it, we'll render it as `&` instead of the
 * literal six characters. That's HTML doing its job and is the
 * accepted trade-off.
 */
export function looksLikeRichText(value: string): boolean {
  if (/<(b|strong|i|em|u|span|br)\b/i.test(value)) return true;
  if (/&(?:amp|lt|gt|quot|#39|nbsp);/i.test(value)) return true;
  return false;
}

/**
 * Convert any stored value (HTML or legacy plain text) to safe HTML
 * suitable for `dangerouslySetInnerHTML`.
 */
export function toRenderableHtml(value: string): string {
  if (!value) return "";
  const html = looksLikeRichText(value) ? value : plainTextToHtml(value);
  return sanitizeStepHtml(html);
}

/**
 * Extract plain text from a possibly-HTML stored value. Used for
 * places like search, scraper roundtrips, and shopping-list displays
 * where the formatting would be noise. Browser-only (uses DOMParser).
 */
export function stripRichText(value: string): string {
  if (!value) return "";
  if (!looksLikeRichText(value)) return value;
  // Normalize line breaks first so DOMParser doesn't collapse them
  // into nothing — textContent on a <br> node is the empty string.
  const withNewlines = value.replace(/<br\s*\/?>/gi, "\n");
  if (typeof window === "undefined" || !window.DOMParser) {
    return withNewlines
      .replace(/<\/?[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
  const doc = new DOMParser().parseFromString(
    `<root>${withNewlines}</root>`,
    "text/html",
  );
  return doc.body.textContent ?? "";
}

/**
 * True if the stored value is effectively empty (no text content).
 * Used by the editor to render placeholders and by validation to
 * decide whether a step should be saved.
 */
export function isRichTextEmpty(value: string): boolean {
  return stripRichText(value).trim().length === 0;
}
