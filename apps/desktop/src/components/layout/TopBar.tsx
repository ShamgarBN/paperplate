import { Link, useRouterState } from "@tanstack/react-router";
import { Plus, Search, Sun, Moon, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useTheme } from "@/components/theme/ThemeProvider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/Tooltip";
import { useLibraryStore } from "@/store/libraryStore";

const titles: Record<string, string> = {
  "/": "Library",
  "/library": "Library",
  "/import": "Add recipe",
  "/plans": "Meal Plans",
  "/shopping": "Shopping List",
  "/settings": "Settings",
};

function pageTitle(pathname: string) {
  if (pathname.startsWith("/recipes/")) return "Recipe";
  if (pathname.startsWith("/plans/") && pathname.endsWith("/shopping"))
    return "Shopping List";
  if (pathname.startsWith("/plans/")) return "Meal Plan";
  return titles[pathname] ?? "Paperplate";
}

export function TopBar() {
  const { location } = useRouterState();
  const { theme, setTheme } = useTheme();
  const search = useLibraryStore((s) => s.search);
  const setSearch = useLibraryStore((s) => s.setSearch);

  return (
    <header
      data-tauri-drag-region
      className="drag sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-5 backdrop-blur"
    >
      <h1
        data-tauri-drag-region
        className="drag font-display text-lg font-medium tracking-tight"
      >
        {pageTitle(location.pathname)}
      </h1>
      <div className="no-drag relative ml-6 hidden max-w-md flex-1 items-center md:flex">
        <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search recipes, ingredients, tags..."
          className="pl-9"
        />
      </div>
      <div data-tauri-drag-region className="drag ml-auto flex flex-1" />
      <div className="no-drag flex items-center gap-2">
        <ThemeToggle theme={theme} setTheme={setTheme} />
        <Button asChild size="sm" className="gap-1.5">
          <Link to="/import">
            <Plus className="h-4 w-4" />
            Add recipe
          </Link>
        </Button>
      </div>
    </header>
  );
}

function ThemeToggle({
  theme,
  setTheme,
}: {
  theme: ReturnType<typeof useTheme>["theme"];
  setTheme: ReturnType<typeof useTheme>["setTheme"];
}) {
  const next: Record<typeof theme, typeof theme> = {
    system: "light",
    light: "dark",
    dark: "system",
  };
  const Icon =
    theme === "light" ? Sun : theme === "dark" ? Moon : MonitorSmartphone;
  const label =
    theme === "light"
      ? "Light theme (click for dark)"
      : theme === "dark"
        ? "Dark theme (click for system)"
        : "System theme (click for light)";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          onClick={() => setTheme(next[theme])}
        >
          <Icon className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
