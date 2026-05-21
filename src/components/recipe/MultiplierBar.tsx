import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/**
 * Compact row of preset scaling multipliers (1/4x, 1/3x, 1/2x, 1x, 2x, 3x).
 * Lives next to the +/- serving stepper so the user can do quick fractional
 * scaling without doing the arithmetic themselves.
 *
 * The bar is purely a derivative of `base` and the current `servings` —
 * it doesn't store its own state, so any external change (stepper, reset,
 * server hydration) lights up the right button automatically.
 */
export interface Multiplier {
  /** Display label, e.g. "1/2x" or "2x". */
  label: string;
  /** Numeric factor applied to base servings. */
  value: number;
}

const PRESETS: Multiplier[] = [
  { label: "1/4x", value: 1 / 4 },
  { label: "1/3x", value: 1 / 3 },
  { label: "1/2x", value: 1 / 2 },
  { label: "1x", value: 1 },
  { label: "2x", value: 2 },
  { label: "3x", value: 3 },
];

interface Props {
  base: number;
  value: number;
  onChange: (next: number) => void;
  className?: string;
}

export function MultiplierBar({ base, value, onChange, className }: Props) {
  const apply = (factor: number) => {
    // Round to the nearest whole number — fractional servings rarely make
    // sense in the UI (the ingredient scaler handles fractional quantities
    // internally), and it keeps the stepper value displayable.
    const next = Math.max(1, Math.round(base * factor));
    onChange(next);
  };
  return (
    <div className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {PRESETS.map((preset) => {
        // Active when the current servings equals what this preset would
        // produce. We compare against the rounded result, not the raw
        // factor, so 1/3x of 4 = 1 (rounded) still lights up.
        const expected = Math.max(1, Math.round(base * preset.value));
        const active = value === expected;
        return (
          <Button
            key={preset.label}
            type="button"
            variant={active ? "default" : "outline"}
            size="sm"
            className={cn(
              "h-7 px-2 text-xs tabular-nums",
              active && "shadow-card",
            )}
            onClick={() => apply(preset.value)}
            aria-pressed={active}
            aria-label={`Scale to ${preset.label}`}
          >
            {preset.label}
          </Button>
        );
      })}
    </div>
  );
}
