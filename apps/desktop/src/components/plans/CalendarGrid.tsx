import { useEffect, useMemo, useState } from "react";
import { format, isSameDay } from "date-fns";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  Lock,
  NotebookPen,
  Pencil,
  Plus,
  Trash2,
  Unlock,
  X,
} from "lucide-react";
import type { MealPlan, MealSlotKind } from "@/lib/db/schema";
import type {
  PlanSlotRecipeAttachment,
  PlanSlotWithRecipes,
} from "@/lib/db/planRepo";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/cn";

const CUISINE_BG: Record<string, string> = {
  Italian: "bg-cuisine-italian/15 border-cuisine-italian/40",
  Mexican: "bg-cuisine-mexican/15 border-cuisine-mexican/40",
  "Asian - Chinese": "bg-cuisine-asian/15 border-cuisine-asian/40",
  "Asian - Japanese": "bg-cuisine-asian/15 border-cuisine-asian/40",
  "Asian - Thai": "bg-cuisine-asian/15 border-cuisine-asian/40",
  "Asian - Korean": "bg-cuisine-asian/15 border-cuisine-asian/40",
  "Asian - Vietnamese": "bg-cuisine-asian/15 border-cuisine-asian/40",
  Indian: "bg-cuisine-indian/15 border-cuisine-indian/40",
  Mediterranean: "bg-cuisine-mediterranean/15 border-cuisine-mediterranean/40",
  American: "bg-cuisine-american/15 border-cuisine-american/40",
  French: "bg-cuisine-french/15 border-cuisine-french/40",
  "Middle Eastern":
    "bg-cuisine-middleeastern/15 border-cuisine-middleeastern/40",
};

interface Props {
  plan: MealPlan;
  dates: Date[];
  slots: PlanSlotWithRecipes[];
  cuisineByRecipeId: Map<number, string | null>;
  /** Attachment id of an in-flight drag — drives visual fade. Null when idle. */
  activeAttachmentId: number | null;
  /** Per-day note text keyed by ISO date. Missing key == no note. */
  dayNotes: Map<string, string>;
  onPickRecipe: (params: {
    date: string;
    slot: MealSlotKind;
  }) => void;
  onClearSlot: (slotId: number) => void;
  onAddBreakfast: (date: string) => void;
  onAddLunch: (date: string) => void;
  onRemoveOptionalSlot: (slotId: number) => void;
  /** Edit servings on a specific attachment within a slot. */
  onEditAttachmentServings: (
    attachmentId: number,
    current: number,
  ) => void;
  onToggleLock: (slotId: number, locked: boolean) => void;
  /** Remove one recipe attachment from a slot (not the whole slot). */
  onDetachRecipe: (attachmentId: number) => void;
  /** Persist a per-day note. Empty string deletes it. */
  onChangeDayNote: (date: string, notes: string) => void;
}

