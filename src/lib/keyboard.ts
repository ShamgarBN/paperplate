import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

/**
 * Global keyboard shortcuts. Bindings:
 *   ⌘N / Ctrl+N    — Add recipe
 *   ⌘K / Ctrl+K    — Focus the global search input
 *   ⌘1             — Library
 *   ⌘2             — Meal plans
 *   ⌘, / Ctrl+,    — Settings
 */
export function useGlobalShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isInput =
        tag === "input" ||
        tag === "textarea" ||
        target?.isContentEditable;

      if (e.key.toLowerCase() === "n" && !isInput && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        navigate({ to: "/import" });
        return;
      }
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        const search = document.querySelector<HTMLInputElement>(
          'input[placeholder*="Search recipes"]',
        );
        search?.focus();
        return;
      }
      if (e.key === ",") {
        e.preventDefault();
        navigate({ to: "/settings" });
        return;
      }
      if (e.key === "1" && !isInput) {
        e.preventDefault();
        navigate({ to: "/library" });
      } else if (e.key === "2" && !isInput) {
        e.preventDefault();
        navigate({ to: "/plans" });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);
}
