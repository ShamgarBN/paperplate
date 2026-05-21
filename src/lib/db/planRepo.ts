import { addDays, eachDayOfInterval, format, parseISO } from "date-fns";
import { getDb } from "@/lib/db/client";
import { withWriteLock } from "@/lib/db/writeLock";
import {
  MEAL_SLOT_ORDER,
  type MealPlan,
  type MealPlanSlot,
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
): Promise<PlanSlotWithRecipe[]> {
  const db = await getDb();
  const slots = await db.select<MealPlanSlot[]>(
    "SELECT * FROM meal_plan_slots WHERE plan_id = $1 ORDER BY date",
    [planId],
  );
  if (slots.length === 0) return [];
  const recipeIds = Array.from(
    new Set(slots.map((s) => s.recipe_id).filter((id): id is number => id != null)),
  );
  let recipesById = new Map<number, Recipe>();
  if (recipeIds.length) {
    const placeholders = recipeIds.map((_, i) => `$${i + 1}`).join(",");
    const recipes = await db.select<Recipe[]>(
      `SELECT * FROM recipes WHERE id IN (${placeholders})`,
      recipeIds,
    );
    recipesById = new Map(recipes.map((r) => [r.id, r]));
  }
  const enriched = slots.map((s) => ({
    ...s,
    recipe: s.recipe_id != null ? recipesById.get(s.recipe_id) ?? null : null,
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

export async function setSlotRecipe(
  slotId: number,
  recipeId: number | null,
  scaledServings: number | null,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE meal_plan_slots SET recipe_id = $1, scaled_servings = $2 WHERE id = $3",
    [recipeId, scaledServings, slotId],
  );
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
