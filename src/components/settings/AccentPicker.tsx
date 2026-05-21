import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import { useSettingsStore } from "@/store/settingsStore";
import { cn } from "@/lib/cn";

const SWATCHES = [
  { name: "Persimmon", hue: 16 },
  { name: "Saffron", hue: 36 },
  { name: "Olive", hue: 80 },
  { name: "Forest", hue: 145 },
  { name: "Teal", hue: 175 },
  { name: "Slate", hue: 215 },
  { name: "Plum", hue: 280 },
  { name: "Rose", hue: 340 },
];

export function AccentPicker() {
  const accentHue = useSettingsStore((s) => s.accentHue);
  const setSettings = useSettingsStore((s) => s.set);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accent color</CardTitle>
        <CardDescription>
          Pick a hue for buttons, focus rings, and the active recipe chip.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
          {SWATCHES.map((s) => (
            <button
              key={s.hue}
              type="button"
              onClick={() => setSettings({ accentHue: s.hue })}
              className={cn(
                "group flex flex-col items-center gap-1 rounded-md border bg-card p-2 transition hover:shadow-sm",
                accentHue === s.hue && "border-primary ring-2 ring-primary/40",
              )}
              aria-label={`Set accent ${s.name}`}
            >
              <span
                className="h-8 w-8 rounded-full"
                style={{
                  background: `hsl(${s.hue} 78% 46%)`,
                }}
              />
              <span className="text-[11px] text-muted-foreground">
                {s.name}
              </span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
