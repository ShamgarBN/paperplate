import { useEffect } from "react";
import { useSettingsStore } from "@/store/settingsStore";

/**
 * Applies the user's accent hue to the --primary and --ring CSS variables.
 * Saturation and lightness are pinned to keep contrast comfortable in both
 * light and dark themes.
 */
export function AccentApplier() {
  const accentHue = useSettingsStore((s) => s.accentHue);

  useEffect(() => {
    const root = document.documentElement;
    const sat = 78;
    const lightLight = 46;
    const darkLight = 58;
    const isDark = root.classList.contains("dark");
    const lightness = isDark ? darkLight : lightLight;
    const value = `${accentHue} ${sat}% ${lightness}%`;
    root.style.setProperty("--primary", value);
    root.style.setProperty("--ring", value);
  }, [accentHue]);

  // Re-apply when theme class changes.
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      const isDark = root.classList.contains("dark");
      const sat = 78;
      const lightness = isDark ? 58 : 46;
      const value = `${accentHue} ${sat}% ${lightness}%`;
      root.style.setProperty("--primary", value);
      root.style.setProperty("--ring", value);
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [accentHue]);

  return null;
}
