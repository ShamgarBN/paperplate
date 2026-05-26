import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native";
import { supabase } from "../lib/supabase";

interface Recipe {
  id: number;
  title: string;
  description: string | null;
  base_servings: number;
  preferred_servings: number | null;
  prep_min: number | null;
  cook_min: number | null;
  total_min: number | null;
  source_url: string | null;
  notes: string | null;
  last_cooked_at: string | null;
  image_path: string | null;
}

interface Ingredient {
  id: number;
  position: number;
  raw_text: string;
  item_display: string;
  quantity: number | null;
  unit: string | null;
  is_optional: boolean;
  section_name: string | null;
}

interface Step {
  id: number;
  position: number;
  text: string;
  section_name: string | null;
}

interface Props {
  recipeId: number;
  onBack: () => void;
  onEdit?: (recipeId: number) => void;
  /** Cache-busting key from parent so we can re-fetch after an edit. */
  reloadKey?: number;
}

type CookedState = "idle" | "marking" | "marked";
type AddedState = "idle" | "adding" | "added";

export function RecipeDetailScreen({ recipeId, onBack, onEdit, reloadKey }: Props) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[] | null>(null);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [servings, setServings] = useState<number | null>(null);
  const [cookedState, setCookedState] = useState<CookedState>("idle");
  const [addedState, setAddedState] = useState<AddedState>("idle");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [r, ing, stp] = await Promise.all([
        supabase
          .from("recipes")
          .select(
            "id, title, description, base_servings, preferred_servings, prep_min, cook_min, total_min, source_url, notes, last_cooked_at, image_path",
          )
          .eq("id", recipeId)
          .single(),
        supabase
          .from("recipe_ingredients")
          .select(
            "id, position, raw_text, item_display, quantity, unit, is_optional, section_name",
          )
          .eq("recipe_id", recipeId)
          .order("position"),
        supabase
          .from("recipe_steps")
          .select("id, position, text, section_name")
          .eq("recipe_id", recipeId)
          .order("position"),
      ]);
      if (cancelled) return;
      const e = r.error || ing.error || stp.error;
      if (e) {
        setError(e.message);
        return;
      }
      const recipeRow = r.data as Recipe;
      setRecipe(recipeRow);
      setIngredients((ing.data ?? []) as Ingredient[]);
      setSteps((stp.data ?? []) as Step[]);
      setServings(recipeRow.preferred_servings ?? recipeRow.base_servings);
      setCookedState(isCookedToday(recipeRow.last_cooked_at) ? "marked" : "idle");
    })();
    return () => {
      cancelled = true;
    };
  }, [recipeId, reloadKey]);

  const scaleFactor = useMemo(() => {
    if (!recipe || !servings) return 1;
    return servings / Math.max(1, recipe.base_servings);
  }, [recipe, servings]);

  async function changeServings(delta: number) {
    if (!recipe || !servings) return;
    const next = Math.max(1, servings + delta);
    setServings(next);
    // Persist as preferred_servings so the choice survives across sessions.
    // Best-effort — if it fails we don't roll back; the local UI still shows
    // the new value for this session.
    void supabase
      .from("recipes")
      .update({ preferred_servings: next })
      .eq("id", recipe.id);
  }

  async function markCookedToday() {
    if (!recipe || cookedState !== "idle") return;
    setCookedState("marking");
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("recipes")
      .update({ last_cooked_at: now })
      .eq("id", recipe.id);
    if (error) {
      setCookedState("idle");
      return;
    }
    setRecipe({ ...recipe, last_cooked_at: now });
    setCookedState("marked");
  }

  async function addToShoppingList() {
    if (!recipe || !servings || addedState !== "idle") return;
    setAddedState("adding");
    const { error } = await supabase.from("shopping_list_recipes").insert({
      recipe_id: recipe.id,
      scaled_servings: servings,
    });
    if (error) {
      setAddedState("idle");
      return;
    }
    setAddedState("added");
  }

  if (error) {
    return (
      <SafeAreaView style={styles.root}>
        <Header onBack={onBack} title="" />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!recipe || !ingredients || !steps || servings == null) {
    return (
      <SafeAreaView style={styles.root}>
        <Header onBack={onBack} title="" />
        <View style={styles.centered}>
          <ActivityIndicator color="#2e6f70" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const ingredientSections = groupBySection(ingredients);
  const stepSections = groupBySection(steps);

  return (
    <SafeAreaView style={styles.root}>
      <Header
        onBack={onBack}
        title={recipe.title}
        onEdit={onEdit ? () => onEdit(recipe.id) : undefined}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        {isHttpUrl(recipe.image_path) ? (
          <Image
            source={{ uri: recipe.image_path as string }}
            style={styles.heroImage}
            resizeMode="cover"
          />
        ) : null}
        <Text style={styles.title}>{recipe.title}</Text>

        {recipe.description ? (
          <Text style={styles.description}>{recipe.description}</Text>
        ) : null}

        {/* Servings scaler */}
        <View style={styles.scalerRow}>
          <Text style={styles.scalerLabel}>Servings</Text>
          <Pressable
            onPress={() => changeServings(-1)}
            disabled={servings <= 1}
            style={[styles.stepBtn, servings <= 1 && styles.stepBtnDisabled]}
            hitSlop={6}
          >
            <Text style={styles.stepBtnText}>−</Text>
          </Pressable>
          <Text style={styles.scalerValue}>{servings}</Text>
          <Pressable
            onPress={() => changeServings(1)}
            style={styles.stepBtn}
            hitSlop={6}
          >
            <Text style={styles.stepBtnText}>+</Text>
          </Pressable>
          {recipe.total_min ? (
            <Text style={styles.timePill}>{recipe.total_min} min</Text>
          ) : null}
        </View>

        {/* Quick presets, matches desktop's 1/4×, 1/3×, 1/2×, 1×, 2×, 3× */}
        <View style={styles.presetsRow}>
          {[0.25, 0.333, 0.5, 1, 2, 3].map((mult) => {
            const target = Math.max(1, Math.round(recipe.base_servings * mult));
            const active = target === servings;
            const label =
              mult === 0.25
                ? "¼×"
                : mult === 0.333
                  ? "⅓×"
                  : mult === 0.5
                    ? "½×"
                    : `${mult}×`;
            return (
              <Pressable
                key={mult}
                onPress={() => {
                  setServings(target);
                  void supabase
                    .from("recipes")
                    .update({ preferred_servings: target })
                    .eq("id", recipe.id);
                }}
                style={[styles.presetBtn, active && styles.presetBtnActive]}
              >
                <Text
                  style={[
                    styles.presetText,
                    active && styles.presetTextActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Action buttons */}
        <View style={styles.actionsRow}>
          <Pressable
            onPress={markCookedToday}
            disabled={cookedState !== "idle"}
            style={[
              styles.actionBtn,
              cookedState === "marked" && styles.actionBtnDone,
            ]}
          >
            {cookedState === "marking" ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.actionBtnText}>
                {cookedState === "marked" ? "Cooked today ✓" : "Cooked today"}
              </Text>
            )}
          </Pressable>
          <Pressable
            onPress={addToShoppingList}
            disabled={addedState !== "idle"}
            style={[
              styles.actionBtn,
              styles.actionBtnSecondary,
              addedState === "added" && styles.actionBtnDone,
            ]}
          >
            {addedState === "adding" ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.actionBtnText}>
                {addedState === "added" ? "Added ✓" : "Add to shopping list"}
              </Text>
            )}
          </Pressable>
        </View>

        <Text style={styles.sectionHeading}>Ingredients</Text>
        {ingredientSections.map(([section, items]) => (
          <View key={`ing-${section ?? "_"}`} style={styles.section}>
            {section ? <Text style={styles.subsection}>{section}</Text> : null}
            {items.map((it) => (
              <View key={it.id} style={styles.ingredientRow}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.ingredientText}>
                  {formatIngredient(it, scaleFactor)}
                  {it.is_optional ? (
                    <Text style={styles.optional}> (optional)</Text>
                  ) : null}
                </Text>
              </View>
            ))}
          </View>
        ))}

        <Text style={styles.sectionHeading}>Steps</Text>
        {stepSections.map(([section, items]) => (
          <View key={`stp-${section ?? "_"}`} style={styles.section}>
            {section ? <Text style={styles.subsection}>{section}</Text> : null}
            {items.map((s, idx) => (
              <View key={s.id} style={styles.stepRow}>
                <Text style={styles.stepNum}>{idx + 1}</Text>
                <Text style={styles.stepText}>{s.text}</Text>
              </View>
            ))}
          </View>
        ))}

        {recipe.notes ? (
          <>
            <Text style={styles.sectionHeading}>Notes</Text>
            <Text style={styles.notes}>{recipe.notes}</Text>
          </>
        ) : null}

        {recipe.source_url ? (
          <Text style={styles.source} numberOfLines={1}>
            Source: {recipe.source_url}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({
  onBack,
  title,
  onEdit,
}: {
  onBack: () => void;
  title: string;
  onEdit?: () => void;
}) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} style={styles.back} hitSlop={8}>
        <Text style={styles.backText}>‹ Library</Text>
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      {onEdit ? (
        <Pressable onPress={onEdit} style={styles.editBtn} hitSlop={8}>
          <Text style={styles.editBtnText}>Edit</Text>
        </Pressable>
      ) : (
        <View style={styles.headerSpacer} />
      )}
    </View>
  );
}

function groupBySection<T extends { section_name: string | null }>(
  rows: T[],
): Array<[string | null, T[]]> {
  const groups = new Map<string | null, T[]>();
  for (const r of rows) {
    const key = r.section_name && r.section_name.length > 0 ? r.section_name : null;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  return Array.from(groups.entries());
}

function formatIngredient(it: Ingredient, factor: number): string {
  // When we have a structured quantity, scale it and rebuild the display.
  // Otherwise fall back to the source's raw_text (e.g. "salt to taste").
  if (it.quantity != null) {
    const scaled = it.quantity * factor;
    const qtyStr = formatQuantity(scaled);
    const unit = it.unit ? ` ${it.unit}` : "";
    return `${qtyStr}${unit} ${it.item_display}`;
  }
  if (it.raw_text && it.raw_text.trim().length > 0) return it.raw_text;
  return it.item_display;
}

/**
 * Formats a number as a mixed fraction when it lands near common cooking
 * fractions (1/4, 1/3, 1/2, 2/3, 3/4), otherwise as a 2-decimal value with
 * trailing zeros trimmed. Matches the desktop app's display conventions.
 */
function formatQuantity(n: number): string {
  if (n <= 0) return "0";
  const whole = Math.floor(n);
  const frac = n - whole;
  const FRACTIONS: Array<[number, string]> = [
    [0, ""],
    [0.25, "¼"],
    [0.333, "⅓"],
    [0.5, "½"],
    [0.667, "⅔"],
    [0.75, "¾"],
    [1, "1"],
  ];
  // Find nearest tabulated fraction within 0.04 tolerance.
  let best: [number, string] | null = null;
  for (const f of FRACTIONS) {
    if (Math.abs(frac - f[0]) < 0.04) {
      best = f;
      break;
    }
  }
  if (best) {
    if (best[0] === 0) return String(whole || 0);
    if (best[0] === 1) return String(whole + 1);
    return whole === 0 ? best[1] : `${whole} ${best[1]}`;
  }
  // No clean fraction; show decimal.
  return Number.isInteger(n) ? String(n) : (Math.round(n * 100) / 100).toString();
}

function isHttpUrl(value: string | null | undefined): boolean {
  return (
    typeof value === "string" &&
    (value.startsWith("http://") || value.startsWith("https://"))
  );
}

function isCookedToday(iso: string | null): boolean {
  if (!iso) return false;
  const now = new Date();
  const cooked = new Date(iso);
  return (
    cooked.getFullYear() === now.getFullYear() &&
    cooked.getMonth() === now.getMonth() &&
    cooked.getDate() === now.getDate()
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4ede0" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: "#b3261e", fontSize: 16, padding: 24 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e6dec9",
    backgroundColor: "#f4ede0",
  },
  back: { paddingHorizontal: 12, paddingVertical: 6 },
  backText: { color: "#2e6f70", fontSize: 16, fontWeight: "600" },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#2e6f70",
    textAlign: "center",
  },
  headerSpacer: { width: 100 },
  editBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#2e6f70",
    borderRadius: 8,
    width: 80,
    alignItems: "center",
  },
  editBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },

  scroll: { padding: 24, paddingBottom: 60 },
  heroImage: {
    width: "100%",
    height: 240,
    borderRadius: 14,
    backgroundColor: "#e6dec9",
    marginBottom: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#202124",
    marginBottom: 8,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: "#3c4043",
    marginBottom: 16,
    fontStyle: "italic",
  },

  scalerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  scalerLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#5f6368",
    marginRight: 12,
  },
  scalerValue: {
    fontSize: 22,
    fontWeight: "700",
    color: "#202124",
    minWidth: 36,
    textAlign: "center",
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dcdcdc",
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnDisabled: { opacity: 0.4 },
  stepBtnText: { fontSize: 22, fontWeight: "700", color: "#2e6f70", lineHeight: 24 },
  timePill: {
    marginLeft: "auto",
    backgroundColor: "#e6dec9",
    color: "#5f4a1a",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    fontSize: 13,
    fontWeight: "600",
    overflow: "hidden",
  },

  presetsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 16,
  },
  presetBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#dcdcdc",
    backgroundColor: "#fff",
    marginRight: 6,
    marginBottom: 6,
  },
  presetBtnActive: { backgroundColor: "#2e6f70", borderColor: "#2e6f70" },
  presetText: { fontSize: 13, color: "#3c4043", fontWeight: "600" },
  presetTextActive: { color: "#fff" },

  actionsRow: { flexDirection: "row", marginBottom: 8 },
  actionBtn: {
    flex: 1,
    backgroundColor: "#2e6f70",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginRight: 8,
  },
  actionBtnSecondary: { marginRight: 0, marginLeft: 0, backgroundColor: "#5f8b8b" },
  actionBtnDone: { backgroundColor: "#7fb069" },
  actionBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },

  sectionHeading: {
    fontSize: 20,
    fontWeight: "700",
    color: "#2e6f70",
    marginTop: 24,
    marginBottom: 12,
  },
  section: { marginBottom: 4 },
  subsection: {
    fontSize: 15,
    fontWeight: "600",
    color: "#5f6368",
    marginTop: 8,
    marginBottom: 6,
  },
  ingredientRow: { flexDirection: "row", marginBottom: 6 },
  bullet: { color: "#2e6f70", fontSize: 16, width: 16, marginTop: 1 },
  ingredientText: { flex: 1, fontSize: 15, color: "#202124", lineHeight: 22 },
  optional: { color: "#5f6368", fontStyle: "italic" },
  stepRow: { flexDirection: "row", marginBottom: 12, alignItems: "flex-start" },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#2e6f70",
    color: "#fff",
    textAlign: "center",
    lineHeight: 28,
    fontWeight: "700",
    fontSize: 14,
    marginRight: 12,
    overflow: "hidden",
  },
  stepText: { flex: 1, fontSize: 15, color: "#202124", lineHeight: 22 },
  notes: { fontSize: 15, color: "#3c4043", lineHeight: 22, marginBottom: 16 },
  source: { fontSize: 12, color: "#5f6368", marginTop: 24 },
});
