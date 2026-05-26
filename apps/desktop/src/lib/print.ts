import { isTauri } from "@/lib/runtime";

/**
 * Trigger the platform print dialog for the current window.
 *
 * Inside Tauri: the stock WKWebView treats `window.print()` as a no-op,
 * so we route through a Rust command that drives WebKit's
 * `printOperation` API to actually surface the system print panel.
 *
 * On the web (iPad PWA, browser preview, Safari "Print" from the share
 * sheet): plain `window.print()` does the right thing — Safari prints the
 * current document.
 */
export async function printCurrentWindow(): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      await invoke("print_current_window");
      return;
    } catch {
      // Fall through to window.print() if the Rust command isn't
      // registered on an older bundle.
    }
  }
  if (typeof window !== "undefined" && typeof window.print === "function") {
    window.print();
  }
}
