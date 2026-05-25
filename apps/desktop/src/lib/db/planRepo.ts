import { addDays, eachDayOfInterval, format, parseISO } from "date-fns";
import { supabase } from "@/lib/supabase";
import {
  MEAL_SLOT_ORDER,
  type MealPlan,
  type MealPlanSlot,
  type MealPlanSlotRecipe,
  type MealSlotKind,
  type Recipe,
} from "@/lib/db/schema";

// SQLite text-sort puts 'breakfast', 'dinner', 'lunch' alphabetically, which
// scrambles chronology. Postgres is the same for the slot column; we re-sort
// in JS to enforce ordinal order.
function chronologicalSort<T extends { date: string; slot: MealSlotKind }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return MEAL_SLOT_ORDER[a.slot] - MEAL_SLOT_ORDER[b.slot];
  });
}

// Supabase returns true/false where the SQLite schema used 0|1. Convert
// at the boundary so the rest of the app, including the planner heuristic,
// can keep treating these values as 0|1.
function normalizeSlot(row: any): MealPlanSlot {
  return { ...row, is_locked: row.is_locked ? 1 : 0 };
}

export interface PlanWithSlots {
  plan: MealPlan;
  slots: MealPlanSlot[];
}

export interface PlanSlotRecipeAttachment {
  attachmentId: number;
  recipe: Recipe;
  scaledServings: number | null;
  position: number;
}

export interface PlanSlotWithRecipes extends MealPlanSlot {
  recipes: PlanSlotRecipeAttachment[];
}

/** @deprecated Prefer PlanSlotWithRecipes. */
export interface PlanSlotWithRecipe extends MealPlanSlot {
  recipe: Recipe | null;
}

export function isoDate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function planDates(plan: MealPlan): Date[] {
  return eachDayOfInterval({
    start: parseISO(plan.start_date),
    end: parseISO(plan.end_date),
  });
}

