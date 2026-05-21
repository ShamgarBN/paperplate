import { useMemo, useState } from "react";
import { addDays, eachDayOfInterval, format, parseISO } from "date-fns";

/**
 * Build a sensible auto-name from the chosen date range. Used when the user
 * leaves the (optional) name field blank — keeps every plan distinguishable
 * in the list view without forcing them to invent a label.
 */
function defaultNameFromRange(startIso: string, endIso: string): string {
  try {
    const start = parseISO(startIso);
    const end = parseISO(endIso);
    if (start.getTime() === end.getTime()) {
      return format(start, "EEE, MMM d");
    }
    if (start.getFullYear() === end.getFullYear()) {
      return `${format(start, "MMM d")} \u2013 ${format(end, "MMM d, yyyy")}`;
    }
    return `${format(start, "MMM d, yyyy")} \u2013 ${format(end, "MMM d, yyyy")}`;
  } catch {
    return "Untitled plan";
  }
}
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Switch } from "@/components/ui/Switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { isoDate } from "@/lib/db/planRepo";
import { useSettingsStore } from "@/store/settingsStore";

export interface CreatePlanInput {
  name: string;
  startDate: string;
  endDate: string;
  breakfastDays: string[];
  lunchDays: string[];
}

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onCreate: (input: CreatePlanInput) => void | Promise<void>;
}

const PRESETS = [
  { id: "1d", label: "1 day", days: 1 },
  { id: "1w", label: "1 week", days: 7 },
  { id: "2w", label: "2 weeks", days: 14 },
  { id: "1m", label: "1 month", days: 30 },
  { id: "custom", label: "Custom", days: 0 },
];

export function CreatePlanDialog({ open, onOpenChange, onCreate }: Props) {
  const today = useMemo(() => isoDate(new Date()), []);
  const defaultBreakfastEnabled = useSettingsStore(
    (s) => s.defaultBreakfastEnabled,
  );
  const defaultLunchEnabled = useSettingsStore((s) => s.defaultLunchEnabled);
  const [name, setName] = useState("");
  const [preset, setPreset] = useState("1w");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(() => isoDate(addDays(new Date(), 6)));
  const [includeBreakfast, setIncludeBreakfast] = useState(
    defaultBreakfastEnabled,
  );
  const [includeLunch, setIncludeLunch] = useState(defaultLunchEnabled);
  const [submitting, setSubmitting] = useState(false);

  const isCustom = preset === "custom";

  const handlePreset = (next: string) => {
    setPreset(next);
    if (next !== "custom") {
      const days = PRESETS.find((p) => p.id === next)?.days ?? 7;
      const start = parseISO(startDate);
      setEndDate(isoDate(addDays(start, days - 1)));
    }
  };

  const handleStart = (next: string) => {
    setStartDate(next);
    if (!isCustom) {
      const days = PRESETS.find((p) => p.id === preset)?.days ?? 7;
      const start = parseISO(next);
      setEndDate(isoDate(addDays(start, days - 1)));
    }
  };

  const submit = async () => {
    if (!startDate || !endDate) return;
    if (parseISO(endDate) < parseISO(startDate)) return;
    setSubmitting(true);
    try {
      const days = eachDayOfInterval({
        start: parseISO(startDate),
        end: parseISO(endDate),
      }).map((d) => isoDate(d));
      // Name is optional: fall back to a date-range label so plans stay
      // identifiable in the list without making the user invent a name.
      const trimmedName = name.trim();
      const resolvedName =
        trimmedName.length > 0
          ? trimmedName
          : defaultNameFromRange(startDate, endDate);
      await onCreate({
        name: resolvedName,
        startDate,
        endDate,
        breakfastDays: includeBreakfast ? days : [],
        lunchDays: includeLunch ? days : [],
      });
      onOpenChange(false);
      setName("");
    } catch {
      // The parent route surfaces the error; just stop the spinner so the
      // user can correct and retry.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New meal plan</DialogTitle>
          <DialogDescription>
            Pick a date range. You can edit individual days later.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="plan-name">
              Name{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Input
              id="plan-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={defaultNameFromRange(startDate, endDate)}
              className="mt-1"
              autoFocus
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Leave blank to use the date range as the title.
            </p>
          </div>
          <div>
            <Label>Length</Label>
            <Select value={preset} onValueChange={handlePreset}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="plan-start">Start</Label>
              <Input
                id="plan-start"
                type="date"
                value={startDate}
                onChange={(e) => handleStart(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="plan-end">End</Label>
              <Input
                id="plan-end"
                type="date"
                value={endDate}
                disabled={!isCustom}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {parseISO(endDate) >= parseISO(startDate)
              ? `${format(parseISO(startDate), "EEE, MMM d")} \u2192 ${format(
                  parseISO(endDate),
                  "EEE, MMM d, yyyy",
                )}`
              : "End date must be on or after the start date."}
          </p>

          <div className="space-y-3 rounded-md border bg-muted/30 p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Slots per day
            </p>
            <SlotToggle
              id="plan-breakfast"
              label="Breakfast"
              description="Add a breakfast slot to every day."
              checked={includeBreakfast}
              onCheckedChange={setIncludeBreakfast}
            />
            <SlotToggle
              id="plan-lunch"
              label="Lunch"
              description="Add a lunch slot to every day."
              checked={includeLunch}
              onCheckedChange={setIncludeLunch}
            />
            <SlotToggle
              id="plan-dinner"
              label="Dinner"
              description="Always included; you can clear individual days later."
              checked
              onCheckedChange={() => {}}
              disabled
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={
              submitting ||
              !startDate ||
              !endDate ||
              parseISO(endDate) < parseISO(startDate)
            }
          >
            Create plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SlotToggle({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </div>
  );
}
