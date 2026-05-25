import { Fragment, useState } from "react";
import { FolderPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { RichTextField } from "@/components/import/RichTextField";

/**
 * One instruction step. Carries an optional `sectionName` so the user
 * can group steps under sub-recipe headers ("Cake", "Frosting") that
 * mirror the ingredient sections. Steps are otherwise a flat ordered
 * list; the section header is purely a display concern handled by
 * the reviewer and the recipe detail page.
 */
export interface StepDraft {
  id: string;
  text: string;
  sectionName: string | null;
}

interface Props {
  steps: StepDraft[];
  onChange: (next: StepDraft[]) => void;
}

export function StepReviewer({ steps, onChange }: Props) {
  const update = (id: string, text: string) =>
    onChange(steps.map((s) => (s.id === id ? { ...s, text } : s)));
  const remove = (id: string) =>
    onChange(steps.filter((s) => s.id !== id));
  const add = () => {
    const lastSection = steps.at(-1)?.sectionName ?? null;
    onChange([
      ...steps,
      { id: crypto.randomUUID(), text: "", sectionName: lastSection },
    ]);
  };

  const setSectionFromIndex = (id: string, nextSection: string | null) => {
    const idx = steps.findIndex((s) => s.id === id);
    if (idx === -1) return;
    const oldSection = steps[idx]!.sectionName;
    onChange(
      steps.map((s, i) => {
        if (i < idx) return s;
        if (i > idx && s.sectionName !== oldSection) return s;
        return { ...s, sectionName: nextSection };
      }),
    );
  };

  const renameSection = (oldName: string, nextName: string) => {
    onChange(
      steps.map((s) =>
        s.sectionName === oldName ? { ...s, sectionName: nextName } : s,
      ),
    );
  };

  return (
    <div className="space-y-3">
      {steps.length === 0 ? (
        <p className="text-sm text-muted-foreground">No steps yet.</p>
      ) : (
        <ol className="space-y-2">
          {steps.map((step, idx) => {
            const prevSection = idx > 0 ? steps[idx - 1]!.sectionName : null;
            const showHeader =
              idx === 0
                ? step.sectionName !== null
                : step.sectionName !== prevSection;
            return (
              <Fragment key={step.id}>
                {showHeader && step.sectionName !== null && (
                  <SectionHeader
                    name={step.sectionName}
                    onRename={(next) =>
                      renameSection(
                        step.sectionName!,
                        next.trim() || step.sectionName!,
                      )
                    }
                    onClear={() => setSectionFromIndex(step.id, null)}
                  />
                )}
                <li className="group flex items-start gap-3">
                  <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-card text-xs font-medium text-muted-foreground">
                    {idx + 1}
                  </span>
                  <RichTextField
                    value={step.text}
                    onChange={(next) => update(step.id, next)}
                    rows={Math.max(2, Math.ceil(step.text.length / 80))}
                    className="flex-1"
                    placeholder="Describe this step…"
                    aria-label={`Step ${idx + 1}`}
                  />
                  <div className="flex flex-col gap-1">
                    <SectionAction
                      currentSection={step.sectionName}
                      onSet={(name) => setSectionFromIndex(step.id, name)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(step.id)}
                      aria-label="Remove step"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              </Fragment>
            );
          })}
        </ol>
      )}
      <Button variant="outline" size="sm" onClick={add} className="gap-1.5">
        <Plus className="h-3.5 w-3.5" />
        Add step
      </Button>
    </div>
  );
}

function SectionHeader({
  name,
  onRename,
  onClear,
}: {
  name: string;
  onRename: (next: string) => void;
  onClear: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  if (editing) {
    return (
      <li className="rounded-md bg-muted/40 px-3 py-2">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const next = draft.trim();
            if (next) onRename(next);
            setEditing(false);
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            className="h-7 text-xs font-medium uppercase tracking-wider"
            maxLength={60}
          />
          <Button type="submit" size="sm" variant="secondary">
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraft(name);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </form>
      </li>
    );
  }
  return (
    <li className="group/header flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
      <span className="text-xs font-medium uppercase tracking-wider text-foreground">
        {name}
      </span>
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/header:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setEditing(true)}
          aria-label="Rename section"
          title="Rename section"
        >
          <Pencil className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onClear}
          aria-label="Remove section"
          title="Remove section grouping"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </li>
  );
}

function SectionAction({
  currentSection,
  onSet,
}: {
  currentSection: string | null;
  onSet: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  if (editing) {
    return (
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          const next = draft.trim();
          if (next) onSet(next);
          setEditing(false);
          setDraft("");
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Section…"
          autoFocus
          className="h-7 w-32 text-xs"
          maxLength={60}
        />
      </form>
    );
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
      onClick={() => {
        setDraft(currentSection ?? "");
        setEditing(true);
      }}
      aria-label="Start a new section here"
      title="Start a new section here"
    >
      <FolderPlus className="h-4 w-4" />
    </Button>
  );
}
