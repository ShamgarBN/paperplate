import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Globe, Loader2, Pencil, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import {
  blankDraft,
  DraftEditor,
  type DraftState,
} from "@/components/import/DraftEditor";
import { type ReviewableIngredient } from "@/components/import/IngredientReviewer";
import { fetchRecipeHtml } from "@/lib/scraping/api";
import { uploadFromUrl } from "@/lib/uploadImage";
import { extractRecipe } from "@/lib/scraping/extract";
import type { ScrapedRecipe } from "@/lib/scraping/types";
import { parseIngredient } from "@/lib/ingredients/parser";
import { isRichTextEmpty } from "@/lib/richtext";
import { createRecipe, listCategories } from "@/lib/db/recipeRepo";
import type { Category } from "@/lib/db/schema";
import { guessCuisineCategoryName } from "@/lib/scraping/cuisineGuess";

export function ImportRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"url" | "manual">("url");
  const [url, setUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState>(blankDraft);
  const [hasDraft, setHasDraft] = useState(false);
  const [downloadingImage, setDownloadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    listCategories()
      .then(setCategories)
      .catch((err) => {
        console.error(err);
        toast.error("Could not load categories.");
      });
  }, []);

  const cuisinesByName = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of categories) {
      if (c.kind === "cuisine") map.set(c.name, c);
    }
    return map;
  }, [categories]);

  const handleScrape = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setScrapeError("Paste a URL first.");
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      setScrapeError("That doesn't look like a valid URL.");
      return;
    }
    if (!/^https?:$/.test(parsed.protocol)) {
      setScrapeError("Only http and https URLs are supported.");
      return;
    }

    setScraping(true);
    setScrapeError(null);
    try {
      const fetched = await fetchRecipeHtml(trimmed);
      if (fetched.status >= 400) {
        setScrapeError(friendlyHttpError(fetched.status, parsed.hostname));
        return;
      }
      const outcome = extractRecipe(fetched.html, {
        sourceUrl: trimmed,
        finalUrl: fetched.finalUrl,
      });
      if (!outcome.ok || !outcome.recipe) {
        setScrapeError(
          outcome.reason ??
            "Could not find a recipe on that page. Try the manual tab.",
        );
        return;
      }
      const next = scrapedToDraft(outcome.recipe, fetched.html, cuisinesByName);
      setDraft(next);
      setHasDraft(true);
      toast.success(
        `Pulled ${next.ingredients.length} ingredients and ${next.steps.length} steps from ${parsed.hostname}.`,
      );
      // Best-effort: download hero image immediately so the recipe survives a
      // dead link later. Errors are silent — the user can retry from the
      // "Cache image" button below if it fails.
      if (next.imageUrl && !next.imagePath) {
        try {
          const result = await uploadFromUrl(next.imageUrl);
          setDraft((d) => ({ ...d, imagePath: result.relativePath }));
        } catch {
          // ignore — manual button stays available as fallback
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const match = message.match(/HTTP\s+(\d{3})/);
      if (match) {
        setScrapeError(friendlyHttpError(Number(match[1]), parsed.hostname));
      } else {
        setScrapeError(message);
      }
    } finally {
      setScraping(false);
    }
  };

  const handleManualStart = () => {
    setDraft(blankDraft());
    setHasDraft(true);
    setTab("manual");
  };

  const handleDownloadImage = async () => {
    if (!draft.imageUrl) return;
    setDownloadingImage(true);
    try {
      const result = await uploadFromUrl(draft.imageUrl);
      setDraft((d) => ({ ...d, imagePath: result.relativePath }));
      toast.success("Saved hero image to Storage.");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Image download failed: ${message}`);
    } finally {
      setDownloadingImage(false);
    }
  };

  const toggleCategory = (id: number) =>
    setDraft((d) => {
      const next = new Set(d.selectedCategoryIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...d, selectedCategoryIds: next };
    });

  const handleSave = async () => {
    if (!draft.title.trim()) {
      toast.error("Give the recipe a title before saving.");
      return;
    }
    if (draft.ingredients.length === 0) {
      toast.error("A recipe needs at least one ingredient.");
      return;
    }
    setSaving(true);
    try {
      const id = await createRecipe({
        title: draft.title.trim(),
        source_url: draft.sourceUrl.trim() || null,
        image_path: draft.imagePath,
        base_servings: Math.max(1, Math.round(draft.servings)),
        prep_min: draft.prepMin,
        cook_min: draft.cookMin,
        total_min: draft.totalMin,
        difficulty: draft.difficulty,
        description: draft.description.trim() || null,
        notes: draft.notes.trim() || null,
        raw_html: draft.rawHtml,
        ingredients: draft.ingredients
          .filter((ing) => ing.raw.trim().length > 0)
          .map((ing) => ({
            raw: ing.raw,
            quantity: ing.quantity,
            unit: ing.unit,
            item_canonical: ing.itemCanonical,
            item_display: ing.itemDisplay,
            preparation: ing.preparation,
            is_optional: ing.isOptional,
            section_name: ing.sectionName,
          })),
        steps: draft.steps
          .filter((s) => !isRichTextEmpty(s.text))
          .map((s) => ({
            text: s.text,
            section_name: s.sectionName,
          })),
        categoryIds: [...draft.selectedCategoryIds],
      });
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      queryClient.invalidateQueries({ queryKey: ["recipe", id] });
      toast.success("Recipe saved.");
      navigate({ to: "/recipes/$recipeId", params: { recipeId: String(id) } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Save failed: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6">
        <h2 className="font-display text-3xl font-medium tracking-tight">
          Add a recipe
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste a URL and Paperplate pulls the ingredients and steps. If a site
          isn't supported, switch to manual entry.
        </p>
      </header>

      {!hasDraft ? (
        <Card>
          <CardContent className="p-6">
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList>
                <TabsTrigger value="url" className="gap-2">
                  <Globe className="h-3.5 w-3.5" />
                  From URL
                </TabsTrigger>
                <TabsTrigger value="manual" className="gap-2">
                  <Pencil className="h-3.5 w-3.5" />
                  Manual entry
                </TabsTrigger>
              </TabsList>
              <TabsContent value="url" className="pt-5">
                <div className="space-y-3">
                  <Label htmlFor="recipe-url">Recipe URL</Label>
                  <div className="flex gap-2">
                    <Input
                      id="recipe-url"
                      value={url}
                      onChange={(e) => {
                        setUrl(e.target.value);
                        setScrapeError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleScrape();
                      }}
                      placeholder="https://..."
                      autoFocus
                    />
                    <Button
                      onClick={handleScrape}
                      disabled={scraping || !url.trim()}
                      className="gap-1.5"
                    >
                      {scraping ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      {scraping ? "Reading..." : "Pull recipe"}
                    </Button>
                  </div>
                  {scrapeError && (
                    <p className="text-sm text-destructive">{scrapeError}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Paperplate looks for structured data on the page. No data is
                    sent to any third-party service.
                  </p>
                </div>
              </TabsContent>
              <TabsContent value="manual" className="pt-5">
                <p className="text-sm text-muted-foreground">
                  Build a recipe by hand. You can paste in your ingredients or
                  type them line by line.
                </p>
                <Button onClick={handleManualStart} className="mt-4">
                  Start blank recipe
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      ) : (
        <DraftEditor
          draft={draft}
          setDraft={setDraft}
          categories={categories}
          toggleCategory={toggleCategory}
          onCancel={() => {
            setHasDraft(false);
            setDraft(blankDraft());
          }}
          onSave={handleSave}
          onDownloadImage={handleDownloadImage}
          downloadingImage={downloadingImage}
          saving={saving}
        />
      )}
    </div>
  );
}

function scrapedToDraft(
  recipe: ScrapedRecipe,
  rawHtml: string,
  cuisineByName: Map<string, Category>,
): DraftState {
  const ingredients: ReviewableIngredient[] = recipe.rawIngredients.map(
    (raw) => ({
      ...parseIngredient(raw),
      id: crypto.randomUUID(),
      sectionName: null,
    }),
  );
  const selected = new Set<number>();
  const cuisineGuess = guessCuisineCategoryName(recipe.cuisine);
  if (cuisineGuess && cuisineByName.has(cuisineGuess)) {
    selected.add(cuisineByName.get(cuisineGuess)!.id);
  }
  return {
    title: recipe.title,
    sourceUrl: recipe.sourceUrl,
    imageUrl: recipe.imageUrl,
    imagePath: null,
    servings: recipe.servings ?? 4,
    prepMin: recipe.prepMinutes,
    cookMin: recipe.cookMinutes,
    totalMin: recipe.totalMinutes,
    difficulty: recipe.difficulty,
    description: recipe.description ?? "",
    notes: "",
    rawHtml,
    ingredients,
    steps: recipe.steps.map((text) => ({
      id: crypto.randomUUID(),
      text,
      sectionName: null,
    })),
    selectedCategoryIds: selected,
  };
}

function friendlyHttpError(status: number, hostname: string): string {
  if (status === 403 || status === 401) {
    return `${hostname} blocked the request (HTTP ${status}). Some sites (e.g. NYT Cooking, paywalled outlets, or anything behind Cloudflare) reject anything that isn't their own browser. Open the page in Safari, copy the recipe text, and use the Manual tab.`;
  }
  if (status === 404) {
    return `Page not found at ${hostname} (HTTP 404). Double-check the URL.`;
  }
  if (status === 429) {
    return `${hostname} is rate-limiting us (HTTP 429). Wait a minute and try again, or use the Manual tab.`;
  }
  if (status >= 500) {
    return `${hostname} returned a server error (HTTP ${status}). Try again later or use the Manual tab.`;
  }
  return `${hostname} returned HTTP ${status}.`;
}
