import { invoke } from "@tauri-apps/api/core";

export interface FetchedHtml {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string | null;
  html: string;
}

export interface DownloadedImage {
  absolutePath: string;
  relativePath: string;
  byteSize: number;
  contentType: string | null;
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

export async function downloadImage(url: string): Promise<DownloadedImage> {
  return invoke<{
    absolute_path: string;
    relative_path: string;
    byte_size: number;
    content_type: string | null;
  }>("download_image", { url }).then((res) => ({
    absolutePath: res.absolute_path,
    relativePath: res.relative_path,
    byteSize: res.byte_size,
    contentType: res.content_type,
  }));
}

/**
 * Persist a locally-sourced image (drag-and-drop or file picker) into the
 * same cached `images/` directory the scraper writes to. The browser hands
 * us a `File`; we convert it to a byte array and let Rust do the hashing,
 * extension sniffing, and disk write. Accepts only the same MIME types the
 * scrape path accepts; anything else is rejected client-side first so we
 * don't even send the IPC.
 */
const ACCEPTED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

/**
 * Per-file size cap kept in sync with the Rust-side MAX_IMAGE_BYTES (8 MiB).
 * We pre-check on the JS side so the user gets immediate feedback rather
 * than waiting for the IPC round trip to error.
 */
const MAX_LOCAL_IMAGE_BYTES = 8 * 1024 * 1024;

export async function saveLocalImage(file: File): Promise<DownloadedImage> {
  if (!ACCEPTED_IMAGE_MIME.has(file.type)) {
    throw new Error(
      `Unsupported image type "${file.type || "unknown"}". Use JPG, PNG, WebP, GIF, or AVIF.`,
    );
  }
  if (file.size <= 0) {
    throw new Error("File is empty.");
  }
  if (file.size > MAX_LOCAL_IMAGE_BYTES) {
    throw new Error(
      `Image is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Max is 8 MB.`,
    );
  }
  const buffer = await file.arrayBuffer();
  // Tauri's IPC bridge serialises `Uint8Array` as a Vec<u8> on the Rust side.
  // We strip the ArrayBuffer indirection so the host sees raw bytes only —
  // no JSON-encoded indices or numeric overhead.
  const bytes = Array.from(new Uint8Array(buffer));
  return invoke<{
    absolute_path: string;
    relative_path: string;
    byte_size: number;
    content_type: string | null;
  }>("save_local_image", { bytes, contentType: file.type }).then((res) => ({
    absolutePath: res.absolute_path,
    relativePath: res.relative_path,
    byteSize: res.byte_size,
    contentType: res.content_type,
  }));
}

/**
 * Persist an image dropped via Tauri's native drag-and-drop API, which
 * gives us a file system path rather than browser-readable bytes. The
 * Rust side opens the file, validates the extension and size, then runs
 * it through the same hashing pipeline as the byte-array entry point.
 *
 * Used by the recipe editor's drop zone — the OS hands the file path to
 * Tauri *before* the webview sees any HTML5 drag event, so this is the
 * only reliable way to handle Finder drags in the packaged app.
 */
export async function saveLocalImageFromPath(
  path: string,
): Promise<DownloadedImage> {
  return invoke<{
    absolute_path: string;
    relative_path: string;
    byte_size: number;
    content_type: string | null;
  }>("save_local_image_from_path", { path }).then((res) => ({
    absolutePath: res.absolute_path,
    relativePath: res.relative_path,
    byteSize: res.byte_size,
    contentType: res.content_type,
  }));
}
