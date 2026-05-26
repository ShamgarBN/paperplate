import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Loader2, Save, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/cn";
import { uploadFile, uploadFromPath } from "@/lib/uploadImage";
import { localImageUrl } from "@/lib/assetUrl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { CategoryPicker } from "@/components/import/CategoryPicker";
import {
  IngredientReviewer,
  type ReviewableIngredient,
} from "@/components/import/IngredientReviewer";
import { StepReviewer, type StepDraft } from "@/components/import/StepReviewer";
import type { Category } from "@/lib/db/schema";

/**
 * Shape of the in-memory recipe draft used by both the import wizard and the
 * edit flow. Keeping a single shape lets us share the editor UI verbatim.
 */
export interface DraftState {
  title: string;
  sourceUrl: string;
  imageUrl: string | null;
  imagePath: string | null;
  servings: number;
  prepMin: number | null;
  cookMin: number | null;
  totalMin: number | null;
  difficulty: "easy" | "medium" | "hard" | null;
  /** Source-derived recipe blurb, shown above the ingredients. */
  description: string;
  /** Cook's tasting notes, shown at the bottom of the recipe page. */
  notes: string;
  rawHtml: string | null;
  ingredients: ReviewableIngredient[];
  steps: StepDraft[];
  selectedCategoryIds: Set<number>;
}

export const blankDraft = (): DraftState => ({
  title: "",
  sourceUrl: "",
  imageUrl: null,
  imagePath: null,
  servings: 4,
  prepMin: null,
  cookMin: null,
  totalMin: null,
  difficulty: null,
  description: "",
  notes: "",
  rawHtml: null,
  ingredients: [],
  steps: [],
  selectedCategoryIds: new Set(),
});

interface DraftEditorProps {
  draft: DraftState;
  setDraft: React.Dispatch<React.SetStateAction<DraftState>>;
  categories: Category[];
  toggleCategory: (id: number) => void;
  onCancel: () => void;
  onSave: () => void;
  onDownloadImage: () => void;
  downloadingImage: boolean;
  saving: boolean;
  /** Cancel button label — defaults to "Discard". */
  cancelLabel?: string;
  /** Save button label — defaults to "Save recipe". */
  saveLabel?: string;
}

