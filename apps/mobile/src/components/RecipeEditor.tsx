/**
 * Shared recipe form used by both AddRecipeScreen and EditRecipeScreen.
 *
 * Owns all the form state and presentation. Persistence is delegated to the
 * caller via `onSave(draft)`; that's where Add vs Edit diverge (INSERT vs
 * UPDATE + delete-and-insert children).
 */
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native";

export interface IngredientDraft {
  raw_text: string;
  is_optional: boolean;
}

export interface StepDraft {
  text: string;
}

export interface RecipeDraft {
  title: string;
  description: string;
  base_servings: number;
  total_min: number | null;
  source_url: string | null;
  notes: string | null;
  ingredients: IngredientDraft[];
  steps: StepDraft[];
}

export interface RecipeEditorInitial {
  title?: string;
  description?: string;
  base_servings?: number;
  total_min?: number | null;
  source_url?: string | null;
  notes?: string | null;
  ingredients?: IngredientDraft[];
  steps?: StepDraft[];
}

interface Props {
  /** Pre-filled values when editing; defaults when creating. */
  initial: RecipeEditorInitial;
  headerTitle: string;
  saveLabel?: string;
  onCancel: () => void;
  /** Returns nothing; caller resolves on its own and triggers navigation. */
  onSave: (draft: RecipeDraft) => Promise<void>;
}

