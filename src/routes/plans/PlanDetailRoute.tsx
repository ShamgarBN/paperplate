import { useMemo, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, parseISO } from "date-fns";
import { ChevronLeft, ShoppingBasket, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  CalendarGrid,
  alignWeekChunks,
} from "@/components/plans/CalendarGrid";
import { CreatePlanDialog as _ } from "@/components/plans/CreatePlanDialog";
import { LibraryPanel } from "@/components/plans/LibraryPanel";
import { RecipePicker } from "@/components/plans/RecipePicker";
import { ServingsEditor } from "@/components/plans/ServingsEditor";
import { AutoFillBar } from "@/components/plans/AutoFillBar";
import {
  deletePlan,
  ensureBreakfastSlot,
  ensureLunchSlot,
  findOrCreateSlot,
  getPlan,
  getPlanSlotsWithRecipes,
  removeSlot,
  setSlotLocked,
  setSlotRecipe,
  setSlotServings,
} from "@/lib/db/planRepo";
import { loadPlannerRecipes } from "@/lib/db/plannerRepo";
import { listRecipes } from "@/lib/db/recipeRepo";
import { autoSelect } from "@/lib/planner/autoSelect";
import type { MealSlotKind, Recipe, MealPlanSlot } from "@/lib/db/schema";
import { getDb } from "@/lib/db/client";
import { withWriteLock } from "@/lib/db/writeLock";
import { useSettingsStore } from "@/store/settingsStore";

