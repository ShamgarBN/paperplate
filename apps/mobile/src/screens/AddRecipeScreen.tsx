/**
 * AddRecipeScreen — two modes:
 *
 *   1. Manual: just the RecipeEditor with an empty draft.
 *   2. From URL: a small input on top that calls the `scrape-recipe` Supabase
 *      Edge Function and, on success, pre-fills the editor with the scraped
 *      recipe. The user reviews and tweaks before saving.
 */
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native";
import { supabase } from "../lib/supabase";
import { colors, fonts, radii } from "../theme/tokens";
import {
  RecipeEditor,
  type RecipeDraft,
  type RecipeEditorInitial,
} from "../components/RecipeEditor";

interface Props {
  onBack: () => void;
  onCreated: (recipeId: number) => void;
}

type Mode = "choose" | "fetching" | "editing";

interface ScrapedRecipe {
  title: string;
  description: string | null;
  servings: number | null;
  totalMinutes: number | null;
  sourceUrl: string;
  rawIngredients: string[];
  steps: string[];
}

export function AddRecipeScreen({ onBack, onCreated }: Props) {
  const [mode, setMode] = useState<Mode>("choose");
  const [url, setUrl] = useState("");
  const [initial, setInitial] = useState<RecipeEditorInitial>({});
  const [error, setError] = useState<string | null>(null);

  async function fetchFromUrl() {
    setError(null);
    const u = url.trim();
    if (!u) return;
    setMode("fetching");

    const { data, error: fnError } = await supabase.functions.invoke(
      "scrape-recipe",
      { body: { url: u } },
    );

    if (fnError) {
      setError(`Edge function error: ${fnError.message}`);
      setMode("choose");
      return;
    }

    if (!data || data.ok !== true) {
      setError(data?.reason ?? "Could not parse a recipe from that URL.");
      setMode("choose");
      return;
    }

    const r = data.recipe as ScrapedRecipe;
    setInitial({
      title: r.title,
      description: r.description ?? "",
      base_servings: r.servings ?? 4,
      total_min: r.totalMinutes,
      source_url: r.sourceUrl,
      image_path: (r as { imageUrl?: string | null }).imageUrl ?? null,
      ingredients: r.rawIngredients.map((raw_text) => ({
        raw_text,
        is_optional: false,
      })),
      steps: r.steps.map((text) => ({ text })),
    });
    setMode("editing");
  }

  function startManual() {
    setInitial({});
    setMode("editing");
  }

  async function save(draft: RecipeDraft) {
    const { data: recipeRow, error: recipeErr } = await supabase
      .from("recipes")
      .insert({
        title: draft.title,
        description: draft.description || null,
        base_servings: draft.base_servings,
        total_min: draft.total_min,
        source_url: draft.source_url,
        notes: draft.notes,
        image_path: draft.image_path,
      })
      .select("id")
      .single();

    if (recipeErr || !recipeRow) {
      Alert.alert(
        "Could not save recipe",
        recipeErr?.message ?? "Unknown error",
      );
      return;
    }

    const recipeId = recipeRow.id as number;

    if (draft.ingredients.length > 0) {
      const rows = draft.ingredients.map((ing, i) => ({
        recipe_id: recipeId,
        position: i,
        raw_text: ing.raw_text,
        item_canonical: ing.raw_text.toLowerCase(),
        item_display: ing.raw_text,
        is_optional: ing.is_optional,
      }));
      const { error } = await supabase.from("recipe_ingredients").insert(rows);
      if (error) {
        Alert.alert("Saved partially", `Ingredients failed: ${error.message}`);
        onCreated(recipeId);
        return;
      }
    }

    if (draft.steps.length > 0) {
      const rows = draft.steps.map((s, i) => ({
        recipe_id: recipeId,
        position: i,
        text: s.text,
      }));
      const { error } = await supabase.from("recipe_steps").insert(rows);
      if (error) {
        Alert.alert("Saved partially", `Steps failed: ${error.message}`);
        onCreated(recipeId);
        return;
      }
    }

    onCreated(recipeId);
  }

  if (mode === "editing") {
    return (
      <RecipeEditor
        initial={initial}
        headerTitle="New recipe"
        saveLabel="Save"
        onCancel={onBack}
        onSave={save}
      />
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back} hitSlop={8}>
          <Text style={styles.backText}>‹ Cancel</Text>
        </Pressable>
        <Text style={styles.headerTitle}>New recipe</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={80}
      >
        <View style={styles.body}>
          <Text style={styles.h1}>From a URL</Text>
          <Text style={styles.p}>
            Paste a recipe URL (food blog, NYT Cooking, Serious Eats, etc.)
            and we'll pull the title, ingredients, and steps for you to review.
          </Text>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            placeholder="https://..."
            placeholderTextColor={colors.mutedFg}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="done"
            onSubmitEditing={fetchFromUrl}
          />
          <Pressable
            style={[
              styles.fetchBtn,
              (!url.trim() || mode === "fetching") && styles.fetchBtnDisabled,
            ]}
            onPress={fetchFromUrl}
            disabled={!url.trim() || mode === "fetching"}
          >
            {mode === "fetching" ? (
              <ActivityIndicator color={colors.card} />
            ) : (
              <Text style={styles.fetchBtnText}>Fetch recipe</Text>
            )}
          </Pressable>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.divider} />

          <Text style={styles.h1}>Or start from scratch</Text>
          <Text style={styles.p}>
            Enter the recipe by hand — title, ingredients, and steps.
          </Text>
          <Pressable style={styles.manualBtn} onPress={startManual}>
            <Text style={styles.manualBtnText}>Manual entry</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: { paddingHorizontal: 12, paddingVertical: 6 },
  backText: { color: colors.primary, fontSize: 16, fontWeight: "600" },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: colors.primary,
    textAlign: "center",
  },
  headerSpacer: { width: 80 },

  body: { padding: 24 },
  h1: { fontSize: 22, fontWeight: "700", color: colors.primary, marginTop: 12 },
  p: {
    fontSize: 14,
    color: colors.mutedFg,
    lineHeight: 20,
    marginTop: 4,
    marginBottom: 14,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.fg,
    marginBottom: 12,
  },
  fetchBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  fetchBtnDisabled: { opacity: 0.4 },
  fetchBtnText: { color: colors.card, fontWeight: "600", fontSize: 14 },
  errorText: {
    color: colors.destructive,
    fontSize: 13,
    marginTop: 10,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 28,
  },
  manualBtn: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  manualBtnText: { color: colors.primary, fontWeight: "600", fontSize: 14 },
});
