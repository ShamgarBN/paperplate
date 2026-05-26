import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  CalendarDays,
  Settings as SettingsIcon,
  ShoppingBasket,
  UtensilsCrossed,
} from "lucide-react";
import { cn } from "@/lib/cn";

interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  matchPrefixes?: string[];
}

const items: NavItem[] = [
  {
    to: "/library",
    icon: BookOpen,
    label: "Library",
    matchPrefixes: ["/library", "/recipes", "/"],
  },
  {
    to: "/plans",
    icon: CalendarDays,
    label: "Meal Plans",
    matchPrefixes: ["/plans"],
  },
  {
    to: "/shopping",
    icon: ShoppingBasket,
    label: "Shopping List",
    // Per-plan shopping lists live at /plans/$id/shopping. We deliberately
    // exclude that path here so the "Meal plans" entry stays highlighted
    // when the user is on a plan's per-plan list.
    matchPrefixes: ["/shopping"],
  },
  {
    to: "/settings",
    icon: SettingsIcon,
    label: "Settings",
    matchPrefixes: ["/settings"],
  },
];

export function Sidebar() {
  const { location } = useRouterState();
  const path = location.pathname;
  return (
    <aside className="hidden h-full w-60 shrink-0 flex-col border-r bg-card/50 md:flex">
      <div className="flex h-12 items-center gap-2 px-5">
        <UtensilsCrossed className="h-4 w-4 text-primary" />
        <span className="font-display text-lg tracking-tight">Paperplate</span>
      </div>
      <nav className="no-drag mt-2 flex flex-col gap-0.5 px-3">
        {items.map((item, idx) => {
          const active = (item.matchPrefixes ?? [item.to]).some((p) =>
            p === "/" ? path === "/" : path.startsWith(p),
          );
          const Icon = item.icon;
          return (
            <Link
              key={`${item.to}-${idx}`}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto px-5 pb-4 text-[11px] text-muted-foreground">
        v2.1.0
      </div>
    </aside>
  );
}
