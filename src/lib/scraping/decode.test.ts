import { describe, it, expect } from "vitest";
import { decodeHtmlEntities } from "@/lib/scraping/decode";

describe("decodeHtmlEntities", () => {
  it("returns short-circuited input when there are no entities", () => {
    const input = "plain text with no entities";
    expect(decodeHtmlEntities(input)).toBe(input);
  });

  it("decodes the apostrophe entity that motivated this work", () => {
    // The user's report: "They&#039;re" should be rendered as "They're".
    expect(decodeHtmlEntities("They&#039;re delicious")).toBe(
      "They're delicious",
    );
  });

  it("decodes hex numeric entities", () => {
    expect(decodeHtmlEntities("It&#x27;s &#x2014; an em dash")).toBe(
      "It's \u2014 an em dash",
    );
  });

  it("decodes the standard named entities", () => {
    expect(decodeHtmlEntities("M&amp;Ms &quot;in season&quot;")).toBe(
      'M&Ms "in season"',
    );
    expect(decodeHtmlEntities("a &lt; b &gt; c")).toBe("a < b > c");
    expect(decodeHtmlEntities("non&nbsp;breaking")).toBe(
      "non\u00A0breaking",
    );
  });

  it("decodes smart quotes and en/em dashes", () => {
    expect(decodeHtmlEntities("&ldquo;recipe&rdquo; &mdash; from Mom")).toBe(
      "\u201Crecipe\u201D \u2014 from Mom",
    );
  });

  it("is idempotent (safe to call twice)", () => {
    const once = decodeHtmlEntities("They&#039;re great");
    const twice = decodeHtmlEntities(once);
    expect(twice).toBe(once);
  });

  it("falls back to DOMParser for unknown named entities", () => {
    // `&aacute;` isn't in our hand-rolled map but the DOM fallback knows
    // it. We assert via the resulting Unicode codepoint so the test
    // doesn't depend on whitespace handling.
    const out = decodeHtmlEntities("caf&aacute;");
    expect(out.endsWith("\u00E1")).toBe(true);
  });

  it("leaves malformed entities alone instead of crashing", () => {
    // Stray ampersand or incomplete entity should pass through. We don't
    // try to "guess" what the author meant.
    expect(decodeHtmlEntities("Tom & Jerry")).toBe("Tom & Jerry");
    expect(decodeHtmlEntities("M&Ms in a sentence")).toBe(
      "M&Ms in a sentence",
    );
  });
});