export function DraftEditor({
  draft,
  setDraft,
  categories,
  toggleCategory,
  onCancel,
  onSave,
  onDownloadImage,
  downloadingImage,
  saving,
  cancelLabel = "Discard",
  saveLabel = "Save recipe",
}: DraftEditorProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="grid gap-4 md:grid-cols-[1fr_auto]">
            <div className="space-y-3">
              <div>
                <Label htmlFor="title" className="text-xs">
                  Title
                </Label>
                <Input
                  id="title"
                  value={draft.title}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, title: e.target.value }))
                  }
                  className="mt-1 font-display text-xl"
                  placeholder="Recipe title"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Field
                  label="Servings"
                  value={String(draft.servings)}
                  type="number"
                  onChange={(v) =>
                    setDraft((d) => ({
                      ...d,
                      servings: Math.max(1, Number(v) || 1),
                    }))
                  }
                />
                <Field
                  label="Prep (min)"
                  value={draft.prepMin == null ? "" : String(draft.prepMin)}
                  type="number"
                  onChange={(v) =>
                    setDraft((d) => ({
                      ...d,
                      prepMin: v ? Number(v) : null,
                    }))
                  }
                />
                <Field
                  label="Cook (min)"
                  value={draft.cookMin == null ? "" : String(draft.cookMin)}
                  type="number"
                  onChange={(v) =>
                    setDraft((d) => ({
                      ...d,
                      cookMin: v ? Number(v) : null,
                    }))
                  }
                />
                <Field
                  label="Total (min)"
                  value={draft.totalMin == null ? "" : String(draft.totalMin)}
                  type="number"
                  onChange={(v) =>
                    setDraft((d) => ({
                      ...d,
                      totalMin: v ? Number(v) : null,
                    }))
                  }
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label className="text-xs">Difficulty</Label>
                  <Select
                    value={draft.difficulty ?? "unset"}
                    onValueChange={(v) =>
                      setDraft((d) => ({
                        ...d,
                        difficulty:
                          v === "unset"
                            ? null
                            : (v as DraftState["difficulty"]),
                      }))
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Pick one" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unset">Not set</SelectItem>
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="source-url" className="text-xs">
                    Source URL (optional)
                  </Label>
                  <Input
                    id="source-url"
                    value={draft.sourceUrl}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, sourceUrl: e.target.value }))
                    }
                    className="mt-1"
                    placeholder="https://..."
                  />
                </div>
              </div>
            </div>
            <ImagePanel
              draft={draft}
              setDraft={setDraft}
              onDownload={onDownloadImage}
              downloading={downloadingImage}
              onClear={() =>
                setDraft((d) => ({ ...d, imageUrl: null, imagePath: null }))
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg">Ingredients</h3>
            <span className="text-xs text-muted-foreground">
              {draft.ingredients.length} item
              {draft.ingredients.length === 1 ? "" : "s"}
            </span>
          </div>
          <IngredientReviewer
            items={draft.ingredients}
            onChange={(items) =>
              setDraft((d) => ({ ...d, ingredients: items }))
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          <h3 className="font-display text-lg">Instructions</h3>
          <StepReviewer
            steps={draft.steps}
            onChange={(steps) => setDraft((d) => ({ ...d, steps }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          <h3 className="font-display text-lg">Categories</h3>
          <CategoryPicker
            categories={categories}
            selected={draft.selectedCategoryIds}
            onToggle={toggleCategory}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          <div className="flex items-baseline justify-between">
            <h3 className="font-display text-lg">Description</h3>
            <span className="text-xs text-muted-foreground">
              Short blurb shown at the top of the recipe page.
            </span>
          </div>
          <Textarea
            value={draft.description}
            onChange={(e) =>
              setDraft((d) => ({ ...d, description: e.target.value }))
            }
            placeholder="A bright, summery weeknight pasta..."
            rows={3}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          <div className="flex items-baseline justify-between">
            <h3 className="font-display text-lg">Notes</h3>
            <span className="text-xs text-muted-foreground">
              Personal cooking notes — shown at the bottom of the recipe page.
            </span>
          </div>
          <Textarea
            value={draft.notes}
            onChange={(e) =>
              setDraft((d) => ({ ...d, notes: e.target.value }))
            }
            placeholder="Tweaks for next time, swaps, occasions..."
            rows={3}
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          {cancelLabel}
        </Button>
        <Button
          onClick={onSave}
          disabled={saving || !draft.title.trim()}
          className="gap-1.5"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}

function ImagePanel({
  draft,
  setDraft,
  onDownload,
  downloading,
  onClear,
}: {
  draft: DraftState;
  setDraft: React.Dispatch<React.SetStateAction<DraftState>>;
  onDownload: () => void;
  downloading: boolean;
  onClear: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // The drop zone is the rounded card itself — `dropZoneRef` lets us measure
  // its bounding rect so we can tell whether a Tauri-reported drop position
  // landed inside it. We can't rely on the OS to scope drops for us because
  // Tauri's `onDragDropEvent` fires for the whole webview window.
  const dropZoneRef = useRef<HTMLDivElement | null>(null);
  // Drop state is tracked in a ref-style counter to avoid the flicker that
  // happens when a child element fires dragLeave during the drag — counting
  // enter/leave keeps the highlight on while the cursor moves over text.
  const dragDepth = useRef(0);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [resolvedCachedUrl, setResolvedCachedUrl] = useState<string | null>(
    null,
  );

  // Resolve `imagePath` (a relative path under $APPLOCALDATA) into a tauri://
  // asset URL so the user can see the image they just dropped, rather than
  // the generic "Cached locally" placeholder.
  useEffect(() => {
    let active = true;
    if (draft.imagePath) {
      localImageUrl(draft.imagePath).then((u) => {
        if (active) setResolvedCachedUrl(u);
      });
    } else {
      setResolvedCachedUrl(null);
    }
    return () => {
      active = false;
    };
  }, [draft.imagePath]);

  // Shared "we got a file, persist it" path used by the Tauri drag-drop API,
  // the HTML5 fallback, and the file picker. Keeps the success/error UX
  // consistent regardless of how the file arrived.
  const applySavedImage = (result: { relativePath: string }) => {
    setDraft((d) => ({
      ...d,
      imagePath: result.relativePath,
      // Clear the imageUrl too so the panel shows the locally-cached
      // version rather than holding onto the original (now-redundant)
      // remote URL.
      imageUrl: null,
    }));
    toast.success("Image saved.");
  };
  const reportSaveError = (err: unknown) => {
    toast.error(
      `Could not save image: ${err instanceof Error ? err.message : String(err)}`,
    );
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0]!;
    setUploading(true);
    try {
      const result = await uploadFile(file);
      applySavedImage(result);
    } catch (err) {
      reportSaveError(err);
    } finally {
      setUploading(false);
    }
  };

  const handleDroppedPath = async (path: string) => {
    setUploading(true);
    try {
      const result = await uploadFromPath(path);
      applySavedImage(result);
    } catch (err) {
      reportSaveError(err);
    } finally {
      setUploading(false);
    }
  };

  // Wire up Tauri's native drag-drop pipeline. In the packaged app the OS
  // hands the file path straight to Tauri *before* the webview ever sees an
  // HTML5 drag event, so the HTML5 handlers below never fire for Finder
  // drags. Tauri's event delivers a physical-pixel cursor position and a
  // file path; we scope acceptance to this panel by comparing the position
  // against the drop zone's bounding client rect.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    const pointInZone = (px: number, py: number): boolean => {
      const el = dropZoneRef.current;
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      // Tauri 2 delivers `PhysicalPosition`, so we divide by DPR to get
      // CSS pixels for the rect comparison.
      const scale = window.devicePixelRatio || 1;
      const x = px / scale;
      const y = py / scale;
      return (
        x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
      );
    };

    (async () => {
      try {
        // Lazy import keeps the browser-preview / vitest builds from
        // requiring `@tauri-apps/api/webview` (which throws when there is
        // no Tauri runtime). If the import fails the HTML5 handlers below
        // continue to provide a workable fallback in non-Tauri contexts.
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        if (cancelled) return;
        const webview = getCurrentWebview();
        unlisten = await webview.onDragDropEvent((event) => {
          const payload = event.payload;
          if (payload.type === "leave") {
            dragDepth.current = 0;
            setDragOver(false);
            return;
          }
          const inside = pointInZone(payload.position.x, payload.position.y);
          if (payload.type === "enter" || payload.type === "over") {
            setDragOver(inside);
            return;
          }
          if (payload.type === "drop") {
            setDragOver(false);
            if (!inside) return;
            const first = payload.paths?.[0];
            if (first) void handleDroppedPath(first);
          }
        });
      } catch {
        // Either we're not in Tauri, or the API surface changed — the
        // HTML5 handlers on the drop zone keep the UI usable.
      }
    })();

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
    // We intentionally don't depend on `handleDroppedPath`: it closes over
    // the latest `setDraft` through React's closure and the listener only
    // needs to be installed once for the panel's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = 0;
    setDragOver(false);
    handleFiles(event.dataTransfer?.files ?? null);
  };

  const onDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!Array.from(event.dataTransfer?.items ?? []).some((i) => i.kind === "file")) {
      return;
    }
    dragDepth.current += 1;
    setDragOver(true);
  };

  const onDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  };

  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    // The browser only treats this as a drop target when we call
    // preventDefault on dragover — otherwise the drop event never fires.
    event.preventDefault();
    event.stopPropagation();
  };

  const hasImage = !!(draft.imageUrl || draft.imagePath);
  const previewSrc = draft.imageUrl ?? resolvedCachedUrl;

  return (
    <div
      onDrop={onDrop}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      className={cn(
        "flex w-40 shrink-0 flex-col items-center gap-2",
        hasImage ? "" : "h-40",
      )}
    >
      <div
        ref={dropZoneRef}
        className={cn(
          "relative flex h-32 w-40 items-center justify-center overflow-hidden rounded-lg border bg-muted text-muted-foreground transition-colors",
          dragOver
            ? "border-primary bg-primary/5 ring-2 ring-primary"
            : "border-dashed",
        )}
        role="button"
        tabIndex={0}
        aria-label="Drop or click to set hero image"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
      >
        {previewSrc ? (
          <img
            src={previewSrc}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : uploading ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : (
          <div className="flex flex-col items-center gap-1 px-3 text-center text-[11px]">
            <Upload className="h-5 w-5" />
            <span>
              Drop an image
              <br />
              or click to browse
            </span>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            // Reset the input so picking the same file twice still fires
            // `change`.
            e.target.value = "";
          }}
        />
      </div>
      {draft.imageUrl && !draft.imagePath && (
        <Button
          variant="outline"
          size="sm"
          onClick={onDownload}
          disabled={downloading}
          className="w-full text-xs"
        >
          {downloading ? "Caching..." : "Cache locally"}
        </Button>
      )}
      {hasImage ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="w-full text-xs text-muted-foreground"
        >
          Remove image
        </Button>
      ) : (
        <p className="text-center text-[10px] text-muted-foreground">
          JPG, PNG, WebP, GIF, or AVIF up to 8 MB.
        </p>
      )}
      {uploading && previewSrc && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving…
        </span>
      )}
      {/* Placeholder so the type-check is satisfied — the helper above
          consumes ImageIcon when there's no preview yet. Keeping the
          import in this file means callers don't need to know about the
          fallback layout. */}
      {!hasImage && !uploading && (
        <span className="sr-only" aria-hidden>
          <ImageIcon />
        </span>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1"
      />
    </div>
  );
}
