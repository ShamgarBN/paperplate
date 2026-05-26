import { isTauri } from "@/lib/runtime";

let appLocalDir: string | null = null;

/**
 * Resolve a recipe's `image_path` value to a URL the WebView can render.
 *
 * After the Supabase migration every newly-stored image is a full
 * `https://…supabase.co/storage/v1/object/public/recipe-images/…` URL,
 * which we just hand back verbatim.
 *
 * The pre-Supabase 1.x rows stored relative paths like
 * `images/<hash>.<ext>` pointing at the Tauri app-data dir. We resolve
 * those via `convertFileSrc` inside Tauri; on the web there's no local
 * filesystem to read from, so we return null and the caller falls back
 * to its placeholder treatment.
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
  if (!isTauri()) {
    // Legacy local-disk path with no Tauri runtime to read it. Nothing
    // we can do from a browser.
    return null;
  }
  const [{ convertFileSrc }, { appLocalDataDir, join }] = await Promise.all([
    import("@tauri-apps/api/core"),
    import("@tauri-apps/api/path"),
  ]);
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
