import { Outlet } from "@tanstack/react-router";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { OnboardingDialog } from "@/components/onboarding/OnboardingDialog";
import { useGlobalShortcuts } from "@/lib/keyboard";

export function AppShell() {
  useGlobalShortcuts();
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full min-h-screen w-full flex-col bg-background text-foreground">
        {/*
          Dedicated drag handle running the full width of the window. We use
          BOTH the Tauri-native `data-tauri-drag-region` attribute (which
          drives drag through the Rust side and is the reliable path on
          release builds) and the legacy `-webkit-app-region: drag` CSS
          (which works in dev). macOS traffic lights sit inside this strip,
          positioned via `trafficLightPosition` in tauri.conf.json.
        */}
        <div
          data-tauri-drag-region
          aria-hidden
          className="drag h-10 w-full shrink-0 select-none"
        />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar />
            <main className="flex-1 overflow-y-auto">
              <Outlet />
            </main>
          </div>
        </div>
      </div>
      <OnboardingDialog />
    </TooltipProvider>
  );
}
