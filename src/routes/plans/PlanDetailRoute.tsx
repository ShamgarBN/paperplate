import { useMemo, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, parseISO } from "date-fns";
import {
  Check,
  ChevronLeft,
  Copy,
  Pencil,
  ShoppingBasket,
  Trash2,
  X,
} from "lucide-react";
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
import { Input } from "@/components/ui/Input";
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
  attachRecipeToSlot,
  deletePlan,
  detachRecipeFromSlot,
  duplicatePlan,
  ensureBreakfastSlot,
  ensureLunchSlot,
  findOrCreateSlot,
  getPlan,
  getPlanSlotsWithRecipes,
  listDayNotes,
  moveAttachmentToSlot,
  removeSlot,
  renamePlan,
  setAttachmentServings,
  setDayNote,
  setSlotLocked,
  setSlotRecipe,
} from "@/lib/db/planRepo";
import { loadPlannerRecipes } from "@/lib/db/plannerRepo";
import { listRecipes } from "@/lib/db/recipeRepo";
import { autoSelect } from "@/lib/planner/autoSelect";
import type { MealSlotKind, Recipe } from "@/lib/db/schema";
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

  const dayNotesQuery = useQuery({
    queryKey: ["plan-day-notes", id],
    queryFn: () => listDayNotes(id),
    enabled: Number.isFinite(id),
  });

  const setDayNoteMutation = useMutation({
    mutationFn: async (params: { date: string; notes: string }) =>
      setDayNote(id, params.date, params.notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plan-day-notes", id] });
    },
    onError: (err) =>
      toast.error(
        `Could not save note: ${err instanceof Error ? err.message : String(err)}`,
      ),
  });

  const [picker, setPicker] = useState<{
    date: string;
    slot: MealSlotKind;
  } | null>(null);
  const [servingsEditor, setServingsEditor] = useState<{
    attachmentId: number;
    initial: number;
  } | null>(null);
  const [confirmDeletePlan, setConfirmDeletePlan] = useState(false);
  const [activeAttachmentId, setActiveAttachmentId] = useState<number | null>(
    null,
  );
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
    if (id.startsWith("att-")) {
      setActiveAttachmentId(Number(id.slice(4)) || null);
    } else if (id.startsWith("lib-")) {
      setActiveRecipeId(Number(id.slice(4)) || null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveAttachmentId(null);
    setActiveRecipeId(null);
    const target = event.over?.data.current as
      | { date: string; slot: MealSlotKind; slotId?: number }
      | undefined;
    if (!target) return;
    const sourceId = String(event.active.id);
    if (sourceId.startsWith("att-")) {
      const attachmentId = Number(sourceId.slice(4));
      if (!attachmentId) return;
      moveAttachmentMutation.mutate({
        attachmentId,
        toDate: target.date,
        toSlot: target.slot,
      });
    } else if (sourceId.startsWith("lib-")) {
      const recipeId = Number(sourceId.slice(4));
      if (!recipeId) return;
      attachFromLibraryMutation.mutate({
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

  const attachmentServingsMutation = useMutation({
    mutationFn: async (params: {
      attachmentId: number;
      servings: number | null;
    }) => setAttachmentServings(params.attachmentId, params.servings),
    onSuccess: refresh,
  });

  const detachRecipeMutation = useMutation({
    mutationFn: async (attachmentId: number) =>
      detachRecipeFromSlot(attachmentId),
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

  const moveAttachmentMutation = useMutation({
    mutationFn: async (params: {
      attachmentId: number;
      toDate: string;
      toSlot: MealSlotKind;
    }) =>
      withWriteLock(async () => {
        const target = await findOrCreateSlot(
          id,
          params.toDate,
          params.toSlot,
        );
        await moveAttachmentToSlot(params.attachmentId, target.id);
      }),
    onSuccess: refresh,
    onError: (err) =>
      toast.error(
        `Could not move recipe: ${err instanceof Error ? err.message : String(err)}`,
      ),
  });

  const attachFromLibraryMutation = useMutation({
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
        await attachRecipeToSlot(target.id, params.recipeId, servings);
      }),
    onSuccess: refresh,
    onError: (err) =>
      toast.error(
        `Could not attach recipe: ${err instanceof Error ? err.message : String(err)}`,
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

  const renamePlanMutation = useMutation({
    mutationFn: async (name: string) => renamePlan(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plan", id] });
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      toast.success("Plan renamed.");
    },
    onError: (err) =>
      toast.error(
        `Could not rename plan: ${err instanceof Error ? err.message : String(err)}`,
      ),
  });

  const duplicatePlanMutation = useMutation({
    mutationFn: async () => duplicatePlan(id),
    onSuccess: (newId) => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      toast.success("Plan duplicated.");
      navigate({ to: "/plans/$planId", params: { planId: String(newId) } });
    },
    onError: (err) =>
      toast.error(
        `Could not duplicate plan: ${err instanceof Error ? err.message : String(err)}`,
      ),
  });

  const [renameDraft, setRenameDraft] = useState<string | null>(null);

  const settings = useSettingsStore();
  const [preserveLocked, setPreserveLocked] = useState(true);

  const autoFillMutation = useMutation({
    mutationFn: async () => {
      const planRecipes = await loadPlannerRecipes();
      if (planRecipes.length === 0) {
        throw new Error("Add some recipes to your library first.");
      }
      const currentSlots = await getPlanSlotsWithRecipes(id);
      // Auto-fill only ever produces one recipe per slot. We surface
      // the slot's *primary* attachment (position 0) to the solver so
      // it sees "is something already here?" correctly. Multi-recipe
      // slots survive because we don't include them in the writeback
      // when `preserveLocked` is true and the slot is locked.
      const plannerSlots = currentSlots.map((s) => ({
        id: s.id,
        date: s.date,
        slot: s.slot,
        recipeId:
          preserveLocked && s.is_locked
            ? s.recipes[0]?.recipe.id ?? null
            : null,
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
        {renameDraft !== null ? (
          <div className="flex items-center gap-2">
            <Input
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const trimmed = (renameDraft ?? "").trim();
                  if (trimmed && trimmed !== plan.name) {
                    renamePlanMutation.mutate(trimmed);
                  }
                  setRenameDraft(null);
                }
                if (e.key === "Escape") setRenameDraft(null);
              }}
              autoFocus
              className="h-11 max-w-xl text-2xl font-medium tracking-tight"
              maxLength={120}
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Save name"
              onClick={() => {
                const trimmed = (renameDraft ?? "").trim();
                if (trimmed && trimmed !== plan.name) {
                  renamePlanMutation.mutate(trimmed);
                }
                setRenameDraft(null);
              }}
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Cancel rename"
              onClick={() => setRenameDraft(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl font-medium tracking-tight">
              {plan.name}
            </h1>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              aria-label="Rename plan"
              onClick={() => setRenameDraft(plan.name)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              aria-label="Duplicate plan"
              onClick={() => duplicatePlanMutation.mutate()}
              disabled={duplicatePlanMutation.isPending}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        {/*
          The date range is shown on the Meal Plans list card already, so
          we don't repeat it here. We keep only the day-count summary —
          it's the bit of metadata the user actually scans for while
          working inside the plan.
        */}
        <p className="mt-1 text-sm text-muted-foreground">
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
                activeAttachmentId={activeAttachmentId}
                dayNotes={dayNotesQuery.data ?? new Map()}
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
                onEditAttachmentServings={(attachmentId, current) =>
                  setServingsEditor({ attachmentId, initial: current })
                }
                onToggleLock={(slotId, locked) =>
                  lockMutation.mutate({ slotId, locked })
                }
                onDetachRecipe={(attachmentId) =>
                  detachRecipeMutation.mutate(attachmentId)
                }
                onChangeDayNote={(date, notes) =>
                  setDayNoteMutation.mutate({ date, notes })
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
          // The picker is also reachable from the per-slot "Add recipe"
          // button when the slot already has attachments, so we append
          // rather than replacing. `attachRecipeToSlot` is a no-op if
          // the same recipe is already attached.
          await attachRecipeToSlot(
            target.id,
            recipe.id,
            recipe.base_servings,
          );
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
          attachmentServingsMutation.mutate({
            attachmentId: servingsEditor.attachmentId,
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
