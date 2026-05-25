import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

export async function exportDatabase(): Promise<{ path: string; bytes: number } | null> {
  const stamp = new Date().toISOString().slice(0, 10);
  const target = await save({
    title: "Export Paperplate database",
    defaultPath: `paperplate-${stamp}.db`,
    filters: [{ name: "SQLite database", extensions: ["db", "sqlite"] }],
  });
  if (!target) return null;
  const bytes = await invoke<number>("export_database", {
    destination: target,
  });
  return { path: target, bytes };
}

export async function importDatabase(): Promise<{ path: string; bytes: number } | null> {
  const source = await open({
    title: "Import Paperplate database",
    multiple: false,
    directory: false,
    filters: [{ name: "SQLite database", extensions: ["db", "sqlite"] }],
  });
  if (!source || Array.isArray(source)) return null;
  const bytes = await invoke<number>("import_database", { source });
  return { path: source, bytes };
}

/**
 * Removes a cached recipe image from disk. Safe to call with `null`/missing
 * paths (no-op). Errors are surfaced to the caller.
 */
export async function deleteRecipeImage(relativePath: string | null): Promise<void> {
  if (!relativePath) return;
  await invoke("delete_image", { relativePath });
}
