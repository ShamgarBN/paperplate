import { isTauri } from "@/lib/runtime";
import { supabase } from "@/lib/supabase";

/**
 * Fetch a recipe page's raw HTML.
 *
 * Two backends, chosen at runtime:
 *
 *   - Tauri (macOS app): the Rust `fetch_recipe_html` command. Handles
 *     HTTPS, gzip/brotli, redirects, and a sensible UA string without
 *     CORS getting in the way.
 *   - Web (iPad PWA, browser preview): the `scrape-recipe` Supabase Edge
 *     Function. Same outbound HTTP work, just done on Deno instead of the
 *     local Rust binary. Returns `html`/`finalUrl`/`status`, which lets
 *     the client-side multi-tier extractor (`extractRecipe`) run unchanged.
 *
 * Either path produces the same `FetchedHtml` shape, so callers don't
 * need to branch.
 */

export interface FetchedHtml {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string | null;
  html: string;
}

export async function fetchRecipeHtml(url: string): Promise<FetchedHtml> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    const res = await invoke<{
      url: string;
      final_url: string;
      status: number;
      content_type: string | null;
      html: string;
    }>("fetch_recipe_html", { url });
    return {
      url: res.url,
      finalUrl: res.final_url,
      status: res.status,
      contentType: res.content_type,
      html: res.html,
    };
  }

  // Web fallback: call the edge function. It returns ok:true with html
  // even when the page had no extractable recipe (extraction is the
  // client's job in this path). Non-2xx upstreams come back as ok:false.
  const { data, error } = await supabase.functions.invoke("scrape-recipe", {
    body: { url },
  });
  if (error) {
    throw new Error(`scrape-recipe edge function failed: ${error.message}`);
  }
  const payload = data as {
    ok: boolean;
    status?: number;
    finalUrl?: string;
    contentType?: string | null;
    html?: string;
    reason?: string;
  } | null;
  if (!payload) {
    throw new Error("scrape-recipe returned an empty response.");
  }
  if (!payload.ok) {
    if (typeof payload.status === "number") {
      // Surface upstream HTTP status via a tagged error so ImportRoute's
      // friendlyHttpError regex picks it up.
      throw new Error(payload.reason ?? `HTTP ${payload.status}`);
    }
    throw new Error(payload.reason ?? "Could not fetch that URL.");
  }
  if (typeof payload.html !== "string") {
    throw new Error(
      "scrape-recipe is running an older deploy that didn't return HTML — redeploy supabase/functions/scrape-recipe.",
    );
  }
  return {
    url,
    finalUrl: payload.finalUrl ?? url,
    status: payload.status ?? 200,
    contentType: payload.contentType ?? null,
    html: payload.html,
  };
}
