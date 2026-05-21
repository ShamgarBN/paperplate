import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { CreatePlanDialog } from "@/components/plans/CreatePlanDialog";
import {
  createPlan,
  deletePlan,
  listPlans,
} from "@/lib/db/planRepo";

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

  const plans = plansQuery.data ?? [];

  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-display text-3xl font-medium tracking-tight">
            Meal plans
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
            <Card
              key={plan.id}
              className="group transition-shadow hover:shadow-elevated"
            >
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <Link
                      to="/plans/$planId"
                      params={{ planId: String(plan.id) }}
                      className="font-display text-xl tracking-tight hover:underline"
                    >
                      {plan.name}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {format(parseISO(plan.start_date), "MMM d")} —{" "}
                      {format(parseISO(plan.end_date), "MMM d, yyyy")}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete plan"
                    onClick={() => deleteMutation.mutate(plan.id)}
                    className="opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                  >
                    <Link
                      to="/plans/$planId"
                      params={{ planId: String(plan.id) }}
                    >
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
