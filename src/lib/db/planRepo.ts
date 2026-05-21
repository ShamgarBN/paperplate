import { addDays, eachDayOfInterval, format, parseISO } from "date-fns";
import { getDb } from "@/lib/db/client";
import { withWriteLock } from "@/lib/db/writeLock";
import {
  MEAL_SLOT_ORDER,
  type MealPlan,
  type MealPlanSlot,
  type MealPlanSlotRecipe,
  type MealSlotKind,
  type Recipe,
} from "@/lib/db/schema";

// SQLite text-sort would put 'breakfast', 'dinner', 'lunch' alphabetically,
// which scrambles meals out of chronological order. We sort by date in SQL
// and then re-sort by slot ordinal in JS for a stable, chronological result.
function chronologicalSort<T extends { date: string; slot: MealSlotKind }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return MEAL_SLOT_ORDER[a.slot] - MEAL_SLOT_ORDER[b.slot];
  });
}

export interface PlanWithSlots {
  plan: MealPlan;
  slots: MealPlanSlot[];
}

/**
 * A single recipe attachment within a slot, joined with its recipe row.
 * Each slot can have any number of these.
 */
export interface PlanSlotRecipeAttachment {
  attachmentId: number;
  recipe: Recipe;
  scaledServings: number | null;
  position: number;
}

/**
 * A slot plus *all* recipes attached to it via
 * `meal_plan_slot_recipes`. Replaces the legacy "one recipe per slot"
 * shape (`PlanSlotWithRecipe`). The legacy alias is kept for code that
 * only cares about the slot's "primary" recipe (the one at position 0).
 */
export interface PlanSlotWithRecipes extends MealPlanSlot {
  recipes: PlanSlotRecipeAttachment[];
}

/**
 * @deprecated Prefer {@link PlanSlotWithRecipes}. This shape only
 * exposes the first attached recipe, which silently drops any
 * additional recipes a multi-recipe slot might have.
 */
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
  const db = await getDb();
  return db.select<MealPlan[]>(
    "SELECT * FROM meal_plans ORDER BY start_date DESC, id DESC",
  );
}

export async function getPlan(id: number): Promise<PlanWithSlots | null> {
  const db = await getDb();
  const plans = await db.select<MealPlan[]>(
    "SELECT * FROM meal_plans WHERE id = $1",
    [id],
  );
  const plan = plans[0];
  if (!plan) return null;
  const slots = await db.select<MealPlanSlot[]>(
    "SELECT * FROM meal_plan_slots WHERE plan_id = $1 ORDER BY date",
    [id],
  );
  return { plan, slots: chronologicalSort(slots) };
}

