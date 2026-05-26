import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "@/routes";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { AccentApplier } from "@/components/theme/AccentApplier";
import { Toaster } from "@/components/ui/Toaster";
import { AuthGate } from "@/components/auth/AuthGate";
import "@/styles/globals.css";

// Vite sets `import.meta.env.BASE_URL` to whatever the build's `base`
// config was — "/" inside Tauri, "/paperplate/" for the GitHub-Pages
// PWA build. The router needs that prefix (without trailing slash) so
// it doesn't try to match "/paperplate/library" against a route tree
// that only knows "library".
const basepath = import.meta.env.BASE_URL.replace(/\/$/, "");

const router = createRouter({
  routeTree,
  basepath: basepath || undefined,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AccentApplier />
      <QueryClientProvider client={queryClient}>
        <AuthGate>
          <RouterProvider router={router} />
        </AuthGate>
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
