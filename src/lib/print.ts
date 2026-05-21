import { invoke } from "@tauri-apps/api/core";

/**
 * Trigger the platform print dialog for the current Tauri window.
 *
 * Rationale: in a stock WKWebView (which Tauri uses on macOS) the plain
 * `window.print()` is a no-op — the call returns silently without surfacing
 * the system print panel. Routing the print request through a Rust command
 * that calls into the WebKit `printOperation` API actually opens the panel.
 *
 * We still fall back to `window.print()` when the invoke fails (e.g. running
 * outside Tauri during `vite dev`) so the same button works in the browser
 * preview without bespoke handling.
 */
export async function printCurrentWindow(): Promise<void> {
  try {
    await invoke("print_current_window");
  } catch (err) {
    // Browser preview path (no Tauri runtime) — also useful as a safety net
    // if the Rust command isn't registered on an older build.
    if (typeof window !== "undefined" && typeof window.print === "function") {
      window.print();
      return;
    }
    throw err;
  }
}
