import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardCopy,
  Eraser,
  Plus,
  Printer,
  ShoppingBasket,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Separator } from "@/components/ui/Separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import {
  addExtraItem,
  clearCheckedExtraItems,
  generateGlobalShoppingList,
  removeExtraItem,
  removeRecipeFromShoppingList,
  setExtraItemAisle,
  setItemChecked,
  extractExtraId,
  updateRecipeScaledServings,
} from "@/lib/db/globalShoppingRepo";
import { listAisles, setIngredientAisle } from "@/lib/db/aisleRepo";
import { toPlainText, type ShoppingItem } from "@/lib/shopping";
import { printCurrentWindow } from "@/lib/print";
import { cn } from "@/lib/cn";

/**
 * Preset scale factors the shopping list exposes per recipe. The list
 * starts smaller-than-one for "I only need half this recipe" and goes up
 * to 4× because cooks rarely scale higher in a single pass — at that
 * point you'd duplicate the recipe instead. The numeric `value` is the
 * factor used in `baseServings * value`; `label` is the user-visible
 * "1x / 2x / ½x" string.
 */
const MULTIPLIER_PRESETS: Array<{ label: string; value: number }> = [
  { label: "¼×", value: 0.25 },
  { label: "⅓×", value: 1 / 3 },
  { label: "½×", value: 0.5 },
  { label: "1×", value: 1 },
  { label: "2×", value: 2 },
  { label: "3×", value: 3 },
  { label: "4×", value: 4 },
];

/**
 * Snap an arbitrary multiplier to the closest preset so the `<Select>`
 * has a stable controlled value. Without this an off-grid value (e.g.
 * 1.6 from manually editing servings) would render the trigger as blank.
 */
function pickMultiplierPreset(multiplier: number): string {
  if (!Number.isFinite(multiplier) || multiplier <= 0) return "1";
  let closest = MULTIPLIER_PRESETS[0]!;
  let bestDist = Math.abs(multiplier - closest.value);
  for (const preset of MULTIPLIER_PRESETS) {
    const d = Math.abs(multiplier - preset.value);
    if (d < bestDist) {
      bestDist = d;
      closest = preset;
    }
  }
  return String(closest.value);
}

/**
 * Format a multiplier as a short tag for the recipe-row metadata. Falls
 * back to a single-decimal representation if the value isn't a preset,
 * so a user-edited "12 servings of a 5-serving recipe" reads "2.4×"
 * rather than rounding silently to "2×".
 */
function formatMultiplierLabel(multiplier: number): string {
  if (!Number.isFinite(multiplier) || multiplier <= 0) return "1×";
  const preset = MULTIPLIER_PRESETS.find(
    (p) => Math.abs(p.value - multiplier) < 0.02,
  );
  if (preset) return preset.label;
  // Trim trailing zeros so "1.50×" reads as "1.5×".
  return `${multiplier.toFixed(2).replace(/\.?0+$/, "")}×`;
}

/**
 * Default fallback aisle list — only used if the database hasn't been
 * populated yet (shouldn't happen in practice because the seeder runs
 * on first launch, but we keep it as a safety net so the picker never
 * renders empty).
 */
const FALLBACK_AISLE_OPTIONS = [
  "Bakery",
  "Beverages",
  "Dairy & Eggs",
  "Frozen",
  "Meat & Seafood",
  "Other",
  "Pantry & Dry Goods",
  "Produce",
  "Spices & Oils",
];

