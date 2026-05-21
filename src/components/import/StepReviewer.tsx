import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";

interface Props {
  steps: string[];
  onChange: (next: string[]) => void;
}

export function StepReviewer({ steps, onChange }: Props) {
  const update = (index: number, value: string) => {
    const next = steps.slice();
    next[index] = value;
    onChange(next);
  };
  const remove = (index: number) =>
    onChange(steps.filter((_, i) => i !== index));
  const add = () => onChange([...steps, ""]);

  return (
    <div className="space-y-3">
      {steps.length === 0 ? (
        <p className="text-sm text-muted-foreground">No steps yet.</p>
      ) : (
        <ol className="space-y-2">
          {steps.map((step, idx) => (
            <li key={idx} className="flex gap-3">
              <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-card text-xs font-medium text-muted-foreground">
                {idx + 1}
              </span>
              <Textarea
                value={step}
                onChange={(event) => update(idx, event.target.value)}
                rows={Math.max(2, Math.ceil(step.length / 80))}
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => remove(idx)}
                aria-label="Remove step"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ol>
      )}
      <Button variant="outline" size="sm" onClick={add} className="gap-1.5">
        <Plus className="h-3.5 w-3.5" />
        Add step
      </Button>
    </div>
  );
}
