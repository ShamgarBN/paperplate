import { Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/Tooltip";

interface Props {
  base: number;
  value: number;
  onChange: (next: number) => void;
}

export function ServingStepper({ base, value, onChange }: Props) {
  const set = (next: number) => onChange(Math.max(1, Math.round(next)));
  const isCustom = value !== base;
  return (
    <div className="inline-flex items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7 rounded-full"
        onClick={() => set(value - 1)}
        aria-label="Decrease servings"
      >
        <Minus className="h-3 w-3" />
      </Button>
      <span className="w-12 select-none text-center font-display text-base tabular-nums">
        {value}
      </span>
      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7 rounded-full"
        onClick={() => set(value + 1)}
        aria-label="Increase servings"
      >
        <Plus className="h-3 w-3" />
      </Button>
      {isCustom && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => set(base)}
              aria-label="Reset servings"
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reset to original ({base})</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