export function GlobalShoppingRoute() {
  const queryClient = useQueryClient();
  const listQuery = useQuery({
    queryKey: ["global-shopping"],
    queryFn: generateGlobalShoppingList,
  });
  const aislesQuery = useQuery({
    queryKey: ["aisles"],
    queryFn: listAisles,
  });
  const aisleOptions =
    aislesQuery.data && aislesQuery.data.length > 0
      ? aislesQuery.data.map((a) => a.name)
      : FALLBACK_AISLE_OPTIONS;

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["global-shopping"] });

  const checkMutation = useMutation({
    mutationFn: async (params: { itemId: string; isChecked: boolean }) =>
      setItemChecked(params.itemId, params.isChecked),
    onSuccess: refresh,
  });
  const removeRecipeMutation = useMutation({
    mutationFn: async (entryId: number) =>
      removeRecipeFromShoppingList(entryId),
    onSuccess: () => {
      refresh();
      toast.success("Recipe removed from list.");
    },
  });
  const scaleRecipeMutation = useMutation({
    mutationFn: async (params: { entryId: number; scaledServings: number }) =>
      updateRecipeScaledServings(params.entryId, params.scaledServings),
    onSuccess: () => {
      refresh();
      toast.success("Recipe scaling updated.");
    },
    onError: (err) =>
      toast.error(
        `Could not change scaling: ${err instanceof Error ? err.message : String(err)}`,
      ),
  });
  const removeExtraMutation = useMutation({
    mutationFn: async (id: number) => removeExtraItem(id),
    onSuccess: refresh,
  });
  const reassignAisleMutation = useMutation({
    mutationFn: async (params: {
      itemId: string;
      itemCanonical: string;
      aisleName: string;
    }) => {
      const extraId = extractExtraId(params.itemId);
      if (extraId != null) {
        // Standalone item: the aisle lives directly on the row.
        await setExtraItemAisle(extraId, params.aisleName);
        return;
      }
      // Aggregate item: persist the override so future imports of the
      // same canonical ingredient also land in the chosen aisle.
      const ok = await setIngredientAisle(
        params.itemCanonical,
        params.aisleName,
      );
      if (!ok) {
        throw new Error(`Aisle "${params.aisleName}" no longer exists`);
      }
    },
    onSuccess: () => {
      refresh();
      toast.success("Aisle updated.");
    },
    onError: (err) =>
      toast.error(
        `Could not move item: ${err instanceof Error ? err.message : String(err)}`,
      ),
  });
  const clearCheckedMutation = useMutation({
    mutationFn: async () => clearCheckedExtraItems(),
    onSuccess: (count) => {
      refresh();
      toast.success(
        count > 0
          ? `Cleared ${count} checked item${count === 1 ? "" : "s"}.`
          : "No checked items to clear.",
      );
    },
  });

  const items = listQuery.data?.items ?? [];
  const checked = listQuery.data?.checked ?? {};
  const recipes = listQuery.data?.recipes ?? [];

  const grouped = useMemo(() => groupByAisle(items), [items]);
  const remaining = items.filter((i) => !checked[i.id]).length;

  const onToggle = (itemId: string) => {
    const next = !checked[itemId];
    checkMutation.mutate({ itemId, isChecked: next });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(toPlainText(items));
      toast.success("Copied to clipboard.");
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  };

  return (
    <div
      className="mx-auto max-w-3xl px-6 pb-16 print:px-0"
      data-print-root
    >
      <div
        className="flex items-center justify-between py-4 print:hidden"
        data-print-hide
      >
        <h1 className="font-display text-3xl font-medium tracking-tight">
          Shopping List
        </h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => clearCheckedMutation.mutate()}
            disabled={clearCheckedMutation.isPending}
            className="gap-1.5"
          >
            <Eraser className="h-4 w-4" />
            Clear checked
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="gap-1.5"
          >
            <ClipboardCopy className="h-4 w-4" />
            Copy
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              printCurrentWindow().catch((err) => {
                toast.error(
                  `Could not open print dialog: ${err instanceof Error ? err.message : String(err)}`,
                );
              });
            }}
            className="gap-1.5"
          >
            <Printer className="h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground print:hidden" data-print-hide>
        {items.length === 0
          ? "Add a recipe or a one-off item to start building your list."
          : `${remaining} of ${items.length} items remaining`}
      </p>

      <Card className="my-4 print:hidden" data-print-hide>
        <CardContent className="space-y-3 p-4">
          <h2 className="font-display text-lg">Add an item</h2>
          <AddItemForm
            aisleOptions={aisleOptions}
            onAdd={async (input) => {
              try {
                await addExtraItem(input);
                refresh();
                toast.success("Item added.");
              } catch (err) {
                toast.error(
                  `Could not add item: ${err instanceof Error ? err.message : String(err)}`,
                );
              }
            }}
          />
        </CardContent>
      </Card>

      {recipes.length > 0 && (
        <Card className="my-4 print:hidden" data-print-hide>
          <CardContent className="space-y-2 p-4">
            <h2 className="font-display text-lg">Recipes on this list</h2>
            <ul className="space-y-1.5">
              {recipes.map((entry) => {
                const baseServings = entry.recipe.base_servings;
                const multiplier =
                  baseServings > 0 ? entry.scaledServings / baseServings : 1;
                return (
                  <li
                    key={entry.entryId}
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-accent/40"
                  >
                    <Link
                      to="/recipes/$recipeId"
                      params={{ recipeId: String(entry.recipe.id) }}
                      className="flex-1 text-sm hover:underline"
                    >
                      {entry.recipe.title}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {formatMultiplierLabel(multiplier)} ·{" "}
                        {entry.scaledServings} serving
                        {entry.scaledServings === 1 ? "" : "s"}
                      </span>
                    </Link>
                    <Select
                      value={pickMultiplierPreset(multiplier)}
                      onValueChange={(next) => {
                        const factor = Number(next);
                        if (!Number.isFinite(factor) || factor <= 0) return;
                        scaleRecipeMutation.mutate({
                          entryId: entry.entryId,
                          scaledServings: Math.max(
                            1,
                            Math.round(baseServings * factor),
                          ),
                        });
                      }}
                    >
                      <SelectTrigger
                        aria-label={`Adjust scaling for ${entry.recipe.title}`}
                        className="h-8 w-24 text-xs"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MULTIPLIER_PRESETS.map((preset) => (
                          <SelectItem
                            key={preset.value}
                            value={String(preset.value)}
                          >
                            {preset.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${entry.recipe.title}`}
                      onClick={() => removeRecipeMutation.mutate(entry.entryId)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
            <p className="px-2 text-[11px] text-muted-foreground">
              The multiplier scales how much of each ingredient lands on the
              list — handy when you're prepping multiple batches.
            </p>
          </CardContent>
        </Card>
      )}

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-12 text-center text-sm text-muted-foreground">
            <ShoppingBasket className="h-6 w-6" />
            <p>Your shopping list is empty.</p>
            <p className="text-xs">
              Open a recipe and tap{" "}
              <span className="font-medium">Add to shopping list</span>, or use
              the form above for one-off items.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <section key={group.aisle}>
              <h2 className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {group.aisle}
              </h2>
              <ul className="space-y-1.5 rounded-lg border bg-card/40 p-2 print:border-none print:bg-transparent">
                {group.items.map((item) => (
                  <ShoppingRow
                    key={item.id}
                    item={item}
                    checked={!!checked[item.id]}
                    aisleOptions={aisleOptions}
                    onToggle={() => onToggle(item.id)}
                    onRemoveExtra={() => {
                      const numericId = extractExtraId(item.id);
                      if (numericId != null) {
                        removeExtraMutation.mutate(numericId);
                      }
                    }}
                    onReassignAisle={(nextAisle) =>
                      reassignAisleMutation.mutate({
                        itemId: item.id,
                        itemCanonical: item.itemCanonical,
                        aisleName: nextAisle,
                      })
                    }
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Separator className="my-8 print:hidden" data-print-hide />
      <p
        className="text-[11px] text-muted-foreground print:hidden"
        data-print-hide
      >
        Items checked off or older than 30 days are automatically cleared on
        next launch.
      </p>

      <PrintStyles />
    </div>
  );
}

function ShoppingRow({
  item,
  checked,
  aisleOptions,
  onToggle,
  onRemoveExtra,
  onReassignAisle,
}: {
  item: ShoppingItem;
  checked: boolean;
  aisleOptions: string[];
  onToggle: () => void;
  onRemoveExtra: () => void;
  onReassignAisle: (next: string) => void;
}) {
  const isExtra = item.id.startsWith("extra-");
  // Make sure the row's current aisle is in the option list even if it's
  // been deleted from settings — otherwise the picker would silently flip
  // to the first option and look unset.
  const options = aisleOptions.includes(item.aisle)
    ? aisleOptions
    : [...aisleOptions, item.aisle];
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors",
        checked && "opacity-50",
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={onToggle}
        aria-label={`Toggle ${item.itemDisplay}`}
      />
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex-1 text-left text-sm",
          checked && "line-through",
        )}
      >
        {item.display}
        {item.isOptional && (
          <span className="ml-1 text-xs text-muted-foreground">(optional)</span>
        )}
      </button>
      {item.contributors.length > 0 && !isExtra && (
        <span
          className="hidden truncate text-[11px] text-muted-foreground sm:inline print:hidden"
          title={item.contributors.join(", ")}
        >
          for {item.contributors[0]}
          {item.contributors.length > 1
            ? ` +${item.contributors.length - 1}`
            : ""}
        </span>
      )}
      <Select
        value={item.aisle}
        onValueChange={(next) => {
          if (next !== item.aisle) onReassignAisle(next);
        }}
      >
        <SelectTrigger
          aria-label={`Move ${item.itemDisplay} to a different aisle`}
          className="h-7 w-[7.5rem] gap-1 border-none bg-transparent px-1.5 text-[11px] text-muted-foreground hover:bg-muted/60 hover:text-foreground focus:ring-1 print:hidden"
          data-print-hide
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((a) => (
            <SelectItem key={a} value={a}>
              {a}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isExtra && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Remove item"
          onClick={onRemoveExtra}
          className="h-7 w-7 text-muted-foreground hover:text-destructive print:hidden"
          data-print-hide
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </li>
  );
}

function AddItemForm({
  aisleOptions,
  onAdd,
}: {
  aisleOptions: string[];
  onAdd: (input: {
    name: string;
    quantity: number | null;
    unit: string | null;
    aisle: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  // Default to "Other" when it's present (it's the universal fallback);
  // otherwise pick the alphabetical first entry so the picker is never
  // unset.
  const fallback =
    aisleOptions.find((a) => a.toLowerCase() === "other") ??
    aisleOptions[0] ??
    "Other";
  const [aisle, setAisle] = useState(fallback);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      // Quantity is optional; an empty string means "no quantity".
      const numericQty = quantity.trim() ? Number(quantity) : NaN;
      await onAdd({
        name: trimmed,
        quantity: Number.isFinite(numericQty) ? numericQty : null,
        unit: unit.trim() || null,
        aisle,
      });
      setName("");
      setQuantity("");
      setUnit("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_5rem_5rem_8rem_auto]">
      <div>
        <Label htmlFor="extra-name" className="sr-only">
          Item name
        </Label>
        <Input
          id="extra-name"
          placeholder="e.g. paper towels"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) submit();
          }}
          maxLength={200}
        />
      </div>
      <Input
        type="number"
        inputMode="decimal"
        placeholder="Qty"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        aria-label="Quantity"
        min={0}
        step="any"
      />
      <Input
        placeholder="Unit"
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
        aria-label="Unit"
        maxLength={20}
      />
      <Select value={aisle} onValueChange={setAisle}>
        <SelectTrigger aria-label="Aisle">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {aisleOptions.map((a) => (
            <SelectItem key={a} value={a}>
              {a}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button onClick={submit} disabled={submitting || !name.trim()} className="gap-1.5">
        <Plus className="h-4 w-4" />
        Add
      </Button>
    </div>
  );
}

function groupByAisle(
  items: ShoppingItem[],
): Array<{ aisle: string; items: ShoppingItem[] }> {
  const map = new Map<string, ShoppingItem[]>();
  for (const item of items) {
    const arr = map.get(item.aisle) ?? [];
    arr.push(item);
    map.set(item.aisle, arr);
  }
  return [...map.entries()].map(([aisle, items]) => ({ aisle, items }));
}

function PrintStyles() {
  return (
    <style>
      {`@media print {
        body { background: #fff !important; }
        @page { margin: 0.75in; }
      }`}
    </style>
  );
}
