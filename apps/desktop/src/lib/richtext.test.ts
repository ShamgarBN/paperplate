/**
 * Sanitizer is the only thing standing between our DB and an XSS
 * payload landing on the recipe page. These tests pin the allow/deny
 * behavior so we notice if DOMPurify config drifts.
 */
import { describe, expect, it } from "vitest";
import {
  isRichTextEmpty,
  looksLikeRichText,
  plainTextToHtml,
  sanitizeStepHtml,
  stripRichText,
  toRenderableHtml,
} from "./richtext";

describe("sanitizeStepHtml", () => {
  it("keeps bold / italic / underline", () => {
    expect(sanitizeStepHtml("<b>Hi</b> <i>there</i> <u>you</u>")).toBe(
      "<b>Hi</b> <i>there</i> <u>you</u>",
    );
  });

  it("keeps allowed palette class on span", () => {
    expect(
      sanitizeStepHtml('<span class="rt-color-red">Hot</span>'),
    ).toBe('<span class="rt-color-red">Hot</span>');
  });

  it("strips disallowed classes on span", () => {
    const out = sanitizeStepHtml(
      '<span class="rt-color-red rt-mystery evil">Hot</span>',
    );
    expect(out).toBe('<span class="rt-color-red">Hot</span>');
  });

  it("removes script tags entirely", () => {
    const out = sanitizeStepHtml("Heat<script>alert(1)</script> the oven");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert(1)");
    expect(out).toContain("Heat");
    expect(out).toContain("the oven");
  });

  it("strips event handlers", () => {
    const out = sanitizeStepHtml('<b onclick="alert(1)">Click</b>');
    expect(out).not.toContain("onclick");
    expect(out).toContain("<b>Click</b>");
  });

  it("strips inline styles", () => {
    const out = sanitizeStepHtml(
      '<span style="color: red; background: url(javascript:alert(1))">x</span>',
    );
    expect(out).not.toContain("style=");
    expect(out).not.toContain("javascript:");
  });

  it("strips anchors and images", () => {
    const out = sanitizeStepHtml(
      '<a href="javascript:alert(1)">click</a><img src=x onerror=alert(1)>',
    );
    expect(out).not.toMatch(/<a\b/);
    expect(out).not.toMatch(/<img\b/);
    expect(out).not.toContain("alert(1)");
  });

  it("allows br tags for line breaks", () => {
    expect(sanitizeStepHtml("Line one<br>Line two")).toBe(
      "Line one<br>Line two",
    );
  });
});

describe("plainTextToHtml", () => {
  it("escapes special characters", () => {
    expect(plainTextToHtml("<script>")).toBe("&lt;script&gt;");
    expect(plainTextToHtml('he said "hi" & left')).toBe(
      "he said &quot;hi&quot; &amp; left",
    );
  });

  it("converts newlines to <br>", () => {
    expect(plainTextToHtml("one\ntwo\r\nthree")).toBe("one<br>two<br>three");
  });
});

describe("looksLikeRichText", () => {
  it("returns true for content with allowed tags", () => {
    expect(looksLikeRichText("Heat <b>oven</b>")).toBe(true);
    expect(looksLikeRichText("Step<br>after step")).toBe(true);
  });

  it("returns false for plain text", () => {
    expect(looksLikeRichText("Heat the oven to 350F.")).toBe(false);
    expect(looksLikeRichText("Use 1 < 2 cups")).toBe(false);
  });
});

describe("toRenderableHtml", () => {
  it("escapes legacy plain-text and preserves newlines", () => {
    expect(toRenderableHtml("Use 1 < 2 cups\nthen stir")).toBe(
      "Use 1 &lt; 2 cups<br>then stir",
    );
  });

  it("sanitizes existing HTML", () => {
    expect(
      toRenderableHtml('<b>Bold</b><script>alert(1)</script>'),
    ).toBe("<b>Bold</b>");
  });

  it("does not double-escape content that already contains entities", () => {
    expect(toRenderableHtml("Use 1 &lt; 2 cups.!")).toBe(
      "Use 1 &lt; 2 cups.!",
    );
  });
});

describe("stripRichText", () => {
  it("returns plain text unchanged", () => {
    expect(stripRichText("Heat oven to 350")).toBe("Heat oven to 350");
  });

  it("removes tags but keeps text", () => {
    expect(stripRichText("Heat <b>oven</b> to 350")).toBe(
      "Heat oven to 350",
    );
  });

  it("converts br to newline", () => {
    expect(stripRichText("one<br>two")).toBe("one\ntwo");
  });
});

describe("isRichTextEmpty", () => {
  it("treats empty string as empty", () => {
    expect(isRichTextEmpty("")).toBe(true);
  });

  it("treats whitespace-only HTML as empty", () => {
    expect(isRichTextEmpty("<b>  </b><br>")).toBe(true);
  });

  it("treats a lone <br> (browser-emitted placeholder) as empty", () => {
    expect(isRichTextEmpty("<br>")).toBe(true);
  });

  it("treats real content as not empty", () => {
    expect(isRichTextEmpty("<b>Hi</b>")).toBe(false);
  });
});