export function PlanDetailRoute() {
  const { planId } = useParams({ from: "/plans/$planId" });
  const id = Number(planId);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const planQuery = useQuery({
    queryKey: ["plan", id],
    queryFn: () => getPlan(id),
    enabled: Number.isFinite(id),
  });

  const slotsQuery = useQuery({
    queryKey: ["plan-slots", id],
    queryFn: () => getPlanSlotsWithRecipes(id),
    enabled: Number.isFinite(id),
  });

  const cuisineMapQuery = useQuery({
    queryKey: ["recipe-cuisines"],
    queryFn: async () => buildCuisineByRecipeMap(),
  });

  const [picker, setPicker] = useState<{
    date: string;
    slot: MealSlotKind;
  } | null>(null);
  const [servingsEditor, setServingsEditor] = useState<{
    slotId: number;
    initial: number;
  } | null>(null);
  const [confirmDeletePlan, setConfirmDeletePlan] = useState(false);
  const [activeSlotId, setActiveSlotId] = useState<number | null>(null);
  const [activeRecipeId, setActiveRecipeId] = useState<number | null>(null);

  const libraryRecipesQuery = useQuery({
    queryKey: ["recipes-flat"],
    queryFn: listRecipes,
  });

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const handleDragStart = (event: { active: { id: string | number } }) => {
    const id = String(event.active.id);
    if (id.startsWith("slot-")) {
      setActiveSlotId(Number(id.slice(5)) || null);
    } else if (id.startsWith("lib-")) {
      setActiveRecipeId(Number(id.slice(4)) || null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveSlotId(null);
    setActiveRecipeId(null);
    const target = event.over?.data.current as
      | { date: string; slot: MealSlotKind }
      | undefined;
    if (!target) return;
    const sourceId = String(event.active.id);
    if (sourceId.startsWith("slot-")) {
      const fromSlotId = Number(sourceId.slice(5));
      if (!fromSlotId) return;
      moveSlotMutation.mutate({
        fromSlotId,
        toDate: target.date,
        toSlot: target.slot,
      });
    } else if (sourceId.startsWith("lib-")) {
      const recipeId = Number(sourceId.slice(4));
      if (!recipeId) return;
      assignFromLibraryMutation.mutate({
        recipeId,
        date: target.date,
        slot: target.slot,
      });
    }
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["plan-slots", id] });
  };

  const setRecipeMutation = useMutation({
    mutationFn: async (params: {
      slotId: number;
      recipeId: number | null;
      servings: number | null;
    }) =>
      setSlotRecipe(params.slotId, params.recipeId, params.servings),
    onSuccess: refresh,
  });

  const lockMutation = useMutation({
    mutationFn: async (params: { slotId: number; locked: boolean }) =>
      setSlotLocked(params.slotId, params.locked),
    onSuccess: refresh,
  });

  const servingsMutation = useMutation({
    mutationFn: async (params: { slotId: number; servings: number | null }) =>
      setSlotServings(params.slotId, params.servings),
    onSuccess: refresh,
  });

  const removeSlotMutation = useMutation({
    mutationFn: async (slotId: number) => removeSlot(slotId),
    onSuccess: refresh,
  });

  const ensureLunchMutation = useMutation({
    mutationFn: async (date: string) => ensureLunchSlot(id, date),
    onSuccess: refresh,
  });

  const ensureBreakfastMutation = useMutation({
    mutationFn: async (date: string) => ensureBreakfastSlot(id, date),
    onSuccess: refresh,
  });

  const moveSlotMutation = useMutation({
    mutationFn: async (params: {
      fromSlotId: number;
      toDate: string;
      toSlot: MealSlotKind;
    }) =>
      withWriteLock(async () => {
        const slots = await getPlanSlotsWithRecipes(id);
        const from = slots.find((s) => s.id === params.fromSlotId);
        if (!from || !from.recipe_id) return;
        const target = await findOrCreateSlot(
          id,
          params.toDate,
          params.toSlot,
        );
        const fromRecipe = from.recipe_id;
        const fromServings = from.scaled_servings;
        const toRecipe = target.recipe_id;
        const toServings = target.scaled_servings;
        await setSlotRecipe(target.id, fromRecipe, fromServings);
        await setSlotRecipe(from.id, toRecipe, toServings);
      }),
    onSuccess: refresh,
    onError: (err) =>
      toast.error(
        `Could not move slot: ${err instanceof Error ? err.message : String(err)}`,
      ),
  });

  const assignFromLibraryMutation = useMutation({
    mutationFn: async (params: {
      recipeId: number;
      date: string;
      slot: MealSlotKind;
    }) =>
      withWriteLock(async () => {
        const target = await findOrCreateSlot(
          id,
          params.date,
          params.slot,
        );
        // Use preferred_servings when set, otherwise base.
        const db = await getDb();
        const rows = await db.select<
          Array<{ base_servings: number; preferred_servings: number | null }>
        >(
          "SELECT base_servings, preferred_servings FROM recipes WHERE id = $1",
          [params.recipeId],
        );
        const row = rows[0];
        const servings = row?.preferred_servings ?? row?.base_servings ?? null;
        await setSlotRecipe(target.id, params.recipeId, servings);
      }),
    onSuccess: refresh,
    onError: (err) =>
      toast.error(
        `Could not assign recipe: ${err instanceof Error ? err.message : String(err)}`,
      ),
  });

  const deletePlanMutation = useMutation({
    mutationFn: async () => deletePlan(id),
    onSuccess: () => {
      toast.success("Plan deleted.");
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      navigate({ to: "/plans" });
    },
    onError: (err) =>
      toast.error(
        `Could not delete plan: ${err instanceof Error ? err.message : String(err)}`,
      ),
  });

  const settings = useSettingsStore();
  const [preserveLocked, setPreserveLocked] = useState(true);

  const autoFillMutation = useMutation({
    mutationFn: async () => {
      const planRecipes = await loadPlannerRecipes();
      if (planRecipes.length === 0) {
        throw new Error("Add some recipes to your library first.");
      }
      const currentSlots = await getPlanSlotsWithRecipes(id);
      const plannerSlots = currentSlots.map((s: MealPlanSlot) => ({
        id: s.id,
        date: s.date,
        slot: s.slot,
        recipeId: preserveLocked && s.is_locked ? s.recipe_id : null,
        isLocked: preserveLocked ? !!s.is_locked : false,
      }));
      const result = autoSelect(planRecipes, plannerSlots, {
        balance: settings.plannerBalance,
        varietyWeight: settings.varietyWeight,
        recentlyCookedDays: settings.recentlyCookedDays,
        restarts: 24,
      });
      const recipesById = new Map(planRecipes.map((r) => [r.id, r]));
      await withWriteLock(async () => {
        for (const a of result.assignments) {
          const slotMatch = currentSlots.find((s) => s.id === a.slotId);
          if (!slotMatch) continue;
          if (preserveLocked && slotMatch.is_locked) continue;
          const recipe =
            a.recipeId != null ? recipesById.get(a.recipeId) : null;
          await setSlotRecipe(
            a.slotId,
            a.recipeId,
            recipe?.baseServings ?? null,
          );
        }
      });
      return result;
    },
    onSuccess: (result) => {
      refresh();
      const filled = result.assignments.filter((a) => a.recipeId != null).length;
      const total = result.assignments.length;
      if (filled < total) {
        toast.warning(
          `Filled ${filled} of ${total} slots — not enough variety to satisfy all constraints.`,
        );
      } else {
        toast.success("Plan filled.");
      }
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
    },
  });

  const dates = useMemo(() => {
    const plan = planQuery.data?.plan;
    if (!plan) return [] as Date[];
    const out: Date[] = [];
    let cursor = parseISO(plan.start_date);
    const end = parseISO(plan.end_date);
    while (cursor.getTime() <= end.getTime()) {
      out.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return out;
  }, [planQuery.data?.plan]);

  const weekChunks = useMemo(() => alignWeekChunks(dates), [dates]);

  if (planQuery.isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-6 pb-16">
        <div className="flex items-center justify-between py-4">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="mb-3 h-9 w-1/2" />
        <Skeleton className="mb-6 h-4 w-1/3" />
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
        >
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-[110px] w-full" />
              <Skeleton className="h-[110px] w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (!planQuery.data) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h2 className="font-display text-2xl">Plan not found</h2>
        <Button asChild className="mt-4">
          <Link to="/plans">Back to plans</Link>
        </Button>
      </div>
    );
  }

  const { plan } = planQuery.data;
  const slots = slotsQuery.data ?? [];
  const cuisineByRecipeId = cuisineMapQuery.data ?? new Map();

  return (
    <div className="mx-auto max-w-7xl px-6 pb-16">
      <div className="flex items-center justify-between py-4">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="gap-1.5 text-muted-foreground"
        >
          <Link to="/plans">
            <ChevronLeft className="h-4 w-4" />
            Plans
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <AutoFillBar
            balance={settings.plannerBalance}
            onBalanceChange={(v) => settings.set({ plannerBalance: v })}
            varietyWeight={settings.varietyWeight}
            onVarietyChange={(v) => settings.set({ varietyWeight: v })}
            recentlyCookedDays={settings.recentlyCookedDays}
            onRecentlyCookedDaysChange={(v) =>
              settings.set({ recentlyCookedDays: v })
            }
            preserveLocked={preserveLocked}
            onPreserveLockedChange={setPreserveLocked}
            onAutoFill={() => autoFillMutation.mutate()}
            isRunning={autoFillMutation.isPending}
          />
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link
              to="/plans/$planId/shopping"
              params={{ planId: String(plan.id) }}
            >
              <ShoppingBasket className="h-4 w-4" />
              Shopping list
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete plan"
            onClick={() => setConfirmDeletePlan(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <header className="mb-6">
        <h1 className="font-display text-3xl font-medium tracking-tight">
          {plan.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {format(parseISO(plan.start_date), "EEE, MMM d")} —{" "}
          {format(parseISO(plan.end_date), "EEE, MMM d, yyyy")} ·{" "}
          {dates.length} day{dates.length === 1 ? "" : "s"}
        </p>
      </header>

      <DndContext
        sensors={dndSensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4">
          <div className="min-w-0 flex-1 space-y-8">
            {weekChunks.map((week, idx) => (
              <CalendarGrid
                key={idx}
                plan={plan}
                dates={week}
                slots={slots}
                cuisineByRecipeId={cuisineByRecipeId}
                activeSlotId={activeSlotId}
                onPickRecipe={(p) => setPicker(p)}
                onClearSlot={(slotId) =>
                  setRecipeMutation.mutate({
                    slotId,
                    recipeId: null,
                    servings: null,
                  })
                }
                onAddBreakfast={(date) =>
                  ensureBreakfastMutation.mutate(date)
                }
                onAddLunch={(date) => ensureLunchMutation.mutate(date)}
                onRemoveOptionalSlot={(slotId) =>
                  removeSlotMutation.mutate(slotId)
                }
                onEditServings={(slotId, current) =>
                  setServingsEditor({ slotId, initial: current })
                }
                onToggleLock={(slotId, locked) =>
                  lockMutation.mutate({ slotId, locked })
                }
              />
            ))}
          </div>
          <LibraryPanel
            recipes={libraryRecipesQuery.data ?? []}
            activeRecipeId={activeRecipeId}
          />
        </div>
      </DndContext>

      <RecipePicker
        open={picker !== null}
        onOpenChange={(next) => !next && setPicker(null)}
        title={
          picker
            ? `${slotLabel(picker.slot)} for ${format(
                parseISO(picker.date),
                "EEEE, MMM d",
              )}`
            : undefined
        }
        onPick={async (recipe: Recipe) => {
          if (!picker) return;
          const target = await findOrCreateSlot(id, picker.date, picker.slot);
          await setSlotRecipe(target.id, recipe.id, recipe.base_servings);
          setPicker(null);
          refresh();
        }}
      />

      <ServingsEditor
        open={servingsEditor !== null}
        onOpenChange={(next) => !next && setServingsEditor(null)}
        initial={servingsEditor?.initial ?? 4}
        onSave={(value) => {
          if (!servingsEditor) return;
          servingsMutation.mutate({
            slotId: servingsEditor.slotId,
            servings: value,
          });
          setServingsEditor(null);
        }}
      />

      <Dialog
        open={confirmDeletePlan}
        onOpenChange={(next) => !next && setConfirmDeletePlan(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Delete this plan?
            </DialogTitle>
            <DialogDescription>
              "{plan.name}" and all of its assigned slots and shopping list
              snapshots will be removed. The recipes themselves stay in your
              library.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmDeletePlan(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deletePlanMutation.isPending}
              onClick={() => deletePlanMutation.mutate()}
            >
              {deletePlanMutation.isPending ? "Deleting…" : "Delete plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function slotLabel(slot: MealSlotKind): string {
  switch (slot) {
    case "breakfast":
      return "Breakfast";
    case "lunch":
      return "Lunch";
    case "dinner":
      return "Dinner";
  }
}

async function buildCuisineByRecipeMap(): Promise<Map<number, string | null>> {
  const db = await getDb();
  const rows = await db.select<
    Array<{ recipe_id: number; name: string }>
  >(
    `SELECT rc.recipe_id, c.name
     FROM recipe_categories rc
     JOIN categories c ON c.id = rc.category_id
     WHERE c.kind = 'cuisine'`,
  );
  const map = new Map<number, string | null>();
  for (const row of rows) {
    if (!map.has(row.recipe_id)) map.set(row.recipe_id, row.name);
  }
  return map;
}
