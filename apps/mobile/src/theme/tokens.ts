/**
 * Mobile theme tokens — translated from the desktop's HSL CSS variables
 * (apps/desktop/src/styles/globals.css). Mobile uses StyleSheet which
 * needs concrete hex values, so we precompute them here and ship the
 * same palette across both clients.
 *
 * Light theme is the source of truth; dark theme values are kept in
 * shape for when we wire up Appearance-based switching.
 */

const light = {
  bg: "#faf8f5",
  fg: "#2d221b",
  card: "#ffffff",
  cardFg: "#2d221b",
  primary: "#d14b1a",
  primaryFg: "#faf8f5",
  secondary: "#eeebe7",
  secondaryFg: "#2d221b",
  muted: "#eeebe7",
  mutedFg: "#78695e",
  accent: "#ebe7e0",
  accentFg: "#2d221b",
  destructive: "#d11a1a",
  destructiveFg: "#faf8f5",
  border: "#e0dbd6",
  ring: "#d14b1a",
} as const;

const dark = {
  bg: "#1b1613",
  fg: "#eeebe7",
  card: "#231e1a",
  cardFg: "#eeebe7",
  primary: "#ea6c3e",
  primaryFg: "#1b1613",
  secondary: "#332d28",
  secondaryFg: "#eeebe7",
  muted: "#332d28",
  mutedFg: "#aca59a",
  accent: "#3f3731",
  accentFg: "#eeebe7",
  destructive: "#dd4040",
  destructiveFg: "#1b1613",
  border: "#3f3731",
  ring: "#ea6c3e",
} as const;

export type Palette = typeof light;

// For now the mobile app is light-only. Wired up so a future Appearance
// listener can swap by re-exporting `dark` instead.
export const colors: Palette = light;

// Kept around so the future dark-mode flip is just an import change.
export const lightColors = light;
export const darkColors = dark;

/**
 * Font family tokens. Loaded via @expo-google-fonts in App.tsx. Names
 * match the package's exported keys so styles can reference them
 * directly. When fonts haven't loaded yet, the app shows a splash, so
 * components never render against missing typefaces.
 */
export const fonts = {
  /** Body, UI labels, captions. Inter. */
  sans: "Inter_400Regular",
  sansMedium: "Inter_500Medium",
  sansSemibold: "Inter_600SemiBold",
  sansBold: "Inter_700Bold",
  /** Page titles, recipe titles, headings. Fraunces. */
  display: "Fraunces_500Medium",
  displayBold: "Fraunces_700Bold",
} as const;

/**
 * Border radii — match the desktop's --radius (0.75rem = 12px) and the
 * sm / md derivations.
 */
export const radii = {
  sm: 8,
  md: 10,
  lg: 12,
  xl: 16,
  pill: 9999,
} as const;

export const spacing = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
} as const;
