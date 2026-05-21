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
  setItemChecked,
  extractExtraId,
} from "@/lib/db/globalShoppingRepo";
import { toPlainText, type ShoppingItem } from "@/lib/shopping";
import { printCurrentWindow } from "@/lib/print";
import { cn } from "@/lib/cn";

/**
 * Aisles offered in the "add an item" form. Matches the canonical aisle
 * order used elsewhere so the manually added item lands next to similar
 * recipe-derived ingredients.
 */
const AISLE_OPTIONS = [
  "Produce",
  "Meat & Seafood",
  "Dairy & Eggs",
  "Bakery",
  "Pantry & Dry Goods",
  "Spices & Oils",
  "Frozen",
  "Beverages",
  "Other",
];

export function GlobalShoppingRoute() {
  const queryClient = useQueryClient();
  const listQuery = useQuery({
    queryKey: ["global-shopping"],
    queryFn: generateGlobalShoppingList,
  });

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
  const removeExtraMutation = useMutation({
    mutationFn: async (id: number) => removeExtraItem(id),
    onSuccess: refresh,
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
          Shopping list
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
              {recipes.map((entry) => (
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
                      {entry.scaledServings} serving
                      {entry.scaledServings === 1 ? "" : "s"}
                    </span>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${entry.recipe.title}`}
                    onClick={() => removeRecipeMutation.mutate(entry.entryId)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
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
                    onToggle={() => onToggle(item.id)}
                    onRemoveExtra={() => {
                      const numericId = extractExtraId(item.id);
                      if (numericId != null) {
                        removeExtraMutation.mutate(numericId);
                      }
                    }}
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
  onToggle,
  onRemoveExtra,
}: {
  item: ShoppingItem;
  checked: boolean;
  onToggle: () => void;
  onRemoveExtra: () => void;
}) {
  const isExtra = item.id.startsWith("extra-");
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
  onAdd,
}: {
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
  const [aisle, setAisle] = useState("Other");
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
          {AISLE_OPTIONS.map((a) => (
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
