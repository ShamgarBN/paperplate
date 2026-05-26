import { invoke } from "@tauri-apps/api/core";

/**
 * Thin JS wrapper around the Tauri `fetch_recipe_html` Rust command.
 *
 * The Tauri side handles HTTPS fetches that the WebView itself can't make
 * (CORS), gzip/brotli decoding, redirects, and a sensible UA string. The
 * result is the page HTML, which `extractRecipe()` then parses into a
 * structured recipe via JSON-LD → microdata → site-profile tiers.
 *
 * Image upload + local-cache writes used to live alongside this; those
 * moved to `@/lib/uploadImage` once we swapped the data layer for
 * Supabase Storage.
 */

export interface FetchedHtml {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string | null;
  html: string;
}

export async function fetchRecipeHtml(url: string): Promise<FetchedHtml> {
  return invoke<{
    url: string;
    final_url: string;
    status: number;
    content_type: string | null;
    html: string;
  }>("fetch_recipe_html", { url }).then((res) => ({
    url: res.url,
    finalUrl: res.final_url,
    status: res.status,
    contentType: res.content_type,
    html: res.html,
  }));
}
