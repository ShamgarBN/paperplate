import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  CalendarDays,
  Check,
  Copy,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { CreatePlanDialog } from "@/components/plans/CreatePlanDialog";
import {
  createPlan,
  deletePlan,
  duplicatePlan,
  listPlans,
  renamePlan,
} from "@/lib/db/planRepo";
import type { MealPlan } from "@/lib/db/schema";

export function PlansListRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const plansQuery = useQuery({
    queryKey: ["plans"],
    queryFn: listPlans,
  });

  const createMutation = useMutation({
    mutationFn: async (input: {
      name: string;
      startDate: string;
      endDate: string;
      breakfastDays: string[];
      lunchDays: string[];
    }) =>
      createPlan(input.name, input.startDate, input.endDate, {
        breakfastDays: input.breakfastDays,
        lunchDays: input.lunchDays,
      }),
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      toast.success("Plan created.");
      navigate({ to: "/plans/$planId", params: { planId: String(id) } });
    },
    onError: (err) => {
      toast.error(
        `Could not create plan: ${err instanceof Error ? err.message : String(err)}`,
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => deletePlan(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      toast.success("Plan deleted.");
    },
    onError: (err) => {
      toast.error(
        `Could not delete plan: ${err instanceof Error ? err.message : String(err)}`,
      );
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: number) => duplicatePlan(id),
    onSuccess: (newId) => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      toast.success("Plan duplicated.");
      navigate({ to: "/plans/$planId", params: { planId: String(newId) } });
    },
    onError: (err) => {
      toast.error(
        `Could not duplicate plan: ${err instanceof Error ? err.message : String(err)}`,
      );
    },
  });

  const renameMutation = useMutation({
    mutationFn: async (params: { id: number; name: string }) =>
      renamePlan(params.id, params.name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      toast.success("Plan renamed.");
    },
    onError: (err) => {
      toast.error(
        `Could not rename plan: ${err instanceof Error ? err.message : String(err)}`,
      );
    },
  });

  const plans = plansQuery.data ?? [];

  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-display text-3xl font-medium tracking-tight">
            Meal Plans
          </h2>
          <p className="text-sm text-muted-foreground">
            Plan a few days, a week, or a month at a time.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          New plan
        </Button>
      </div>

      {plansQuery.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : plans.length === 0 ? (
        <EmptyState onCreate={() => setShowCreate(true)} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              onDelete={() => deleteMutation.mutate(plan.id)}
              onDuplicate={() => duplicateMutation.mutate(plan.id)}
              onRename={(name) => renameMutation.mutate({ id: plan.id, name })}
            />
          ))}
        </div>
      )}

      <CreatePlanDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreate={async (input) => {
          await createMutation.mutateAsync(input);
        }}
      />
    </div>
  );
}

/**
 * Renders a single plan card on the list page. The inline rename input
 * is intentionally not a modal — naming a plan is a one-keystroke
 * operation and we keep it lightweight. Date range stays visible as a
 * secondary label so users can still tell their plans apart even if
 * they're all called "Week of…".
 */
function PlanCard({
  plan,
  onDelete,
  onDuplicate,
  onRename,
}: {
  plan: MealPlan;
  onDelete: () => void;
  onDuplicate: () => void;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(plan.name);

  const commit = () => {
    const trimmed = draftName.trim();
    if (!trimmed) {
      setDraftName(plan.name);
      setEditing(false);
      return;
    }
    if (trimmed !== plan.name) onRename(trimmed);
    setEditing(false);
  };

  return (
    <Card className="group transition-shadow hover:shadow-elevated">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="flex items-center gap-1.5">
                <Input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commit();
                    if (e.key === "Escape") {
                      setDraftName(plan.name);
                      setEditing(false);
                    }
                  }}
                  autoFocus
                  className="h-8 text-base"
                  maxLength={120}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Save name"
                  onClick={commit}
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Cancel rename"
                  onClick={() => {
                    setDraftName(plan.name);
                    setEditing(false);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Link
                to="/plans/$planId"
                params={{ planId: String(plan.id) }}
                className="block truncate font-display text-xl tracking-tight hover:underline"
                title={plan.name}
              >
                {plan.name}
              </Link>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {format(parseISO(plan.start_date), "MMM d")} —{" "}
              {format(parseISO(plan.end_date), "MMM d, yyyy")}
            </p>
          </div>
          <div className="ml-2 flex items-center opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Rename plan"
              onClick={() => {
                setDraftName(plan.name);
                setEditing(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Duplicate plan"
              onClick={onDuplicate}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete plan"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link to="/plans/$planId" params={{ planId: String(plan.id) }}>
              Open
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="gap-1.5 text-muted-foreground"
          >
            <Link
              to="/plans/$planId/shopping"
              params={{ planId: String(plan.id) }}
            >
              Shopping
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/40 px-6 py-20 text-center">
      <div className="rounded-full border bg-background p-4 shadow-card">
        <CalendarDays className="h-6 w-6 text-primary" />
      </div>
      <h3 className="mt-5 font-display text-2xl font-medium tracking-tight">
        No meal plans yet
      </h3>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Once you have a few recipes, build a plan and Paperplate will give you a
        consolidated shopping list for the whole stretch.
      </p>
      <Button onClick={onCreate} className="mt-6 gap-1.5">
        <Plus className="h-4 w-4" /> Create your first plan
      </Button>
    </div>
  );
}
