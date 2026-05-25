import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import {
  addCategory,
  deleteCategory,
  listCategories,
  renameCategory,
} from "@/lib/db/recipeRepo";
import type { Category, CategoryKind } from "@/lib/db/schema";

const KINDS: Array<{ kind: CategoryKind; label: string; description: string }> = [
  { kind: "cuisine", label: "Cuisine", description: "Italian, Mexican, etc." },
  { kind: "protein", label: "Protein", description: "Chicken, beef, vegetarian." },
  { kind: "type", label: "Type", description: "Main, Side, Dessert, Soup…" },
  {
    kind: "cooking_method",
    label: "Cooking Method",
    description: "Oven, Grill, Air-Fryer, Slow Cooker…",
  },
  { kind: "effort", label: "Effort", description: "Quick weeknight to project." },
  { kind: "tag", label: "Tag", description: "Loose labels you invent." },
  { kind: "dietary", label: "Dietary", description: "Gluten-free, dairy-free…" },
];

export function CategoriesEditor() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["all-categories"],
    queryFn: listCategories,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["all-categories"] });
    qc.invalidateQueries({ queryKey: ["categories"] });
    qc.invalidateQueries({ queryKey: ["categories-by-kind"] });
  };
  const addMut = useMutation({
    mutationFn: (params: { kind: CategoryKind; name: string }) =>
      addCategory(params.kind, params.name),
    onSuccess: refresh,
    onError: (e) => toast.error(asMessage(e)),
  });
  const renameMut = useMutation({
    mutationFn: (params: { id: number; name: string }) =>
      renameCategory(params.id, params.name),
    onSuccess: refresh,
    onError: (e) => toast.error(asMessage(e)),
  });
  const delMut = useMutation({
    mutationFn: (id: number) => deleteCategory(id),
    onSuccess: refresh,
    onError: (e) => toast.error(asMessage(e)),
  });

  const [tab, setTab] = useState<CategoryKind>("cuisine");
  const grouped = (query.data ?? []).reduce<Record<CategoryKind, Category[]>>(
    (acc, c) => {
      (acc[c.kind] ??= []).push(c);
      return acc;
    },
    {
      cuisine: [],
      protein: [],
      type: [],
      cooking_method: [],
      effort: [],
      tag: [],
      dietary: [],
    },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Categories</CardTitle>
        <CardDescription>
          Edit the labels you use to organize and filter recipes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={(v) => setTab(v as CategoryKind)}>
          <TabsList className="flex flex-wrap">
            {KINDS.map((k) => (
              <TabsTrigger key={k.kind} value={k.kind}>
                {k.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {KINDS.map((k) => (
            <TabsContent key={k.kind} value={k.kind} className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">{k.description}</p>
              <CategoryList
                items={grouped[k.kind]}
                onRename={(id, name) => renameMut.mutate({ id, name })}
                onDelete={(id) => delMut.mutate(id)}
              />
              <NewCategoryRow
                onAdd={(name) => addMut.mutate({ kind: k.kind, name })}
              />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

function CategoryList({
  items,
  onRename,
  onDelete,
}: {
  items: Category[];
  onRename: (id: number, name: string) => void;
  onDelete: (id: number) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">No items yet.</p>
    );
  }
  return (
    <ul className="divide-y rounded-md border bg-card">
      {items.map((c) => (
        <CategoryRow
          key={c.id}
          item={c}
          onRename={(name) => onRename(c.id, name)}
          onDelete={() => onDelete(c.id)}
        />
      ))}
    </ul>
  );
}

function CategoryRow({
  item,
  onRename,
  onDelete,
}: {
  item: Category;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.name);

  return (
    <li className="flex items-center justify-between px-3 py-2">
      {editing ? (
        <div className="flex flex-1 items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            className="h-8"
          />
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => {
              if (draft.trim()) {
                onRename(draft);
                setEditing(false);
              }
            }}
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
          <span className="text-sm">{item.name}</span>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => setEditing(true)}
              aria-label="Rename"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={onDelete}
              aria-label="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </li>
  );
}

function NewCategoryRow({ onAdd }: { onAdd: (name: string) => void }) {
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
        placeholder="Add a new label…"
        className="h-9"
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
