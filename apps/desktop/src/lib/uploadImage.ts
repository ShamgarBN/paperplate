/**
 * Hero-image upload helpers for the desktop recipe editor.
 *
 * Three entry points cover the ways an image can arrive:
 *   - `uploadFile(file)`     — File picker + HTML5 drag-drop (browser-style)
 *   - `uploadFromPath(path)` — Tauri's native OS drag-drop, which hands us
 *                              a filesystem path the WebView can't read
 *                              directly
 *   - `uploadFromUrl(url)`   — scraped image URL from the JSON-LD pass,
 *                              re-downloaded via the existing edge function
 *
 * All three end up at the same place: bytes uploaded to the
 * `recipe-images` Supabase Storage bucket at a content-addressed path,
 * and the public URL returned for the caller to store as `image_path`.
 *
 * Returns the same shape (`{ relativePath: string }`) the legacy
 * `saveLocalImage` returned so existing callers don't need restructuring;
 * the value is now a fully-qualified https URL instead of a local file.
 */
import { readFile } from "@tauri-apps/plugin-fs";
import { supabase } from "@/lib/supabase";

export interface UploadResult {
  /** Public Storage URL. Stored as `recipes.image_path`. */
  relativePath: string;
  byteSize: number;
  contentType: string;
}

const BUCKET = "recipe-images";
const MAX_BYTES = 8 * 1024 * 1024;

const ACCEPTED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export async function uploadFile(file: File): Promise<UploadResult> {
  if (!ACCEPTED_MIME.has(file.type)) {
    throw new Error(
      `Unsupported image type "${file.type || "unknown"}". Use JPG, PNG, WebP, GIF, or AVIF.`,
    );
  }
  if (file.size <= 0) throw new Error("File is empty.");
  if (file.size > MAX_BYTES) {
    throw new Error(
      `Image is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Max is 8 MB.`,
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  return uploadBytes(bytes, file.type);
}

export async function uploadFromPath(path: string): Promise<UploadResult> {
  // tauri-plugin-fs reads the file off disk in Rust and hands us the bytes.
  const bytes = await readFile(path);
  if (bytes.byteLength > MAX_BYTES) {
    throw new Error(
      `Image is too large (${(bytes.byteLength / (1024 * 1024)).toFixed(1)} MB). Max is 8 MB.`,
    );
  }
  const mime = guessMimeFromName(path) ?? "image/jpeg";
  if (!ACCEPTED_MIME.has(mime)) {
    throw new Error(
      `Unsupported image type. Use JPG, PNG, WebP, GIF, or AVIF.`,
    );
  }
  return uploadBytes(bytes, mime);
}

/**
 * Pull an image from a remote URL (typically the JSON-LD hero from a
 * scraped recipe page), stash a copy in Storage, and return its public
 * URL. Fetches client-side; sites that block cross-origin browser fetches
 * will throw, in which case callers should fall back to user-supplied
 * imagery.
 */
export async function uploadFromUrl(url: string): Promise<UploadResult> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Could not download image (HTTP ${res.status})`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) {
    throw new Error(
      `Image too large (${(buf.byteLength / (1024 * 1024)).toFixed(1)} MB).`,
    );
  }
  const mime =
    res.headers.get("content-type")?.split(";")[0]?.trim() ??
    guessMimeFromName(url) ??
    "image/jpeg";
  return uploadBytes(buf, mime);
}

async function uploadBytes(
  bytes: Uint8Array,
  contentType: string,
): Promise<UploadResult> {
  const ext = MIME_TO_EXT[contentType.toLowerCase()] ?? "jpg";
  const hash = await sha256Hex(bytes);
  const key = `recipes/${hash.slice(0, 16)}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(key, bytes, { contentType, upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(key);
  return {
    relativePath: data.publicUrl,
    byteSize: bytes.byteLength,
    contentType,
  };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes as unknown as ArrayBuffer,
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function guessMimeFromName(name: string): string | null {
  const m = name.toLowerCase().match(/\.(jpe?g|png|webp|gif|avif)(?:\?|#|$)/);
  if (!m) return null;
  switch (m[1]) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "avif":
      return "image/avif";
    default:
      return null;
  }
}