export function CalendarGrid({
  plan: _plan,
  dates,
  slots,
  cuisineByRecipeId,
  activeAttachmentId,
  dayNotes,
  onPickRecipe,
  onClearSlot,
  onAddBreakfast,
  onAddLunch,
  onRemoveOptionalSlot,
  onEditAttachmentServings,
  onToggleLock,
  onDetachRecipe,
  onChangeDayNote,
}: Props) {
  const slotsByDate = useMemo(() => {
    const map = new Map<string, PlanSlotWithRecipes[]>();
    for (const s of slots) {
      const arr = map.get(s.date) ?? [];
      arr.push(s);
      map.set(s.date, arr);
    }
    return map;
  }, [slots]);

  return (
    <>
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: `repeat(${Math.min(dates.length, 7)}, minmax(0, 1fr))`,
        }}
      >
        {dates.map((date) => {
          const dateString = format(date, "yyyy-MM-dd");
          const daySlots = slotsByDate.get(dateString) ?? [];
          const breakfast = daySlots.find((s) => s.slot === "breakfast");
          const lunch = daySlots.find((s) => s.slot === "lunch");
          const dinner = daySlots.find((s) => s.slot === "dinner");
          const isToday = isSameDay(date, new Date());
          return (
            <div key={dateString} className="flex flex-col gap-2">
              <header
                className={cn(
                  "flex items-center justify-between text-xs",
                  isToday ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span className="uppercase tracking-wider">
                  {format(date, "EEE")}
                </span>
                <span className="font-display text-base text-foreground">
                  {format(date, "d")}
                </span>
              </header>

              <DayNote
                value={dayNotes.get(dateString) ?? ""}
                onSave={(next) => onChangeDayNote(dateString, next)}
              />

              {breakfast ? (
                <SlotCell
                  label="Breakfast"
                  slot={breakfast}
                  cuisineByRecipeId={cuisineByRecipeId}
                  activeAttachmentId={activeAttachmentId}
                  onPick={() =>
                    onPickRecipe({ date: dateString, slot: "breakfast" })
                  }
                  onClear={() => onClearSlot(breakfast.id)}
                  onRemoveOptionalSlot={() =>
                    onRemoveOptionalSlot(breakfast.id)
                  }
                  onEditAttachmentServings={onEditAttachmentServings}
                  onToggleLock={(locked) =>
                    onToggleLock(breakfast.id, locked)
                  }
                  onDetachRecipe={onDetachRecipe}
                  showRemoveOptionalSlot
                />
              ) : (
                <AddSlotButton
                  label="Add breakfast"
                  onClick={() => onAddBreakfast(dateString)}
                />
              )}

              {lunch ? (
                <SlotCell
                  label="Lunch"
                  slot={lunch}
                  cuisineByRecipeId={cuisineByRecipeId}
                  activeAttachmentId={activeAttachmentId}
                  onPick={() =>
                    onPickRecipe({ date: dateString, slot: "lunch" })
                  }
                  onClear={() => onClearSlot(lunch.id)}
                  onRemoveOptionalSlot={() => onRemoveOptionalSlot(lunch.id)}
                  onEditAttachmentServings={onEditAttachmentServings}
                  onToggleLock={(locked) => onToggleLock(lunch.id, locked)}
                  onDetachRecipe={onDetachRecipe}
                  showRemoveOptionalSlot
                />
              ) : (
                <AddSlotButton
                  label="Add lunch"
                  onClick={() => onAddLunch(dateString)}
                />
              )}

              {dinner && (
                <SlotCell
                  label="Dinner"
                  slot={dinner}
                  cuisineByRecipeId={cuisineByRecipeId}
                  activeAttachmentId={activeAttachmentId}
                  onPick={() =>
                    onPickRecipe({ date: dateString, slot: "dinner" })
                  }
                  onClear={() => onClearSlot(dinner.id)}
                  onEditAttachmentServings={onEditAttachmentServings}
                  onToggleLock={(locked) => onToggleLock(dinner.id, locked)}
                  onDetachRecipe={onDetachRecipe}
                />
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

interface SlotCellProps {
  label: string;
  slot: PlanSlotWithRecipes;
  cuisineByRecipeId: Map<number, string | null>;
  activeAttachmentId: number | null;
  onPick: () => void;
  onClear: () => void;
  onRemoveOptionalSlot?: () => void;
  onEditAttachmentServings: (
    attachmentId: number,
    current: number,
  ) => void;
  onToggleLock: (locked: boolean) => void;
  onDetachRecipe: (attachmentId: number) => void;
  showRemoveOptionalSlot?: boolean;
}

function AddSlotButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex h-7 items-center justify-center gap-1 rounded-md border border-dashed text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Plus className="h-3 w-3" />
      {label}
    </button>
  );
}

function SlotCell({
  label,
  slot,
  cuisineByRecipeId,
  activeAttachmentId,
  onPick,
  onClear,
  onRemoveOptionalSlot,
  onEditAttachmentServings,
  onToggleLock,
  onDetachRecipe,
  showRemoveOptionalSlot,
}: SlotCellProps) {
  const droppable = useDroppable({
    id: `drop-${slot.id}`,
    data: { date: slot.date, slot: slot.slot, slotId: slot.id },
  });

  const hasRecipes = slot.recipes.length > 0;

  return (
    <div
      ref={droppable.setNodeRef}
      className={cn(
        "min-h-[110px] rounded-lg border bg-card p-2 transition-colors",
        droppable.isOver && "ring-2 ring-primary ring-offset-2",
      )}
    >
      <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        <div className="flex items-center gap-0.5">
          {hasRecipes && (
            <button
              type="button"
              aria-label={slot.is_locked ? "Unlock slot" : "Lock slot"}
              onClick={() => onToggleLock(!slot.is_locked)}
              className={cn(
                "rounded p-1 transition-colors",
                slot.is_locked
                  ? "text-amber-500"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {slot.is_locked ? (
                <Lock className="h-3 w-3" />
              ) : (
                <Unlock className="h-3 w-3" />
              )}
            </button>
          )}
          {hasRecipes && slot.recipes.length > 1 && (
            <button
              type="button"
              aria-label="Clear all recipes from slot"
              onClick={onClear}
              className="rounded p-1 text-muted-foreground hover:text-foreground"
              title="Clear all recipes from this slot"
            >
              <X className="h-3 w-3" />
            </button>
          )}
          {showRemoveOptionalSlot && (
            <button
              type="button"
              aria-label={`Remove ${label.toLowerCase()} slot`}
              onClick={onRemoveOptionalSlot}
              className="rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {hasRecipes ? (
        <div className="mt-1.5 flex flex-col gap-1.5">
          {slot.recipes.map((attachment) => {
            const cuisineName = cuisineByRecipeId.get(attachment.recipe.id);
            const cuisineCls = (cuisineName && CUISINE_BG[cuisineName]) ?? "";
            return (
              <DraggableRecipe
                key={attachment.attachmentId}
                attachment={attachment}
                cuisineCls={cuisineCls}
                isDragging={activeAttachmentId === attachment.attachmentId}
                onDetach={() => onDetachRecipe(attachment.attachmentId)}
                onEditServings={(current) =>
                  onEditAttachmentServings(
                    attachment.attachmentId,
                    current,
                  )
                }
              />
            );
          })}
          <button
            onClick={onPick}
            className="flex h-6 items-center justify-center gap-1 rounded-md border border-dashed text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Add another recipe to this slot"
          >
            <Plus className="h-3 w-3" />
            Add recipe
          </button>
        </div>
      ) : (
        <button
          onClick={onPick}
          className="mt-1.5 flex min-h-[60px] w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          Pick recipe
        </button>
      )}
    </div>
  );
}

function DraggableRecipe({
  attachment,
  cuisineCls,
  isDragging,
  onDetach,
  onEditServings,
}: {
  attachment: PlanSlotRecipeAttachment;
  cuisineCls: string;
  isDragging: boolean;
  onDetach: () => void;
  onEditServings: (current: number) => void;
}) {
  // Prefix the id with `att-` so the drag handler in PlanDetailRoute
  // can distinguish slot-attachment drags (`att-${attachmentId}`) from
  // library drags (`lib-${recipeId}`).
  const draggable = useDraggable({
    id: `att-${attachment.attachmentId}`,
    data: { kind: "attachment", attachmentId: attachment.attachmentId },
  });
  const servings =
    attachment.scaledServings ?? attachment.recipe.base_servings;
  return (
    <div
      ref={draggable.setNodeRef}
      style={{
        transform: draggable.transform
          ? `translate(${draggable.transform.x}px, ${draggable.transform.y}px)`
          : undefined,
        opacity: isDragging ? 0.5 : 1,
      }}
      {...draggable.listeners}
      {...draggable.attributes}
      className={cn(
        "group cursor-grab rounded-md border p-2 active:cursor-grabbing",
        cuisineCls || "border-border bg-background",
      )}
    >
      <p className="line-clamp-2 text-sm font-medium leading-snug">
        {attachment.recipe.title}
      </p>
      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{servings} servings</span>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              onEditServings(servings);
            }}
            aria-label="Edit servings"
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              onDetach();
            }}
            aria-label="Remove recipe from slot"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Tiny per-day notes affordance: starts collapsed (a subtle "+ Note"
 * button or a one-line preview), expands into a textarea on click,
 * and commits on blur. Blurring with empty text deletes the note —
 * the parent treats "" as a deletion sentinel and won't store noise.
 *
 * `value` is the persisted value; we keep a local `draft` so the user
 * can edit freely without each keystroke flushing to the DB.
 */
function DayNote({
  value,
  onSave,
}: {
  value: string;
  onSave: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next !== value.trim()) onSave(next);
  };

  if (!editing) {
    if (value.trim()) {
      return (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="line-clamp-2 rounded-md border border-dashed border-border/60 bg-muted/30 px-2 py-1 text-left text-[11px] leading-snug text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          title="Edit day note"
        >
          {value}
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex h-6 items-center justify-center gap-1 rounded-md border border-dashed text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <NotebookPen className="h-3 w-3" />
        Note
      </button>
    );
  }

  return (
    <Textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          (e.currentTarget as HTMLTextAreaElement).blur();
        }
      }}
      placeholder="Notes for the day…"
      autoFocus
      rows={2}
      maxLength={2_000}
      className="min-h-[44px] text-[11px] leading-snug"
    />
  );
}

function startOfWeekIndex(date: Date): number {
  // Make Monday = 0 so weeks render Monday-first in the grid.
  const day = date.getDay();
  return (day + 6) % 7;
}

/**
 * Split a contiguous run of dates into Monday-aligned weeks of up to
 * seven days. Used by the planner to lay out a plan that may start
 * mid-week — the leading null cells are filtered out, but the
 * alignment still pushes the first real date into the right column.
 */
export function alignWeekChunks(dates: Date[]): Date[][] {
  if (dates.length === 0) return [];
  const first = dates[0];
  if (!first) return [];
  const offset = startOfWeekIndex(first);
  const padded: Array<Date | null> = Array(offset).fill(null);
  padded.push(...dates);
  while (padded.length % 7 !== 0) padded.push(null);
  const chunks: Date[][] = [];
  for (let i = 0; i < padded.length; i += 7) {
    chunks.push(padded.slice(i, i + 7).filter((d): d is Date => d !== null));
  }
  return chunks;
}
