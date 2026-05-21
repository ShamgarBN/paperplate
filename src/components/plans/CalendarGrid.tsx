import { useMemo } from "react";
import { format, parseISO, isSameDay } from "date-fns";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Lock, Pencil, Plus, Trash2, Unlock, X } from "lucide-react";
import type { MealPlan, MealSlotKind, Recipe } from "@/lib/db/schema";
import type { PlanSlotWithRecipe } from "@/lib/db/planRepo";
import { Button } from "@/components/ui/Button";
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
  slots: PlanSlotWithRecipe[];
  cuisineByRecipeId: Map<number, string | null>;
  /** Slot id of an in-flight drag — drives visual fade. Null when idle. */
  activeSlotId: number | null;
  onPickRecipe: (params: {
    date: string;
    slot: MealSlotKind;
  }) => void;
  onClearSlot: (slotId: number) => void;
  onAddBreakfast: (date: string) => void;
  onAddLunch: (date: string) => void;
  onRemoveOptionalSlot: (slotId: number) => void;
  onEditServings: (slotId: number, current: number) => void;
  onToggleLock: (slotId: number, locked: boolean) => void;
}

export function CalendarGrid({
  plan: _plan,
  dates,
  slots,
  cuisineByRecipeId,
  activeSlotId,
  onPickRecipe,
  onClearSlot,
  onAddBreakfast,
  onAddLunch,
  onRemoveOptionalSlot,
  onEditServings,
  onToggleLock,
}: Props) {
  const slotsByDate = useMemo(() => {
    const map = new Map<string, PlanSlotWithRecipe[]>();
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

              {breakfast ? (
                <SlotCell
                  label="Breakfast"
                  slot={breakfast}
                  cuisineByRecipeId={cuisineByRecipeId}
                  isDragging={activeSlotId === breakfast.id}
                  onPick={() =>
                    onPickRecipe({ date: dateString, slot: "breakfast" })
                  }
                  onClear={() => onClearSlot(breakfast.id)}
                  onRemoveOptionalSlot={() =>
                    onRemoveOptionalSlot(breakfast.id)
                  }
                  onEditServings={(current) =>
                    onEditServings(breakfast.id, current)
                  }
                  onToggleLock={(locked) =>
                    onToggleLock(breakfast.id, locked)
                  }
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
                  isDragging={activeSlotId === lunch.id}
                  onPick={() =>
                    onPickRecipe({ date: dateString, slot: "lunch" })
                  }
                  onClear={() => onClearSlot(lunch.id)}
                  onRemoveOptionalSlot={() => onRemoveOptionalSlot(lunch.id)}
                  onEditServings={(current) =>
                    onEditServings(lunch.id, current)
                  }
                  onToggleLock={(locked) => onToggleLock(lunch.id, locked)}
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
                  isDragging={activeSlotId === dinner.id}
                  onPick={() =>
                    onPickRecipe({ date: dateString, slot: "dinner" })
                  }
                  onClear={() => onClearSlot(dinner.id)}
                  onEditServings={(current) =>
                    onEditServings(dinner.id, current)
                  }
                  onToggleLock={(locked) => onToggleLock(dinner.id, locked)}
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
  slot: PlanSlotWithRecipe;
  cuisineByRecipeId: Map<number, string | null>;
  isDragging: boolean;
  onPick: () => void;
  onClear: () => void;
  onRemoveOptionalSlot?: () => void;
  onEditServings: (current: number) => void;
  onToggleLock: (locked: boolean) => void;
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
  isDragging,
  onPick,
  onClear,
  onRemoveOptionalSlot,
  onEditServings,
  onToggleLock,
  showRemoveOptionalSlot,
}: SlotCellProps) {
  const droppable = useDroppable({
    id: `drop-${slot.id}`,
    data: { date: slot.date, slot: slot.slot },
  });

  const recipe = slot.recipe;
  const cuisineName = recipe?.id ? cuisineByRecipeId.get(recipe.id) : null;
  const cuisineCls = (cuisineName && CUISINE_BG[cuisineName]) ?? "";

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
          {recipe && (
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

      {recipe ? (
        <DraggableRecipe
          slotId={slot.id}
          recipe={recipe}
          cuisineCls={cuisineCls}
          isDragging={isDragging}
          servings={slot.scaled_servings ?? recipe.base_servings}
          onClear={onClear}
          onEditServings={onEditServings}
        />
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
  slotId,
  recipe,
  cuisineCls,
  isDragging,
  servings,
  onClear,
  onEditServings,
}: {
  slotId: number;
  recipe: Recipe;
  cuisineCls: string;
  isDragging: boolean;
  servings: number;
  onClear: () => void;
  onEditServings: (current: number) => void;
}) {
  // Prefix the id so the drag handler in PlanDetailRoute can distinguish a
  // slot-to-slot drag (`slot-${id}`) from a library-to-slot drag (`lib-${id}`).
  const draggable = useDraggable({
    id: `slot-${slotId}`,
    data: { kind: "slot", slotId },
  });
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
        "group mt-1.5 cursor-grab rounded-md border p-2 active:cursor-grabbing",
        cuisineCls || "border-border bg-background",
      )}
    >
      <p className="line-clamp-2 text-sm font-medium leading-snug">
        {recipe.title}
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
              onClear();
            }}
            aria-label="Clear slot"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function chunkDates(dates: Date[], size: number): Date[][] {
  const out: Date[][] = [];
  for (let i = 0; i < dates.length; i += size) {
    out.push(dates.slice(i, i + size));
  }
  return out;
}

export function startOfWeekIndex(date: Date) {
  const day = date.getDay();
  return (day + 6) % 7; // make Monday=0
}

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

export const _exportedForType = parseISO;