export function RecipeEditor({
  initial,
  headerTitle,
  saveLabel = "Save",
  onCancel,
  onSave,
}: Props) {
  const [title, setTitle] = useState(initial.title ?? "");
  const [description, setDescription] = useState(initial.description ?? "");
  const [servings, setServings] = useState(
    String(initial.base_servings ?? 4),
  );
  const [totalMin, setTotalMin] = useState(
    initial.total_min != null ? String(initial.total_min) : "",
  );
  const [sourceUrl, setSourceUrl] = useState(initial.source_url ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [ingredients, setIngredients] = useState<IngredientDraft[]>(
    initial.ingredients && initial.ingredients.length > 0
      ? initial.ingredients
      : [{ raw_text: "", is_optional: false }],
  );
  const [steps, setSteps] = useState<StepDraft[]>(
    initial.steps && initial.steps.length > 0
      ? initial.steps
      : [{ text: "" }],
  );
  const [saving, setSaving] = useState(false);

  function updateIngredient(idx: number, patch: Partial<IngredientDraft>) {
    setIngredients((prev) => {
      const next = prev.slice();
      next[idx] = { ...next[idx]!, ...patch };
      return next;
    });
  }
  function addIngredientRow() {
    setIngredients((prev) => [...prev, { raw_text: "", is_optional: false }]);
  }
  function removeIngredientRow(idx: number) {
    setIngredients((prev) =>
      prev.length === 1 ? prev : prev.filter((_, i) => i !== idx),
    );
  }
  function updateStep(idx: number, patch: Partial<StepDraft>) {
    setSteps((prev) => {
      const next = prev.slice();
      next[idx] = { ...next[idx]!, ...patch };
      return next;
    });
  }
  function addStepRow() {
    setSteps((prev) => [...prev, { text: "" }]);
  }
  function removeStepRow(idx: number) {
    setSteps((prev) =>
      prev.length === 1 ? prev : prev.filter((_, i) => i !== idx),
    );
  }

  const canSave =
    title.trim().length > 0 &&
    !Number.isNaN(Number(servings)) &&
    Number(servings) > 0;

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    const tm = totalMin.trim() === "" ? null : Number(totalMin);
    const draft: RecipeDraft = {
      title: title.trim(),
      description: description.trim(),
      base_servings: Math.max(1, Number(servings)),
      total_min: tm != null && !Number.isNaN(tm) ? tm : null,
      source_url: sourceUrl.trim() || null,
      notes: notes.trim() || null,
      ingredients: ingredients.filter((i) => i.raw_text.trim().length > 0),
      steps: steps.filter((s) => s.text.trim().length > 0),
    };
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={onCancel} style={styles.back} hitSlop={8}>
          <Text style={styles.backText}>‹ Cancel</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{headerTitle}</Text>
        <Pressable
          onPress={handleSave}
          disabled={!canSave || saving}
          style={[styles.saveBtn, (!canSave || saving) && styles.saveBtnDisabled]}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>{saveLabel}</Text>
          )}
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={80}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.label}>Title *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Sheet-pan honey-mustard salmon"
            placeholderTextColor="#9aa0a6"
          />

          <Text style={styles.label}>Short description</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            multiline
            placeholder="Optional. One sentence about the dish."
            placeholderTextColor="#9aa0a6"
          />

          <View style={styles.row2col}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>Base servings *</Text>
              <TextInput
                style={styles.input}
                value={servings}
                onChangeText={setServings}
                keyboardType="number-pad"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.label}>Total time (min)</Text>
              <TextInput
                style={styles.input}
                value={totalMin}
                onChangeText={setTotalMin}
                keyboardType="number-pad"
                placeholder="Optional"
                placeholderTextColor="#9aa0a6"
              />
            </View>
          </View>

          <Text style={styles.label}>Source URL</Text>
          <TextInput
            style={styles.input}
            value={sourceUrl}
            onChangeText={setSourceUrl}
            placeholder="Optional"
            placeholderTextColor="#9aa0a6"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          <Text style={styles.sectionHeading}>Ingredients</Text>
          {ingredients.map((ing, idx) => (
            <View key={idx} style={styles.listRow}>
              <Text style={styles.listIdx}>•</Text>
              <TextInput
                style={[styles.input, styles.listInput]}
                value={ing.raw_text}
                onChangeText={(t) => updateIngredient(idx, { raw_text: t })}
                placeholder='e.g. "1 cup flour" or "salt to taste"'
                placeholderTextColor="#9aa0a6"
              />
              <Pressable
                onPress={() => removeIngredientRow(idx)}
                style={styles.removeRowBtn}
                hitSlop={6}
              >
                <Text style={styles.removeRowText}>×</Text>
              </Pressable>
            </View>
          ))}
          <Pressable onPress={addIngredientRow} style={styles.addRowBtn}>
            <Text style={styles.addRowText}>+ Add ingredient</Text>
          </Pressable>

          <Text style={styles.sectionHeading}>Steps</Text>
          {steps.map((s, idx) => (
            <View key={idx} style={styles.listRow}>
              <Text style={styles.listIdx}>{idx + 1}</Text>
              <TextInput
                style={[styles.input, styles.listInput, styles.multiline]}
                value={s.text}
                onChangeText={(t) => updateStep(idx, { text: t })}
                multiline
                placeholder="Describe this step"
                placeholderTextColor="#9aa0a6"
              />
              <Pressable
                onPress={() => removeStepRow(idx)}
                style={styles.removeRowBtn}
                hitSlop={6}
              >
                <Text style={styles.removeRowText}>×</Text>
              </Pressable>
            </View>
          ))}
          <Pressable onPress={addStepRow} style={styles.addRowBtn}>
            <Text style={styles.addRowText}>+ Add step</Text>
          </Pressable>

          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder='Personal notes. "Tastes better next day", "use full-fat", etc.'
            placeholderTextColor="#9aa0a6"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4ede0" },
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
  saveBtn: {
    backgroundColor: "#2e6f70",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },

  scroll: { padding: 24, paddingBottom: 60 },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#3c4043",
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dcdcdc",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: "#202124",
  },
  multiline: { minHeight: 60, textAlignVertical: "top" },
  row2col: { flexDirection: "row" },

  sectionHeading: {
    fontSize: 20,
    fontWeight: "700",
    color: "#2e6f70",
    marginTop: 28,
    marginBottom: 8,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  listIdx: {
    width: 22,
    fontSize: 14,
    color: "#5f6368",
    fontWeight: "600",
    marginTop: 12,
  },
  listInput: { flex: 1 },
  removeRowBtn: {
    width: 32,
    height: 32,
    marginLeft: 4,
    marginTop: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  removeRowText: { fontSize: 22, color: "#b3261e", fontWeight: "600" },
  addRowBtn: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  addRowText: { color: "#2e6f70", fontSize: 14, fontWeight: "600" },
});
