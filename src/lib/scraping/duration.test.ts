import { describe, expect, it } from "vitest";
import { parseDurationMinutes } from "@/lib/scraping/duration";

describe("parseDurationMinutes", () => {
  it("parses ISO durations", () => {
    expect(parseDurationMinutes("PT1H30M")).toBe(90);
    expect(parseDurationMinutes("PT45M")).toBe(45);
    expect(parseDurationMinutes("PT2H")).toBe(120);
    expect(parseDurationMinutes("PT0S")).toBe(null);
  });

  it("parses free-form durations", () => {
    expect(parseDurationMinutes("1 hour 30 minutes")).toBe(90);
    expect(parseDurationMinutes("45 mins")).toBe(45);
    expect(parseDurationMinutes("2h")).toBe(120);
    expect(parseDurationMinutes("90")).toBe(90);
  });

  it("returns null for nonsense", () => {
    expect(parseDurationMinutes("")).toBeNull();
    expect(parseDurationMinutes("approximately")).toBeNull();
    expect(parseDurationMinutes(undefined)).toBeNull();
  });
});
