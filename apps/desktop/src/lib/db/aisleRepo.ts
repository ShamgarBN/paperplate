import { supabase } from "@/lib/supabase";
import type { Aisle } from "@/lib/db/schema";

const MAX_AISLE_NAME_LENGTH = 60;

export const FALLBACK_AISLE_NAME = "Other";

/**
 * List every aisle alphabetically (case-insensitive). Per the user feedback
 * the Settings page always renders aisles alphabetically.
 */
export async function listAisles(): Promise<Aisle[]> {
  const { data, error } = await supabase
    .from("aisles")
    .select("id, name, sort_order")
    .order("name");
  if (error) throw error;
  return (data ?? []) as Aisle[];
}

export async function createAisle(name: string): Promise<number> {
  const trimmed = name.trim().slice(0, MAX_AISLE_NAME_LENGTH);
  if (!trimmed) throw new Error("Aisle name cannot be empty");
  // sort_order is legacy; we still advance it so existing exports stay sane.
  const { data: maxRow } = await supabase
    .from("aisles")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = (maxRow?.sort_order ?? 0) + 10;
  const { data: inserted, error } = await supabase
    .from("aisles")
    .insert({ name: trimmed, sort_order: nextSort })
    .select("id")
    .single();
  if (error || !inserted) throw error ?? new Error("Insert failed");
  return inserted.id as number;
}

/**
 * Rename an aisle. Propagates the new label to any free-form shopping_list_items
 * rows that referenced it under the old name (those columns are plain TEXT,
 * not FK).
 */
export async function renameAisle(id: number, name: string): Promise<void> {
  const trimmed = name.trim().slice(0, MAX_AISLE_NAME_LENGTH);
  if (!trimmed) throw new Error("Aisle name cannot be empty");
  const { data: prior } = await supabase
    .from("aisles")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  const oldName = prior?.name as string | undefined;
  const { error: updErr } = await supabase
    .from("aisles")
    .update({ name: trimmed })
    .eq("id", id);
  if (updErr) throw updErr;
  if (oldName && oldName !== trimmed) {
    const { error: propErr } = await supabase
      .from("shopping_list_items")
      .update({ aisle: trimmed })
      .eq("aisle", oldName);
    if (propErr) throw propErr;
  }
}

/**
 * Delete an aisle. Refuses to drop the "Other" fallback; remaps any
 * shopping_list_items pointing at the deleted aisle to "Other" so the UI
 * doesn't render orphans.
 */
export async function deleteAisle(id: number): Promise<void> {
  const { data: prior } = await supabase
    .from("aisles")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  const name = prior?.name as string | undefined;
  if (!name) return;
  if (name.toLowerCase() === FALLBACK_AISLE_NAME.toLowerCase()) {
    throw new Error(`Cannot delete the "${FALLBACK_AISLE_NAME}" aisle`);
  }
  const { error: reErr } = await supabase
    .from("shopping_list_items")
    .update({ aisle: FALLBACK_AISLE_NAME })
    .eq("aisle", name);
  if (reErr) throw reErr;
  const { error: delErr } = await supabase.from("aisles").delete().eq("id", id);
  if (delErr) throw delErr;
}

/**
 * Pin a canonical ingredient name to a specific aisle. Delete-then-insert
 * (rather than upsert) to keep the row history pattern from the SQLite
 * version. Returns true when the override was written, false when the
 * named aisle doesn't exist.
 */
export async function setIngredientAisle(
  itemCanonical: string,
  aisleName: string,
): Promise<boolean> {
  const canonical = itemCanonical.trim().toLowerCase();
  const target = aisleName.trim();
  if (!canonical || !target) return false;
  const { data: aisleRow } = await supabase
    .from("aisles")
    .select("id")
    .ilike("name", target)
    .maybeSingle();
  const aisleId = aisleRow?.id as number | undefined;
  if (!aisleId) return false;
  await supabase
    .from("ingredient_aisle_map")
    .delete()
    .eq("item_canonical", canonical);
  const { error } = await supabase
    .from("ingredient_aisle_map")
    .insert({ item_canonical: canonical, aisle_id: aisleId });
  if (error) throw error;
  return true;
}
