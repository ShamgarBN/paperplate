import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  ChevronLeft,
  ClipboardCopy,
  Printer,
  RefreshCw,
  ShoppingBasket,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Separator } from "@/components/ui/Separator";
import { getPlan } from "@/lib/db/planRepo";
import {
  generateShoppingList,
  saveShoppingChecks,
  updateShoppingChecks,
} from "@/lib/db/shoppingRepo";
import {
  addPlanToGlobalShoppingList,
  countPlanEntriesOnGlobalList,
  removePlanFromGlobalShoppingList,
} from "@/lib/db/globalShoppingRepo";
import { listAisles, setIngredientAisle } from "@/lib/db/aisleRepo";
import { toPlainText, type ShoppingItem } from "@/lib/shopping";
import { printCurrentWindow } from "@/lib/print";
import { cn } from "@/lib/cn";

export function ShoppingRoute() {
  const { planId } = useParams({ from: "/plans/$planId/shopping" });
  const id = Number(planId);
  const queryClient = useQueryClient();

  const planQuery = useQuery({
    queryKey: ["plan", id],
    queryFn: () => getPlan(id),
    enabled: Number.isFinite(id),
  });

  const listQuery = useQuery({
    queryKey: ["shopping-list", id],
    queryFn: () => generateShoppingList(id),
    enabled: Number.isFinite(id),
  });
  const aislesQuery = useQuery({
    queryKey: ["aisles"],
    queryFn: listAisles,
  });
  const aisleOptions = useMemo(
    () => (aislesQuery.data ?? []).map((a) => a.name),
    [aislesQuery.data],
  );

  const onMainListQuery = useQuery({
    queryKey: ["plan-on-global-list", id],
    queryFn: () => countPlanEntriesOnGlobalList(id),
    enabled: Number.isFinite(id),
  });
  const isOnMainList = (onMainListQuery.data ?? 0) > 0;

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (isOnMainList) {
        return removePlanFromGlobalShoppingList(id);
      }
      return addPlanToGlobalShoppingList(id);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["plan-on-global-list", id] });
      queryClient.invalidateQueries({ queryKey: ["global-shopping"] });
      if ("inserted" in result) {
        toast.success(
          result.inserted === 0
            ? "Plan already on your main shopping list."
            : `Added ${result.inserted} recipe${result.inserted === 1 ? "" : "s"} to your main shopping list.`,
        );
      } else if ("removed" in result) {
        toast.success(
          result.removed === 0
            ? "Nothing to remove."
            : `Removed ${result.removed} recipe${result.removed === 1 ? "" : "s"} from your main shopping list.`,
        );
      }
    },
    onError: (err) =>
      toast.error(
        `Could not update main shopping list: ${err instanceof Error ? err.message : String(err)}`,
      ),
  });

  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [snapshotId, setSnapshotId] = useState<number | null>(null);

  useEffect(() => {
    if (listQuery.data) {
      setChecked(listQuery.data.checked);
      setSnapshotId(listQuery.data.snapshotId);
    }
  }, [listQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (next: Record<string, boolean>) => {
      const items = listQuery.data?.items ?? [];
      if (snapshotId) {
        await updateShoppingChecks(snapshotId, next, items);
        return snapshotId;
      }
      const id_ = await saveShoppingChecks(id, next, items);
      return id_;
    },
    onSuccess: (newId) => {
      setSnapshotId(newId);
    },
  });
  const reassignAisleMutation = useMutation({
    mutationFn: async (params: {
      itemCanonical: string;
      aisleName: string;
    }) => {
      const ok = await setIngredientAisle(
        params.itemCanonical,
        params.aisleName,
      );
      if (!ok) throw new Error(`Aisle "${params.aisleName}" no longer exists`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-list", id] });
      queryClient.invalidateQueries({ queryKey: ["global-shopping"] });
      toast.success("Aisle updated.");
    },
    onError: (err) =>
      toast.error(
        `Could not move item: ${err instanceof Error ? err.message : String(err)}`,
      ),
  });

  const items = listQuery.data?.items ?? [];
  const grouped = useMemo(() => groupByAisle(items), [items]);

  const remaining = items.filter((i) => !checked[i.id]).length;

  const onToggle = (itemId: string) => {
    const next = { ...checked, [itemId]: !checked[itemId] };
    setChecked(next);
    saveMutation.mutate(next);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(toPlainText(items));
      toast.success("Copied to clipboard.");
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  };

  const handleRegenerate = () => {
    queryClient.invalidateQueries({ queryKey: ["shopping-list", id] });
    toast.success("Refreshed from your meal plan.");
  };

  if (planQuery.isLoading || listQuery.isLoading) {
    return (
      <div className="px-6 py-12 text-sm text-muted-foreground">Loading…</div>
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
  const plan = planQuery.data.plan;

  return (
    <div
      className="mx-auto max-w-3xl px-6 pb-16 print:px-0"
      data-print-root
    >
      <div
        className="flex items-center justify-between py-4 print:hidden"
        data-print-hide
      >
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="gap-1.5 text-muted-foreground"
        >
          <Link to="/plans/$planId" params={{ planId: String(plan.id) }}>
            <ChevronLeft className="h-4 w-4" />
            Back to plan
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant={isOnMainList ? "secondary" : "outline"}
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending || items.length === 0}
            className="gap-1.5"
            title={
              isOnMainList
                ? "Remove this plan's recipes from your main Shopping List"
                : "Send this plan's recipes to your main Shopping List"
            }
          >
            <ShoppingBasket className="h-4 w-4" />
            {isOnMainList ? "Remove from main list" : "Add to main list"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRegenerate}
            className="gap-1.5"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
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

      <header className="mb-6">
        <h1 className="font-display text-3xl font-medium tracking-tight">
          Shopping List
        </h1>
        <p className="text-sm text-muted-foreground">
          {plan.name} · {format(parseISO(plan.start_date), "MMM d")} —{" "}
          {format(parseISO(plan.end_date), "MMM d, yyyy")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {items.length === 0
            ? "Add recipes to your plan to populate this list."
            : `${remaining} of ${items.length} items remaining`}
        </p>
      </header>

      {items.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Your meal plan has no recipes yet.
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
                    onReassignAisle={(next) =>
                      reassignAisleMutation.mutate({
                        itemCanonical: item.itemCanonical,
                        aisleName: next,
                      })
                    }
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Separator className="my-8 print:hidden" />
      <p className="text-[11px] text-muted-foreground print:hidden">
        Items round up to whole units when needed. Adjust the canonical aisle
        for any item from Settings → Aisles.
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
  onReassignAisle,
}: {
  item: ShoppingItem;
  checked: boolean;
  aisleOptions: string[];
  onToggle: () => void;
  onReassignAisle: (next: string) => void;
}) {
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
      {item.contributors.length > 0 && (
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
      {options.length > 0 && (
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
      )}
    </li>
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
