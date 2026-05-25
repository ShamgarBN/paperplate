import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  initial: number;
  onSave: (value: number) => void;
}

export function ServingsEditor({ open, onOpenChange, initial, onSave }: Props) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    if (open) setValue(initial);
  }, [open, initial]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Servings for this slot</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="slot-servings">Number of servings</Label>
          <Input
            id="slot-servings"
            type="number"
            min={1}
            value={value}
            onChange={(e) => setValue(Math.max(1, Number(e.target.value) || 1))}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onSave(Math.max(1, Math.round(value)));
              onOpenChange(false);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