export async function getPlanSlotsWithRecipes(
  planId: number,
): Promise<PlanSlotWithRecipes[]> {
  const db = await getDb();
  const slots = await db.select<MealPlanSlot[]>(
    "SELECT * FROM meal_plan_slots WHERE plan_id = $1 ORDER BY date",
    [planId],
  );
  if (slots.length === 0) return [];
  const slotIds = slots.map((s) => s.id);
  const placeholders = slotIds.map((_, i) => `$${i + 1}`).join(",");
  const attachments = slotIds.length
    ? await db.select<MealPlanSlotRecipe[]>(
        `SELECT id, slot_id, recipe_id, scaled_servings, position
         FROM meal_plan_slot_recipes
         WHERE slot_id IN (${placeholders})
         ORDER BY slot_id, position, id`,
        slotIds,
      )
    : [];
  const recipeIds = Array.from(new Set(attachments.map((a) => a.recipe_id)));
  let recipesById = new Map<number, Recipe>();
  if (recipeIds.length) {
    const rPlaceholders = recipeIds.map((_, i) => `$${i + 1}`).join(",");
    const recipes = await db.select<Recipe[]>(
      `SELECT * FROM recipes WHERE id IN (${rPlaceholders})`,
      recipeIds,
    );
    recipesById = new Map(recipes.map((r) => [r.id, r]));
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
  /** Days for which a breakfast slot should be pre-created. */
  breakfastDays?: string[];
  /** Days for which a lunch slot should be pre-created. */
  lunchDays?: string[];
}

export async function createPlan(
  name: string,
  startDate: string,
  endDate: string,
  options?: CreatePlanOptions,
): Promise<number> {
  return withWriteLock(async () => {
    const db = await getDb();
    const result = await db.execute(
      "INSERT INTO meal_plans (name, start_date, end_date) VALUES ($1, $2, $3)",
      [name, startDate, endDate],
    );
    const planId = Number(result.lastInsertId);
    const breakfastSet = new Set(options?.breakfastDays ?? []);
    const lunchSet = new Set(options?.lunchDays ?? []);
    try {
      const start = parseISO(startDate);
      const end = parseISO(endDate);
      let cursor = start;
      while (cursor.getTime() <= end.getTime()) {
        const dateString = isoDate(cursor);
        if (breakfastSet.has(dateString)) {
          await db.execute(
            "INSERT INTO meal_plan_slots (plan_id, date, slot) VALUES ($1, $2, 'breakfast')",
            [planId, dateString],
          );
        }
        if (lunchSet.has(dateString)) {
          await db.execute(
            "INSERT INTO meal_plan_slots (plan_id, date, slot) VALUES ($1, $2, 'lunch')",
            [planId, dateString],
          );
        }
        await db.execute(
          "INSERT INTO meal_plan_slots (plan_id, date, slot) VALUES ($1, $2, 'dinner')",
          [planId, dateString],
        );
        cursor = addDays(cursor, 1);
      }
      return planId;
    } catch (err) {
      try {
        await db.execute("DELETE FROM meal_plans WHERE id = $1", [planId]);
      } catch {
        // swallow: surface the original error
      }
      throw err;
    }
  });
}

export async function deletePlan(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM meal_plans WHERE id = $1", [id]);
}

/**
 * Rename a meal plan. Trims the input and rejects empties at the trust
 * boundary so a user can't bottom out the plan list with rows titled
 * `   ` and then wonder why nothing renders. Length is bounded so a
 * runaway paste doesn't blow up the sidebar.
 */
export async function renamePlan(id: number, name: string): Promise<void> {
  const trimmed = name.trim().slice(0, 120);
  if (!trimmed) throw new Error("Plan name cannot be empty");
  await withWriteLock(async () => {
    const db = await getDb();
    await db.execute(
      "UPDATE meal_plans SET name = $1 WHERE id = $2",
      [trimmed, id],
    );
  });
}

/**
 * Clone a meal plan along with every slot (recipe assignments, scaled
 * servings, lock state). The new plan keeps the same date range as the
 * original because users overwhelmingly duplicate plans to *re-run the
 * exact same week* — anyone wanting a different range can change it via
 * the calendar UI immediately after. The new name defaults to `${name}
 * (copy)` when the caller doesn't supply one.
 */
export async function duplicatePlan(
  sourcePlanId: number,
  newName?: string,
): Promise<number> {
  return withWriteLock(async () => {
    const db = await getDb();
    const sources = await db.select<MealPlan[]>(
      "SELECT * FROM meal_plans WHERE id = $1",
      [sourcePlanId],
    );
    const source = sources[0];
    if (!source) throw new Error("Source plan not found");

    const name = (newName?.trim() || `${source.name} (copy)`).slice(0, 120);
    const result = await db.execute(
      "INSERT INTO meal_plans (name, start_date, end_date) VALUES ($1, $2, $3)",
      [name, source.start_date, source.end_date],
    );
    const newPlanId = Number(result.lastInsertId);

    // Carry every slot — including empty ones — so the calendar shows the
    // same skeleton as the original. The user's auto-fill seeds and
    // locked picks make most slots non-trivial to recreate by hand.
    const slots = await db.select<MealPlanSlot[]>(
      "SELECT * FROM meal_plan_slots WHERE plan_id = $1",
      [sourcePlanId],
    );
    for (const slot of slots) {
      const result = await db.execute(
        `INSERT INTO meal_plan_slots
          (plan_id, date, slot, recipe_id, scaled_servings, is_locked)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          newPlanId,
          slot.date,
          slot.slot,
          slot.recipe_id,
          slot.scaled_servings,
          slot.is_locked,
        ],
      );
      const newSlotId = Number(result.lastInsertId);
      const attachments = await db.select<MealPlanSlotRecipe[]>(
        "SELECT id, slot_id, recipe_id, scaled_servings, position FROM meal_plan_slot_recipes WHERE slot_id = $1 ORDER BY position, id",
        [slot.id],
      );
      for (const a of attachments) {
        await db.execute(
          `INSERT INTO meal_plan_slot_recipes
            (slot_id, recipe_id, scaled_servings, position)
           VALUES ($1, $2, $3, $4)`,
          [newSlotId, a.recipe_id, a.scaled_servings, a.position],
        );
      }
    }
    return newPlanId;
  });
}

/**
 * Replace the slot's contents with at most a single recipe (or clear
 * it entirely with `recipeId = null`). Writes to both the legacy
 * `meal_plan_slots.recipe_id` mirror and the canonical
 * `meal_plan_slot_recipes` junction so reads from either source see
 * the new state.
 *
 * This is the right primitive for auto-fill and for "Pick recipe" UI
 * flows where the user is explicitly choosing what goes in the slot.
 * For appending additional recipes to a slot that already has one,
 * use {@link attachRecipeToSlot} instead.
 */
export async function setSlotRecipe(
  slotId: number,
  recipeId: number | null,
  scaledServings: number | null,
): Promise<void> {
  await withWriteLock(async () => {
    const db = await getDb();
    await db.execute(
      "UPDATE meal_plan_slots SET recipe_id = $1, scaled_servings = $2 WHERE id = $3",
      [recipeId, scaledServings, slotId],
    );
    await db.execute(
      "DELETE FROM meal_plan_slot_recipes WHERE slot_id = $1",
      [slotId],
    );
    if (recipeId != null) {
      await db.execute(
        `INSERT INTO meal_plan_slot_recipes (slot_id, recipe_id, scaled_servings, position)
         VALUES ($1, $2, $3, 0)`,
        [slotId, recipeId, scaledServings],
      );
    }
  });
}

/**
 * Append a recipe to a slot. If the recipe is already attached the
 * call is a no-op (UNIQUE(slot_id, recipe_id) — keep the existing
 * attachment, since changing servings would be surprising). Updates
 * the legacy single-recipe mirror to whatever the *first* attachment
 * is so older readers (clean-up tasks, plan duplication) keep
 * working.
 */
export async function attachRecipeToSlot(
  slotId: number,
  recipeId: number,
  scaledServings: number | null,
): Promise<void> {
  await withWriteLock(async () => {
    const db = await getDb();
    const existing = await db.select<Array<{ id: number }>>(
      "SELECT id FROM meal_plan_slot_recipes WHERE slot_id = $1 AND recipe_id = $2",
      [slotId, recipeId],
    );
    if (existing.length > 0) return;
    const rows = await db.select<Array<{ max_pos: number | null }>>(
      "SELECT MAX(position) AS max_pos FROM meal_plan_slot_recipes WHERE slot_id = $1",
      [slotId],
    );
    const nextPos = (rows[0]?.max_pos ?? -1) + 1;
    await db.execute(
      `INSERT INTO meal_plan_slot_recipes (slot_id, recipe_id, scaled_servings, position)
       VALUES ($1, $2, $3, $4)`,
      [slotId, recipeId, scaledServings, nextPos],
    );
    await syncSlotPrimary(slotId);
  });
}

/**
 * Remove a single recipe attachment from a slot, identified by its
 * `meal_plan_slot_recipes.id`. After removal the legacy mirror on
 * `meal_plan_slots` is reset to point at the next attachment (or
 * `NULL` if none remain).
 */
export async function detachRecipeFromSlot(
  attachmentId: number,
): Promise<void> {
  await withWriteLock(async () => {
    const db = await getDb();
    const rows = await db.select<Array<{ slot_id: number }>>(
      "SELECT slot_id FROM meal_plan_slot_recipes WHERE id = $1",
      [attachmentId],
    );
    const slotId = rows[0]?.slot_id;
    if (slotId == null) return;
    await db.execute(
      "DELETE FROM meal_plan_slot_recipes WHERE id = $1",
      [attachmentId],
    );
    await syncSlotPrimary(slotId);
  });
}

/**
 * Update the `scaled_servings` for a specific attachment. Keeps the
 * slot's legacy mirror in sync when the affected attachment is the
 * primary (position 0).
 */
export async function setAttachmentServings(
  attachmentId: number,
  scaledServings: number | null,
): Promise<void> {
  await withWriteLock(async () => {
    const db = await getDb();
    await db.execute(
      "UPDATE meal_plan_slot_recipes SET scaled_servings = $1 WHERE id = $2",
      [scaledServings, attachmentId],
    );
    const rows = await db.select<Array<{ slot_id: number }>>(
      "SELECT slot_id FROM meal_plan_slot_recipes WHERE id = $1",
      [attachmentId],
    );
    const slotId = rows[0]?.slot_id;
    if (slotId != null) await syncSlotPrimary(slotId);
  });
}

/**
 * Move an attachment from one slot to another. Append at the end of
 * the target slot's list. No-op if the attachment is dropped onto its
 * own slot. If the target slot already has the same recipe attached,
 * the moved row is deleted (de-duplication) rather than producing
 * UNIQUE constraint errors.
 */
export async function moveAttachmentToSlot(
  attachmentId: number,
  targetSlotId: number,
): Promise<void> {
  await withWriteLock(async () => {
    const db = await getDb();
    const rows = await db.select<MealPlanSlotRecipe[]>(
      "SELECT id, slot_id, recipe_id, scaled_servings, position FROM meal_plan_slot_recipes WHERE id = $1",
      [attachmentId],
    );
    const attachment = rows[0];
    if (!attachment) return;
    const fromSlotId = attachment.slot_id;
    if (fromSlotId === targetSlotId) return;
    const dup = await db.select<Array<{ id: number }>>(
      "SELECT id FROM meal_plan_slot_recipes WHERE slot_id = $1 AND recipe_id = $2",
      [targetSlotId, attachment.recipe_id],
    );
    if (dup.length > 0) {
      // Target already has this recipe; drop the source attachment.
      await db.execute(
        "DELETE FROM meal_plan_slot_recipes WHERE id = $1",
        [attachmentId],
      );
    } else {
      const maxRows = await db.select<Array<{ max_pos: number | null }>>(
        "SELECT MAX(position) AS max_pos FROM meal_plan_slot_recipes WHERE slot_id = $1",
        [targetSlotId],
      );
      const nextPos = (maxRows[0]?.max_pos ?? -1) + 1;
      await db.execute(
        "UPDATE meal_plan_slot_recipes SET slot_id = $1, position = $2 WHERE id = $3",
        [targetSlotId, nextPos, attachmentId],
      );
    }
    await syncSlotPrimary(fromSlotId);
    await syncSlotPrimary(targetSlotId);
  });
}

/**
 * Internal: re-sync `meal_plan_slots.recipe_id` and
 * `meal_plan_slots.scaled_servings` with the first attachment (by
 * position, then id). Called whenever the junction changes so legacy
 * readers see a consistent view.
 *
 * Not exported — call sites should use the higher-level helpers above
 * which guarantee they pair this with their other writes.
 */
async function syncSlotPrimary(slotId: number): Promise<void> {
  const db = await getDb();
  const rows = await db.select<Array<{
    recipe_id: number;
    scaled_servings: number | null;
  }>>(
    `SELECT recipe_id, scaled_servings
     FROM meal_plan_slot_recipes
     WHERE slot_id = $1
     ORDER BY position, id
     LIMIT 1`,
    [slotId],
  );
  const primary = rows[0];
  if (primary) {
    await db.execute(
      "UPDATE meal_plan_slots SET recipe_id = $1, scaled_servings = $2 WHERE id = $3",
      [primary.recipe_id, primary.scaled_servings, slotId],
    );
  } else {
    await db.execute(
      "UPDATE meal_plan_slots SET recipe_id = NULL, scaled_servings = NULL WHERE id = $1",
      [slotId],
    );
  }
}

export async function setSlotLocked(
  slotId: number,
  locked: boolean,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE meal_plan_slots SET is_locked = $1 WHERE id = $2",
    [locked ? 1 : 0, slotId],
  );
}

export async function setSlotServings(
  slotId: number,
  servings: number | null,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE meal_plan_slots SET scaled_servings = $1 WHERE id = $2",
    [servings, slotId],
  );
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
  const db = await getDb();
  await db.execute("DELETE FROM meal_plan_slots WHERE id = $1", [slotId]);
}

// --------------------------------------------------------------------------
// Per-day notes
// --------------------------------------------------------------------------

export interface DayNote {
  date: string;
  notes: string;
}

/**
 * Returns a Map keyed by ISO date string ("2026-05-21") → free-form
 * notes for that day. Days with no notes are simply absent from the
 * map; consumers should fall back to "" when they need a value.
 */
export async function listDayNotes(planId: number): Promise<Map<string, string>> {
  const db = await getDb();
  const rows = await db.select<DayNote[]>(
    "SELECT date, notes FROM meal_plan_day_notes WHERE plan_id = $1",
    [planId],
  );
  const out = new Map<string, string>();
  for (const r of rows) {
    if (r.notes && r.notes.trim()) out.set(r.date, r.notes);
  }
  return out;
}

/**
 * Upsert a day-note. Passing an empty string deletes the row so the
 * UI doesn't accumulate empty notes and the 30-day cleanup pass
 * doesn't trip over noise.
 */
export async function setDayNote(
  planId: number,
  date: string,
  notes: string,
): Promise<void> {
  const trimmed = notes.trim().slice(0, 2_000);
  await withWriteLock(async () => {
    const db = await getDb();
    if (!trimmed) {
      await db.execute(
        "DELETE FROM meal_plan_day_notes WHERE plan_id = $1 AND date = $2",
        [planId, date],
      );
      return;
    }
    await db.execute(
      `INSERT INTO meal_plan_day_notes (plan_id, date, notes, updated_at)
         VALUES ($1, $2, $3, datetime('now'))
       ON CONFLICT(plan_id, date) DO UPDATE
         SET notes = excluded.notes,
             updated_at = excluded.updated_at`,
      [planId, date, trimmed],
    );
  });
}

export async function findOrCreateSlot(
  planId: number,
  date: string,
  slot: MealSlotKind,
): Promise<MealPlanSlot> {
  const db = await getDb();
  const existing = await db.select<MealPlanSlot[]>(
    "SELECT * FROM meal_plan_slots WHERE plan_id = $1 AND date = $2 AND slot = $3",
    [planId, date, slot],
  );
  if (existing[0]) return existing[0];
  const result = await db.execute(
    "INSERT INTO meal_plan_slots (plan_id, date, slot) VALUES ($1, $2, $3)",
    [planId, date, slot],
  );
  const created = await db.select<MealPlanSlot[]>(
    "SELECT * FROM meal_plan_slots WHERE id = $1",
    [Number(result.lastInsertId)],
  );
  return created[0]!;
}