export async function listPlans(): Promise<MealPlan[]> {
  const { data, error } = await supabase
    .from("meal_plans")
    .select("*")
    .order("start_date", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw error;
  return (data ?? []) as MealPlan[];
}

export async function getPlan(id: number): Promise<PlanWithSlots | null> {
  const [planResp, slotResp] = await Promise.all([
    supabase.from("meal_plans").select("*").eq("id", id).maybeSingle(),
    supabase.from("meal_plan_slots").select("*").eq("plan_id", id).order("date"),
  ]);
  if (planResp.error) throw planResp.error;
  if (slotResp.error) throw slotResp.error;
  if (!planResp.data) return null;
  const slots = ((slotResp.data ?? []) as any[]).map(normalizeSlot);
  return { plan: planResp.data as MealPlan, slots: chronologicalSort(slots) };
}

export async function getPlanSlotsWithRecipes(
  planId: number,
): Promise<PlanSlotWithRecipes[]> {
  const { data: slotRows, error: slotErr } = await supabase
    .from("meal_plan_slots")
    .select("*")
    .eq("plan_id", planId)
    .order("date");
  if (slotErr) throw slotErr;
  const slots = ((slotRows ?? []) as any[]).map(normalizeSlot);
  if (slots.length === 0) return [];

  const slotIds = slots.map((s) => s.id);
  const { data: attachmentRows, error: attErr } = await supabase
    .from("meal_plan_slot_recipes")
    .select("id, slot_id, recipe_id, scaled_servings, position")
    .in("slot_id", slotIds)
    .order("position");
  if (attErr) throw attErr;
  const attachments = (attachmentRows ?? []) as MealPlanSlotRecipe[];

  const recipeIds = Array.from(new Set(attachments.map((a) => a.recipe_id)));
  let recipesById = new Map<number, Recipe>();
  if (recipeIds.length > 0) {
    const { data: recipes, error: recErr } = await supabase
      .from("recipes")
      .select("*")
      .in("id", recipeIds);
    if (recErr) throw recErr;
    recipesById = new Map((recipes ?? []).map((r: any) => [r.id, r as Recipe]));
  }

  const attachmentsBySlot = new Map<number, PlanSlotRecipeAttachment[]>();
  for (const a of attachments) {
    const recipe = recipesById.get(a.recipe_id);
    if (!recipe) continue;
    const arr = attachmentsBySlot.get(a.slot_id) ?? [];
    arr.push({
      attachmentId: a.id,
      recipe,
      scaledServings: a.scaled_servings,
      position: a.position,
    });
    attachmentsBySlot.set(a.slot_id, arr);
  }
  const enriched: PlanSlotWithRecipes[] = slots.map((s) => ({
    ...s,
    recipes: attachmentsBySlot.get(s.id) ?? [],
  }));
  return chronologicalSort(enriched);
}

export interface CreatePlanOptions {
  breakfastDays?: string[];
  lunchDays?: string[];
}

export async function createPlan(
  name: string,
  startDate: string,
  endDate: string,
  options?: CreatePlanOptions,
): Promise<number> {
  const { data: planRow, error: planErr } = await supabase
    .from("meal_plans")
    .insert({ name, start_date: startDate, end_date: endDate })
    .select("id")
    .single();
  if (planErr || !planRow) throw planErr ?? new Error("Insert failed");
  const planId = planRow.id as number;

  const breakfastSet = new Set(options?.breakfastDays ?? []);
  const lunchSet = new Set(options?.lunchDays ?? []);
  try {
    const slotInserts: Array<{
      plan_id: number;
      date: string;
      slot: MealSlotKind;
    }> = [];
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    let cursor = start;
    while (cursor.getTime() <= end.getTime()) {
      const dateString = isoDate(cursor);
      if (breakfastSet.has(dateString)) {
        slotInserts.push({
          plan_id: planId,
          date: dateString,
          slot: "breakfast",
        });
      }
      if (lunchSet.has(dateString)) {
        slotInserts.push({ plan_id: planId, date: dateString, slot: "lunch" });
      }
      slotInserts.push({
        plan_id: planId,
        date: dateString,
        slot: "dinner",
      });
      cursor = addDays(cursor, 1);
    }
    if (slotInserts.length > 0) {
      const { error } = await supabase
        .from("meal_plan_slots")
        .insert(slotInserts);
      if (error) throw error;
    }
    return planId;
  } catch (err) {
    try {
      await supabase.from("meal_plans").delete().eq("id", planId);
    } catch {
      /* surface original */
    }
    throw err;
  }
}

export async function deletePlan(id: number): Promise<void> {
  const { error } = await supabase.from("meal_plans").delete().eq("id", id);
  if (error) throw error;
}

export async function renamePlan(id: number, name: string): Promise<void> {
  const trimmed = name.trim().slice(0, 120);
  if (!trimmed) throw new Error("Plan name cannot be empty");
  const { error } = await supabase
    .from("meal_plans")
    .update({ name: trimmed })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Clone a plan with all its slots + attachments. Same name + " (copy)" by
 * default, same date range as the source — users overwhelmingly duplicate
 * plans to re-run the same week, and date changes are easy via the
 * calendar afterwards.
 */
export async function duplicatePlan(
  sourcePlanId: number,
  newName?: string,
): Promise<number> {
  const { data: source, error: srcErr } = await supabase
    .from("meal_plans")
    .select("*")
    .eq("id", sourcePlanId)
    .maybeSingle();
  if (srcErr) throw srcErr;
  if (!source) throw new Error("Source plan not found");

  const name = (newName?.trim() || `${source.name} (copy)`).slice(0, 120);
  const { data: newPlan, error: insErr } = await supabase
    .from("meal_plans")
    .insert({
      name,
      start_date: source.start_date,
      end_date: source.end_date,
    })
    .select("id")
    .single();
  if (insErr || !newPlan) throw insErr ?? new Error("Insert failed");
  const newPlanId = newPlan.id as number;

  const { data: slotRows, error: slotErr } = await supabase
    .from("meal_plan_slots")
    .select("*")
    .eq("plan_id", sourcePlanId);
  if (slotErr) throw slotErr;

  for (const slot of ((slotRows ?? []) as any[]).map(normalizeSlot)) {
    const { data: newSlot, error: newSlotErr } = await supabase
      .from("meal_plan_slots")
      .insert({
        plan_id: newPlanId,
        date: slot.date,
        slot: slot.slot,
        recipe_id: slot.recipe_id,
        scaled_servings: slot.scaled_servings,
        is_locked: !!slot.is_locked,
      })
      .select("id")
      .single();
    if (newSlotErr || !newSlot) throw newSlotErr ?? new Error("Insert failed");
    const newSlotId = newSlot.id as number;

    const { data: atts } = await supabase
      .from("meal_plan_slot_recipes")
      .select("id, slot_id, recipe_id, scaled_servings, position")
      .eq("slot_id", slot.id)
      .order("position");
    if (atts && atts.length > 0) {
      const rows = atts.map((a: any) => ({
        slot_id: newSlotId,
        recipe_id: a.recipe_id,
        scaled_servings: a.scaled_servings,
        position: a.position,
      }));
      const { error } = await supabase
        .from("meal_plan_slot_recipes")
        .insert(rows);
      if (error) throw error;
    }
  }
  return newPlanId;
}

/**
 * Replace the slot's contents with at most a single recipe (or clear it
 * entirely with `recipeId = null`). Updates both the legacy column and the
 * junction table so older readers stay consistent.
 */
export async function setSlotRecipe(
  slotId: number,
  recipeId: number | null,
  scaledServings: number | null,
): Promise<void> {
  const { error: updErr } = await supabase
    .from("meal_plan_slots")
    .update({ recipe_id: recipeId, scaled_servings: scaledServings })
    .eq("id", slotId);
  if (updErr) throw updErr;
  const { error: delErr } = await supabase
    .from("meal_plan_slot_recipes")
    .delete()
    .eq("slot_id", slotId);
  if (delErr) throw delErr;
  if (recipeId != null) {
    const { error } = await supabase.from("meal_plan_slot_recipes").insert({
      slot_id: slotId,
      recipe_id: recipeId,
      scaled_servings: scaledServings,
      position: 0,
    });
    if (error) throw error;
  }
}

export async function attachRecipeToSlot(
  slotId: number,
  recipeId: number,
  scaledServings: number | null,
): Promise<void> {
  const { data: existing } = await supabase
    .from("meal_plan_slot_recipes")
    .select("id")
    .eq("slot_id", slotId)
    .eq("recipe_id", recipeId)
    .maybeSingle();
  if (existing) return;
  const { data: maxRow } = await supabase
    .from("meal_plan_slot_recipes")
    .select("position")
    .eq("slot_id", slotId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPos = (maxRow?.position ?? -1) + 1;
  const { error } = await supabase.from("meal_plan_slot_recipes").insert({
    slot_id: slotId,
    recipe_id: recipeId,
    scaled_servings: scaledServings,
    position: nextPos,
  });
  if (error) throw error;
  await syncSlotPrimary(slotId);
}

export async function detachRecipeFromSlot(
  attachmentId: number,
): Promise<void> {
  const { data: row } = await supabase
    .from("meal_plan_slot_recipes")
    .select("slot_id")
    .eq("id", attachmentId)
    .maybeSingle();
  const slotId = row?.slot_id as number | undefined;
  if (slotId == null) return;
  const { error } = await supabase
    .from("meal_plan_slot_recipes")
    .delete()
    .eq("id", attachmentId);
  if (error) throw error;
  await syncSlotPrimary(slotId);
}

export async function setAttachmentServings(
  attachmentId: number,
  scaledServings: number | null,
): Promise<void> {
  const { error } = await supabase
    .from("meal_plan_slot_recipes")
    .update({ scaled_servings: scaledServings })
    .eq("id", attachmentId);
  if (error) throw error;
  const { data: row } = await supabase
    .from("meal_plan_slot_recipes")
    .select("slot_id")
    .eq("id", attachmentId)
    .maybeSingle();
  if (row?.slot_id != null) await syncSlotPrimary(row.slot_id);
}

export async function moveAttachmentToSlot(
  attachmentId: number,
  targetSlotId: number,
): Promise<void> {
  const { data: attachment } = await supabase
    .from("meal_plan_slot_recipes")
    .select("id, slot_id, recipe_id, scaled_servings, position")
    .eq("id", attachmentId)
    .maybeSingle();
  if (!attachment) return;
  const fromSlotId = attachment.slot_id as number;
  if (fromSlotId === targetSlotId) return;
  const { data: dup } = await supabase
    .from("meal_plan_slot_recipes")
    .select("id")
    .eq("slot_id", targetSlotId)
    .eq("recipe_id", attachment.recipe_id)
    .maybeSingle();
  if (dup) {
    const { error } = await supabase
      .from("meal_plan_slot_recipes")
      .delete()
      .eq("id", attachmentId);
    if (error) throw error;
  } else {
    const { data: maxRow } = await supabase
      .from("meal_plan_slot_recipes")
      .select("position")
      .eq("slot_id", targetSlotId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPos = (maxRow?.position ?? -1) + 1;
    const { error } = await supabase
      .from("meal_plan_slot_recipes")
      .update({ slot_id: targetSlotId, position: nextPos })
      .eq("id", attachmentId);
    if (error) throw error;
  }
  await syncSlotPrimary(fromSlotId);
  await syncSlotPrimary(targetSlotId);
}

/**
 * Re-sync the legacy single-recipe mirror on a slot to point at whichever
 * attachment is first (by position then id). Internal; callers above pair
 * this with their other writes.
 */
async function syncSlotPrimary(slotId: number): Promise<void> {
  const { data } = await supabase
    .from("meal_plan_slot_recipes")
    .select("recipe_id, scaled_servings")
    .eq("slot_id", slotId)
    .order("position")
    .limit(1)
    .maybeSingle();
  if (data) {
    await supabase
      .from("meal_plan_slots")
      .update({
        recipe_id: data.recipe_id,
        scaled_servings: data.scaled_servings,
      })
      .eq("id", slotId);
  } else {
    await supabase
      .from("meal_plan_slots")
      .update({ recipe_id: null, scaled_servings: null })
      .eq("id", slotId);
  }
}

export async function setSlotLocked(
  slotId: number,
  locked: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("meal_plan_slots")
    .update({ is_locked: locked })
    .eq("id", slotId);
  if (error) throw error;
}

export async function setSlotServings(
  slotId: number,
  servings: number | null,
): Promise<void> {
  const { error } = await supabase
    .from("meal_plan_slots")
    .update({ scaled_servings: servings })
    .eq("id", slotId);
  if (error) throw error;
}

export async function ensureLunchSlot(
  planId: number,
  date: string,
): Promise<MealPlanSlot> {
  return findOrCreateSlot(planId, date, "lunch");
}

export async function ensureBreakfastSlot(
  planId: number,
  date: string,
): Promise<MealPlanSlot> {
  return findOrCreateSlot(planId, date, "breakfast");
}

export async function removeSlot(slotId: number): Promise<void> {
  const { error } = await supabase
    .from("meal_plan_slots")
    .delete()
    .eq("id", slotId);
  if (error) throw error;
}

// --------------------------------------------------------------------------
// Per-day notes
// --------------------------------------------------------------------------

export interface DayNote {
  date: string;
  notes: string;
}

export async function listDayNotes(
  planId: number,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("meal_plan_day_notes")
    .select("date, notes")
    .eq("plan_id", planId);
  if (error) throw error;
  const out = new Map<string, string>();
  for (const r of (data ?? []) as DayNote[]) {
    if (r.notes && r.notes.trim()) out.set(r.date, r.notes);
  }
  return out;
}

export async function setDayNote(
  planId: number,
  date: string,
  notes: string,
): Promise<void> {
  const trimmed = notes.trim().slice(0, 2_000);
  if (!trimmed) {
    const { error } = await supabase
      .from("meal_plan_day_notes")
      .delete()
      .eq("plan_id", planId)
      .eq("date", date);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("meal_plan_day_notes").upsert(
    {
      plan_id: planId,
      date,
      notes: trimmed,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "plan_id,date" },
  );
  if (error) throw error;
}

export async function findOrCreateSlot(
  planId: number,
  date: string,
  slot: MealSlotKind,
): Promise<MealPlanSlot> {
  const { data: existing, error: lookErr } = await supabase
    .from("meal_plan_slots")
    .select("*")
    .eq("plan_id", planId)
    .eq("date", date)
    .eq("slot", slot)
    .maybeSingle();
  if (lookErr) throw lookErr;
  if (existing) return normalizeSlot(existing);
  const { data: created, error: insErr } = await supabase
    .from("meal_plan_slots")
    .insert({ plan_id: planId, date, slot })
    .select("*")
    .single();
  if (insErr || !created) throw insErr ?? new Error("Insert failed");
  return normalizeSlot(created);
}
