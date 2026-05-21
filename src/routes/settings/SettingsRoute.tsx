import { CategoriesEditor } from "@/components/settings/CategoriesEditor";
import { PlannerDefaults } from "@/components/settings/PlannerDefaults";
import { AccentPicker } from "@/components/settings/AccentPicker";
import { BackupCard } from "@/components/settings/BackupCard";

export function SettingsRoute() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <h2 className="font-display text-3xl font-medium tracking-tight">
          Settings
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Personalize Paperplate, manage your category labels, and back up your
          data.
        </p>
      </header>

      <div className="space-y-6">
        <AccentPicker />
        <PlannerDefaults />
        <CategoriesEditor />
        <BackupCard />
      </div>
    </div>
  );
}
