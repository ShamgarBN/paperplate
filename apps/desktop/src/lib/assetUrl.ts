import { convertFileSrc } from "@tauri-apps/api/core";
import { appLocalDataDir, join } from "@tauri-apps/api/path";

let appLocalDir: string | null = null;

/**
 * Resolve a recipe's `image_path` value to a URL the WebView can render.
 *
 * Two flavours are supported now that data lives in Supabase:
 *   1. `http(s)://...` — Storage-hosted images (the new normal after the
 *      hero-image backfill). Returned verbatim.
 *   2. Legacy relative paths like `images/<hash>.<ext>` — pre-Supabase
 *      local files in the Tauri app-data directory. Resolved via the
 *      `convertFileSrc` asset protocol. Will resolve to a broken URL on
 *      this machine after the swap, but kept for backwards compatibility
 *      with any rows we haven't backfilled yet.
 */
export async function localImageUrl(
  relativePath: string | null,
): Promise<string | null> {
  if (!relativePath) return null;
  if (
    relativePath.startsWith("http://") ||
    relativePath.startsWith("https://")
  ) {
    return relativePath;
  }
  if (!appLocalDir) {
    try {
      appLocalDir = await appLocalDataDir();
    } catch {
      return null;
    }
  }
  const absolute = await join(appLocalDir, relativePath);
  return convertFileSrc(absolute);
}
