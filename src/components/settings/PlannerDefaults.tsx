import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { Slider } from "@/components/ui/Slider";
import { Switch } from "@/components/ui/Switch";
import { Input } from "@/components/ui/Input";
import { useSettingsStore } from "@/store/settingsStore";

export function PlannerDefaults() {
  const settings = useSettingsStore();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Planner defaults</CardTitle>
        <CardDescription>
          Tune how Paperplate fills in meal plans on auto-pilot.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Overlap ↔ Less waste</Label>
            <span className="text-xs text-muted-foreground">
              {Math.round(settings.plannerBalance * 100)}%
            </span>
          </div>
          <Slider
            value={[settings.plannerBalance * 100]}
            onValueChange={([v]) =>
              settings.set({ plannerBalance: (v ?? 50) / 100 })
            }
            min={0}
            max={100}
            step={5}
          />
          <p className="text-xs text-muted-foreground">
            Lower values pack more shared ingredients. Higher values prioritize
            using up perishables across multiple meals.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Variety weight</Label>
            <span className="text-xs text-muted-foreground">
              {settings.varietyWeight.toFixed(1)}
            </span>
          </div>
          <Slider
            value={[Math.round(settings.varietyWeight * 10)]}
            onValueChange={([v]) =>
              settings.set({ varietyWeight: (v ?? 4) / 10 })
            }
            min={0}
            max={20}
            step={1}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm">Recently cooked window (days)</Label>
          <Input
            type="number"
            value={settings.recentlyCookedDays}
            min={0}
            max={90}
            onChange={(e) =>
              settings.set({
                recentlyCookedDays: Math.max(0, Number(e.target.value) || 0),
              })
            }
            className="w-28"
          />
          <p className="text-xs text-muted-foreground">
            Auto-fill skips recipes you've cooked within this many days.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">Add a breakfast slot to new plans</Label>
            <p className="text-xs text-muted-foreground">
              You can always toggle this per-day inside a plan.
            </p>
          </div>
          <Switch
            checked={settings.defaultBreakfastEnabled}
            onCheckedChange={(checked) =>
              settings.set({ defaultBreakfastEnabled: checked })
            }
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">Add a lunch slot to new plans</Label>
            <p className="text-xs text-muted-foreground">
              You can always toggle this per-day inside a plan.
            </p>
          </div>
          <Switch
            checked={settings.defaultLunchEnabled}
            onCheckedChange={(checked) =>
              settings.set({ defaultLunchEnabled: checked })
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
