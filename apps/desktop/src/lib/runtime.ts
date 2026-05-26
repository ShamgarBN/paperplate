/**
 * Runtime environment detection.
 *
 * The same React/Vite bundle ships two ways:
 *   - inside a Tauri WebView (the macOS app) — has access to Rust commands
 *     via `@tauri-apps/api`
 *   - as a vanilla web bundle (the iPad PWA, dev preview) — no Tauri APIs;
 *     anything Tauri-specific must take an alternate path
 *
 * Tauri 2 injects `window.__TAURI_INTERNALS__` (and `window.__TAURI__` on
 * older builds). Either is a reliable smoke test that doesn't require a
 * dynamic import.
 */
export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.__TAURI_INTERNALS__ ?? w.__TAURI__);
}
