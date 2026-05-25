import { convertFileSrc } from "@tauri-apps/api/core";
import { appLocalDataDir, join } from "@tauri-apps/api/path";

let appLocalDir: string | null = null;

export async function localImageUrl(
  relativePath: string | null,
): Promise<string | null> {
  if (!relativePath) return null;
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
