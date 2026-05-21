import { useState } from "react";
import { Sparkles, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/Popover";
import { Slider } from "@/components/ui/Slider";
import { Label } from "@/components/ui/Label";
import { Switch } from "@/components/ui/Switch";
import { Separator } from "@/components/ui/Separator";

interface AutoFillBarProps {
  balance: number;
  onBalanceChange: (value: number) => void;
  varietyWeight: number;
  onVarietyChange: (value: number) => void;
  recentlyCookedDays: number;
  onRecentlyCookedDaysChange: (value: number) => void;
  preserveLocked: boolean;
  onPreserveLockedChange: (value: boolean) => void;
  onAutoFill: () => void;
  isRunning: boolean;
}

export function AutoFillBar(props: AutoFillBarProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Settings2 className="h-4 w-4" />
            Tune
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 space-y-4" align="end">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Overlap ↔ Less waste</Label>
              <span className="text-xs text-muted-foreground">
                {Math.round(props.balance * 100)}%
              </span>
            </div>
            <Slider
              value={[props.balance * 100]}
              onValueChange={([v]) => props.onBalanceChange((v ?? 50) / 100)}
              min={0}
              max={100}
              step={5}
            />
            <p className="text-xs text-muted-foreground">
              Lower favors recipes that share ingredients. Higher favors using
              perishable items across multiple meals.
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Variety weight</Label>
              <span className="text-xs text-muted-foreground">
                {props.varietyWeight.toFixed(1)}
              </span>
            </div>
            <Slider
              value={[Math.round(props.varietyWeight * 10)]}
              onValueChange={([v]) => props.onVarietyChange((v ?? 4) / 10)}
              min={0}
              max={20}
              step={1}
            />
            <p className="text-xs text-muted-foreground">
              Boosts under-represented proteins and recipe types.
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="text-sm">Avoid recipes cooked in last</Label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={props.recentlyCookedDays}
                onChange={(e) =>
                  props.onRecentlyCookedDaysChange(
                    Math.max(0, Number(e.target.value) || 0),
                  )
                }
                className="h-9 w-20 rounded-md border border-input bg-background px-3 text-sm"
              />
              <span className="text-sm text-muted-foreground">days</span>
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <Label className="text-sm">Keep locked picks</Label>
            <Switch
              checked={props.preserveLocked}
              onCheckedChange={props.onPreserveLockedChange}
            />
          </div>
        </PopoverContent>
      </Popover>

      <Button
        size="sm"
        onClick={props.onAutoFill}
        disabled={props.isRunning}
        className="gap-1.5"
      >
        <Sparkles className="h-4 w-4" />
        {props.isRunning ? "Filling…" : "Auto-fill"}
      </Button>
    </div>
  );
}
