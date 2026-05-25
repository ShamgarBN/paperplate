import { createRootRoute, createRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { LibraryRoute } from "@/routes/library/LibraryRoute";
import { RecipeDetailRoute } from "@/routes/library/RecipeDetailRoute";
import { EditRecipeRoute } from "@/routes/library/EditRecipeRoute";
import { ImportRoute } from "@/routes/library/ImportRoute";
import { PlansListRoute } from "@/routes/plans/PlansListRoute";
import { PlanDetailRoute } from "@/routes/plans/PlanDetailRoute";
import { ShoppingRoute } from "@/routes/shopping/ShoppingRoute";
import { GlobalShoppingRoute } from "@/routes/shopping/GlobalShoppingRoute";
import { SettingsRoute } from "@/routes/settings/SettingsRoute";

const rootRoute = createRootRoute({ component: AppShell });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LibraryRoute,
});

const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "library",
  component: LibraryRoute,
});

const importRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "import",
  component: ImportRoute,
});

const recipeDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "recipes/$recipeId",
  component: RecipeDetailRoute,
});

const recipeEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "recipes/$recipeId/edit",
  component: EditRecipeRoute,
});

const plansListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "plans",
  component: PlansListRoute,
});

const planDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "plans/$planId",
  component: PlanDetailRoute,
});

const shoppingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "plans/$planId/shopping",
  component: ShoppingRoute,
});

const globalShoppingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "shopping",
  component: GlobalShoppingRoute,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "settings",
  component: SettingsRoute,
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  libraryRoute,
  importRoute,
  recipeDetailRoute,
  recipeEditRoute,
  plansListRoute,
  planDetailRoute,
  shoppingRoute,
  globalShoppingRoute,
  settingsRoute,
]);
