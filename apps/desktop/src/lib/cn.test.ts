import { describe, expect, it } from "vitest";
import { cn } from "@/lib/cn";

describe("cn", () => {
  it("merges tailwind classes and dedupes conflicts", () => {
    expect(cn("p-2", "p-4", "text-sm")).toBe("p-4 text-sm");
  });

  it("handles falsey values", () => {
    expect(cn("a", false && "b", null, undefined, "c")).toBe("a c");
  });
});
