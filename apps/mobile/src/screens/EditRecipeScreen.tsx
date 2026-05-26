/**
 * Edit an existing recipe. Loads recipe + ingredients + steps from Supabase
 * and pre-fills the shared RecipeEditor. On save: UPDATE the recipe row,
 * DELETE all of its ingredient and step children, then INSERT the new
 * lists. The delete-and-insert strategy is intentional — recipes are small,
 * positional indices change freely on edit, and the alternative (diffing by
 * id and patching in-place) is a lot of code for negligible win on this
 * data scale.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native";
import { supabase } from "../lib/supabase";
import {
  RecipeEditor,
  type RecipeDraft,
  type RecipeEditorInitial,
} from "../components/RecipeEditor";

interface Props {
  recipeId: number;
  onBack: () => void;
  onSaved: (recipeId: number) => void;
}

export function EditRecipeScreen({ recipeId, onBack, onSaved }: Props) {
  const [initial, setInitial] = useState<RecipeEditorInitial | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [r, ing, stp] = await Promise.all([
        supabase
          .from("recipes")
          .select(
            "title, description, base_servings, total_min, source_url, notes, image_path",
          )
          .eq("id", recipeId)
          .single(),
        supabase
          .from("recipe_ingredients")
          .select("raw_text, is_optional, position")
          .eq("recipe_id", recipeId)
          .order("position"),
        supabase
          .from("recipe_steps")
          .select("text, position")
          .eq("recipe_id", recipeId)
          .order("position"),
      ]);
      if (cancelled) return;
      const e = r.error || ing.error || stp.error;
      if (e) {
        setError(e.message);
        return;
      }
      const recipe = r.data as any;
      setInitial({
        title: recipe.title,
        description: recipe.description ?? "",
        base_servings: recipe.base_servings,
        total_min: recipe.total_min,
        source_url: recipe.source_url,
        notes: recipe.notes,
        image_path: recipe.image_path,
        ingredients: (ing.data ?? []).map((row: any) => ({
          raw_text: row.raw_text,
          is_optional: !!row.is_optional,
        })),
        steps: (stp.data ?? []).map((row: any) => ({ text: row.text })),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [recipeId]);

  async function save(draft: RecipeDraft) {
    // Update the recipe row itself.
    const { error: updErr } = await supabase
      .from("recipes")
      .update({
        title: draft.title,
        description: draft.description || null,
        base_servings: draft.base_servings,
        total_min: draft.total_min,
        source_url: draft.source_url,
        notes: draft.notes,
        image_path: draft.image_path,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recipeId);

    if (updErr) {
      Alert.alert("Could not save", updErr.message);
      return;
    }

    // Wipe and rewrite children. Order doesn't matter — children only
    // reference the recipe, not each other.
    const [delIng, delStp] = await Promise.all([
      supabase.from("recipe_ingredients").delete().eq("recipe_id", recipeId),
      supabase.from("recipe_steps").delete().eq("recipe_id", recipeId),
    ]);
    if (delIng.error || delStp.error) {
      Alert.alert(
        "Save failed mid-flight",
        delIng.error?.message ?? delStp.error?.message ?? "Unknown error",
      );
      return;
    }

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
        Alert.alert("Save failed", `Ingredients failed: ${error.message}`);
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
        Alert.alert("Save failed", `Steps failed: ${error.message}`);
        return;
      }
    }

    onSaved(recipeId);
  }

  if (error) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!initial) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.centered}>
          <ActivityIndicator color="#2e6f70" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <RecipeEditor
      initial={initial}
      headerTitle="Edit recipe"
      saveLabel="Save"
      onCancel={onBack}
      onSave={save}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4ede0" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: "#b3261e", fontSize: 16, padding: 24 },
});
