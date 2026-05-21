import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import {
  createAisle,
  deleteAisle,
  FALLBACK_AISLE_NAME,
  listAisles,
  renameAisle,
} from "@/lib/db/aisleRepo";
import type { Aisle } from "@/lib/db/schema";

/**
 * Settings-page editor for the user's shopping list sections (aisles).
 * The list is always alphabetised by the underlying query, so the user
 * never has to manually re-order rows here. The protected "Other" aisle
 * stays visible but exposes no delete affordance — it's the universal
 * fallback target when an ingredient has no override.
 */
export function AislesEditor() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["aisles"],
    queryFn: listAisles,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["aisles"] });
    // Aisle changes also affect anything that derived ingredient→aisle
    // mappings (shopping list aggregator, per-plan list snapshot view).
    qc.invalidateQueries({ queryKey: ["global-shopping"] });
    qc.invalidateQueries({ queryKey: ["shopping-list"] });
  };

  const addMut = useMutation({
    mutationFn: (name: string) => createAisle(name),
    onSuccess: () => {
      refresh();
      toast.success("Aisle added.");
    },
    onError: (e) => toast.error(asMessage(e)),
  });
  const renameMut = useMutation({
    mutationFn: (params: { id: number; name: string }) =>
      renameAisle(params.id, params.name),
    onSuccess: () => {
      refresh();
      toast.success("Aisle renamed.");
    },
    onError: (e) => toast.error(asMessage(e)),
  });
  const delMut = useMutation({
    mutationFn: (id: number) => deleteAisle(id),
    onSuccess: () => {
      refresh();
      toast.success("Aisle removed.");
    },
    onError: (e) => toast.error(asMessage(e)),
  });

  const aisles = query.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shopping List Sections</CardTitle>
        <CardDescription>
          Edit the aisle labels that group ingredients on your shopping
          list. Items reassigned from one section to another on the list
          itself are remembered for next time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <AisleList
          aisles={aisles}
          onRename={(id, name) => renameMut.mutate({ id, name })}
          onDelete={(id) => delMut.mutate(id)}
        />
        <NewAisleRow onAdd={(name) => addMut.mutate(name)} />
      </CardContent>
    </Card>
  );
}

function AisleList({
  aisles,
  onRename,
  onDelete,
}: {
  aisles: Aisle[];
  onRename: (id: number, name: string) => void;
  onDelete: (id: number) => void;
}) {
  if (aisles.length === 0) {
    return (
      <p className="text-sm italic text-muted-foreground">
        No aisles yet — add your first one below.
      </p>
    );
  }
  return (
    <ul className="divide-y rounded-md border bg-card">
      {aisles.map((a) => (
        <AisleRow
          key={a.id}
          item={a}
          onRename={(name) => onRename(a.id, name)}
          onDelete={() => onDelete(a.id)}
        />
      ))}
    </ul>
  );
}

function AisleRow({
  item,
  onRename,
  onDelete,
}: {
  item: Aisle;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.name);
  const isProtected =
    item.name.toLowerCase() === FALLBACK_AISLE_NAME.toLowerCase();

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setDraft(item.name);
      setEditing(false);
      return;
    }
    if (trimmed !== item.name) onRename(trimmed);
    setEditing(false);
  };

  return (
    <li className="flex items-center justify-between gap-2 px-3 py-2">
      {editing ? (
        <div className="flex flex-1 items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(item.name);
                setEditing(false);
              }
            }}
            autoFocus
            className="h-8"
            maxLength={60}
          />
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={commit}
            aria-label="Save"
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => {
              setDraft(item.name);
              setEditing(false);
            }}
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <>
          <span className="text-sm">
            {item.name}
            {isProtected && (
              <span className="ml-2 text-[11px] text-muted-foreground">
                (default fallback)
              </span>
            )}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => setEditing(true)}
              aria-label="Rename aisle"
              disabled={isProtected}
              title={
                isProtected
                  ? "The default fallback section can't be renamed"
                  : undefined
              }
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={onDelete}
              aria-label="Delete aisle"
              disabled={isProtected}
              title={
                isProtected
                  ? "The default fallback section can't be removed"
                  : undefined
              }
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </li>
  );
}

function NewAisleRow({ onAdd }: { onAdd: (name: string) => void }) {
  const [draft, setDraft] = useState("");
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!draft.trim()) return;
        onAdd(draft);
        setDraft("");
      }}
    >
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Add a new section…"
        className="h-9"
        maxLength={60}
      />
      <Button type="submit" size="sm" className="gap-1.5">
        <Plus className="h-4 w-4" />
        Add
      </Button>
    </form>
  );
}

function asMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
