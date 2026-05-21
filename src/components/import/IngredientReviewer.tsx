import { Fragment, useMemo, useState } from "react";
import { Trash2, AlertCircle, Plus, FolderPlus, Pencil } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import type { ParsedIngredient } from "@/lib/ingredients/parser";
import { parseIngredient } from "@/lib/ingredients/parser";
import { cn } from "@/lib/cn";

export interface ReviewableIngredient extends ParsedIngredient {
  id: string;
  /**
   * Sub-recipe label this row belongs to (e.g. "Frosting", "Cake").
   * The reviewer renders a header above each row whose section
   * differs from the previous row's. Null means "ungrouped" (the
   * default for the unlabelled top-level list).
   */
  sectionName: string | null;
}

interface Props {
  items: ReviewableIngredient[];
  onChange: (items: ReviewableIngredient[]) => void;
}

export function IngredientReviewer({ items, onChange }: Props) {
  const issues = useMemo(
    () =>
      items.map((item) => {
        const noQuantity = item.quantity === null;
        const tooShort = item.itemCanonical.length < 2;
        return { noQuantity, tooShort };
      }),
    [items],
  );

  const updateRaw = (id: string, raw: string) => {
    onChange(
      items.map((item) =>
        item.id === id
          ? { ...parseIngredient(raw), id, sectionName: item.sectionName }
          : item,
      ),
    );
  };

  const remove = (id: string) =>
    onChange(items.filter((item) => item.id !== id));

  const toggleOptional = (id: string) =>
    onChange(
      items.map((item) =>
        item.id === id ? { ...item, isOptional: !item.isOptional } : item,
      ),
    );

  /**
   * Apply a new section name starting at row `id` and propagating to
   * subsequent rows that share the old section name. This makes
   * "Cake" → "Frosting" transitions feel one-click without forcing
   * the user to label each row individually.
   */
  const setSectionFromRow = (id: string, nextSection: string | null) => {
    const idx = items.findIndex((it) => it.id === id);
    if (idx === -1) return;
    const oldSection = items[idx]!.sectionName;
    onChange(
      items.map((item, i) => {
        if (i < idx) return item;
        // Only retag rows in the original contiguous group.
        if (i > idx && item.sectionName !== oldSection) return item;
        return { ...item, sectionName: nextSection };
      }),
    );
  };

  const renameSection = (oldName: string, nextName: string) => {
    onChange(
      items.map((item) =>
        item.sectionName === oldName ? { ...item, sectionName: nextName } : item,
      ),
    );
  };

  const add = () => {
    const id = crypto.randomUUID();
    // Inherit the section of the previous row so a new ingredient
    // typed at the bottom of a section stays in that section.
    const lastSection = items.at(-1)?.sectionName ?? null;
    onChange([
      ...items,
      { ...parseIngredient(""), id, sectionName: lastSection },
    ]);
  };

  return (
    <div className="space-y-2">
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No ingredients yet. Add lines manually below.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item, idx) => {
            const prevSection = idx > 0 ? items[idx - 1]!.sectionName : null;
            const showHeader =
              idx === 0
                ? item.sectionName !== null
                : item.sectionName !== prevSection;
            return (
              <Fragment key={item.id}>
                {showHeader && item.sectionName !== null && (
                  <SectionHeader
                    name={item.sectionName}
                    onRename={(next) =>
                      renameSection(item.sectionName!, next.trim() || item.sectionName!)
                    }
                    onClear={() => setSectionFromRow(item.id, null)}
                  />
                )}
                <li
                  className="group grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-2 rounded-md border bg-card/40 px-2 py-1.5 hover:bg-card/70"
                >
                  <span className="w-6 select-none text-right text-xs text-muted-foreground">
                    {idx + 1}
                  </span>
                  <div className="flex items-center gap-2">
                    <Input
                      value={item.raw}
                      onChange={(event) => updateRaw(item.id, event.target.value)}
                      className="h-8 border-transparent bg-transparent shadow-none focus-visible:bg-background focus-visible:ring-1"
                    />
                    {(issues[idx]?.noQuantity || issues[idx]?.tooShort) &&
                      !!item.raw && (
                        <span
                          title="Could not detect a quantity for this line. The shopping list will keep it as-is."
                          className={cn(
                            "shrink-0 text-amber-500",
                            "transition-opacity",
                          )}
                        >
                          <AlertCircle className="h-4 w-4" />
                        </span>
                      )}
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Checkbox
                      checked={item.isOptional}
                      onCheckedChange={() => toggleOptional(item.id)}
                    />
                    optional
                  </label>
                  <SectionAction
                    currentSection={item.sectionName}
                    onSet={(name) => setSectionFromRow(item.id, name)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => remove(item.id)}
                    aria-label="Remove ingredient"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              </Fragment>
            );
          })}
        </ul>
      )}
      <Button variant="outline" size="sm" onClick={add} className="gap-1.5">
        <Plus className="h-3.5 w-3.5" />
        Add ingredient
      </Button>
    </div>
  );
}

/**
 * Section-start affordance. Renders a small "Section: <name>" pill at
 * the top of each contiguous group with hover-revealed rename and
 * clear actions. The clear action propagates "no section" through
 * subsequent rows in the same group.
 */
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
      <li className="rounded-md bg-muted/40 px-3 py-1.5">
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
    <li className="group/header flex items-center justify-between rounded-md bg-muted/40 px-3 py-1.5">
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

/**
 * Per-row "+ Section break" affordance. Shown only on hover so it
 * doesn't crowd the layout. Clicking opens an inline name prompt; on
 * submit the row (and following rows in the same group) move into the
 * named section.
 */
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
          placeholder="Section name…"
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
      className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
      onClick={() => {
        setDraft(currentSection ?? "");
        setEditing(true);
      }}
      aria-label="Start a new section here"
      title="Start a new section here"
    >
      <FolderPlus className="h-3.5 w-3.5" />
    </Button>
  );
}

