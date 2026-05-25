import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { supabase } from "../lib/supabase";
import { RecipePickerModal } from "../components/RecipePickerModal";

interface Plan {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
}

interface Slot {
  id: number;
  date: string;
  slot: "breakfast" | "lunch" | "dinner";
  scaled_servings: number | null;
  is_locked: boolean;
}

interface SlotRecipe {
  id: number;
  slot_id: number;
  recipe_id: number;
  scaled_servings: number | null;
  position: number;
  recipe: { id: number; title: string; base_servings: number };
}

interface Props {
  planId: number;
  onBack: () => void;
  onOpenRecipe: (recipeId: number) => void;
}

const SLOT_ORDER: Record<string, number> = {
  breakfast: 1,
  lunch: 2,
  dinner: 3,
};

export function PlanDetailScreen({ planId, onBack, onOpenRecipe }: Props) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotRecipes, setSlotRecipes] = useState<SlotRecipe[] | null>(null);
  const [dayNotes, setDayNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  // Active picker slot — when set, the recipe-picker modal is open and
  // whatever the user picks will be attached to this slot.
  const [pickerSlot, setPickerSlot] = useState<Slot | null>(null);
  // Per-day note draft state; we debounce-save to Supabase on blur.
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError(null);
    const [p, s, dn] = await Promise.all([
      supabase
        .from("meal_plans")
        .select("id, name, start_date, end_date")
        .eq("id", planId)
        .single(),
      supabase
        .from("meal_plan_slots")
        .select("id, date, slot, scaled_servings, is_locked")
        .eq("plan_id", planId)
        .order("date")
        .order("slot"),
      supabase
        .from("meal_plan_day_notes")
        .select("date, notes")
        .eq("plan_id", planId),
    ]);
    const e = p.error || s.error || dn.error;
    if (e) {
      setError(e.message);
      return;
    }
    const slotRows = (s.data ?? []) as Slot[];
    setPlan(p.data as Plan);
    setSlots(slotRows);
    const noteMap: Record<string, string> = {};
    for (const n of (dn.data ?? []) as any[]) {
      noteMap[n.date] = n.notes;
    }
    setDayNotes(noteMap);
    setNoteDrafts(noteMap);

    if (slotRows.length > 0) {
      const sr = await supabase
        .from("meal_plan_slot_recipes")
        .select(
          "id, slot_id, recipe_id, scaled_servings, position, recipe:recipes(id, title, base_servings)",
        )
        .in(
          "slot_id",
          slotRows.map((x) => x.id),
        )
        .order("position");
      if (sr.error) {
        setError(sr.error.message);
        return;
      }
      const rows = (sr.data ?? []).map((r: any) => ({
        ...r,
        recipe: Array.isArray(r.recipe) ? r.recipe[0] : r.recipe,
      })) as SlotRecipe[];
      setSlotRecipes(rows);
    } else {
      setSlotRecipes([]);
    }
  }, [planId]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveDayNote(date: string, notes: string) {
    const trimmed = notes.trim().slice(0, 2_000);
    const stored = dayNotes[date] ?? "";
    if (trimmed === stored) return;
    if (trimmed === "") {
      const { error } = await supabase
        .from("meal_plan_day_notes")
        .delete()
        .eq("plan_id", planId)
        .eq("date", date);
      if (error) {
        Alert.alert("Could not save note", error.message);
        return;
      }
      setDayNotes((prev) => {
        const next = { ...prev };
        delete next[date];
        return next;
      });
      return;
    }
    const { error } = await supabase.from("meal_plan_day_notes").upsert(
      {
        plan_id: planId,
        date,
        notes: trimmed,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "plan_id,date" },
    );
    if (error) {
      Alert.alert("Could not save note", error.message);
      return;
    }
    setDayNotes((prev) => ({ ...prev, [date]: trimmed }));
  }

  async function pickRecipeForSlot(recipe: {
    id: number;
    title: string;
    base_servings: number;
    preferred_servings: number | null;
  }) {
    if (!pickerSlot) return;
    const servings = recipe.preferred_servings ?? recipe.base_servings;
    // Append at the end of any existing attachments. UNIQUE(slot_id, recipe_id)
    // means re-picking the same recipe is a no-op rather than a duplicate.
    const { data: max } = await supabase
      .from("meal_plan_slot_recipes")
      .select("position")
      .eq("slot_id", pickerSlot.id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPos = (max?.position ?? -1) + 1;
    const { error } = await supabase.from("meal_plan_slot_recipes").insert({
      slot_id: pickerSlot.id,
      recipe_id: recipe.id,
      scaled_servings: servings,
      position: nextPos,
    });
    if (error) {
      // 23505 = unique violation; treat as "already there".
      if (!/duplicate key|unique constraint/i.test(error.message)) {
        Alert.alert("Could not add recipe", error.message);
        return;
      }
    }
    await load();
  }

  function confirmRemoveAttachment(attachmentId: number, title: string) {
    Alert.alert(
      "Remove from slot?",
      `Remove "${title}" from this slot?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase
              .from("meal_plan_slot_recipes")
              .delete()
              .eq("id", attachmentId);
            if (error) {
              Alert.alert("Could not remove", error.message);
              return;
            }
            await load();
          },
        },
      ],
    );
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

  if (!plan || !slots || !slotRecipes) {
    return (
      <SafeAreaView style={styles.root}>
        <Header onBack={onBack} title="" />
        <View style={styles.centered}>
          <ActivityIndicator color="#2e6f70" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  // Group slots by date for the render pass.
  const slotsByDate = new Map<string, Slot[]>();
  for (const s of slots) {
    const arr = slotsByDate.get(s.date) ?? [];
    arr.push(s);
    slotsByDate.set(s.date, arr);
  }
  for (const arr of slotsByDate.values()) {
    arr.sort((a, b) => (SLOT_ORDER[a.slot] ?? 99) - (SLOT_ORDER[b.slot] ?? 99));
  }
  const dates = Array.from(slotsByDate.keys()).sort();

  const recipesBySlot = new Map<number, SlotRecipe[]>();
  for (const sr of slotRecipes) {
    const arr = recipesBySlot.get(sr.slot_id) ?? [];
    arr.push(sr);
    recipesBySlot.set(sr.slot_id, arr);
  }

  return (
    <SafeAreaView style={styles.root}>
      <Header onBack={onBack} title={plan.name} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={80}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>{plan.name}</Text>
          <Text style={styles.range}>
            {fmtLongDate(plan.start_date)} – {fmtLongDate(plan.end_date)}
          </Text>

          {dates.map((date) => {
            const daySlots = slotsByDate.get(date) ?? [];
            const draft = noteDrafts[date] ?? "";
            return (
              <View key={date} style={styles.day}>
                <View style={styles.dayHeader}>
                  <Text style={styles.dayName}>{fmtDayName(date)}</Text>
                  <Text style={styles.dayDate}>{fmtShortDate(date)}</Text>
                </View>

                <TextInput
                  style={styles.dayNoteInput}
                  value={draft}
                  onChangeText={(t) =>
                    setNoteDrafts((prev) => ({ ...prev, [date]: t }))
                  }
                  onBlur={() => saveDayNote(date, draft)}
                  placeholder="Add notes for this day..."
                  placeholderTextColor="#bdb094"
                  multiline
                />

                {daySlots.map((slot) => {
                  const recipes = recipesBySlot.get(slot.id) ?? [];
                  return (
                    <View key={slot.id} style={styles.slot}>
                      <Text style={styles.slotLabel}>
                        {slot.slot.toUpperCase()}
                        {slot.is_locked ? "  🔒" : ""}
                      </Text>
                      {recipes.map((r) => (
                        <View key={r.id} style={styles.recipeRow}>
                          <Pressable
                            style={styles.recipeRowMain}
                            onPress={() => onOpenRecipe(r.recipe.id)}
                          >
                            <Text style={styles.recipeTitle}>
                              {r.recipe.title}
                            </Text>
                            {r.scaled_servings ? (
                              <Text style={styles.recipeMeta}>
                                {r.scaled_servings} servings
                              </Text>
                            ) : null}
                          </Pressable>
                          <Pressable
                            onPress={() =>
                              confirmRemoveAttachment(r.id, r.recipe.title)
                            }
                            style={styles.removeBtn}
                            hitSlop={6}
                          >
                            <Text style={styles.removeBtnText}>✕</Text>
                          </Pressable>
                        </View>
                      ))}
                      <Pressable
                        style={styles.addRecipeBtn}
                        onPress={() => setPickerSlot(slot)}
                      >
                        <Text style={styles.addRecipeBtnText}>
                          + Add recipe
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      </KeyboardAvoidingView>

      <RecipePickerModal
        visible={pickerSlot != null}
        onClose={() => setPickerSlot(null)}
        onPick={pickRecipeForSlot}
        heading={
          pickerSlot
            ? `Pick for ${pickerSlot.slot} · ${fmtShortDate(pickerSlot.date)}`
            : "Pick a recipe"
        }
      />
    </SafeAreaView>
  );
}

function Header({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} style={styles.back} hitSlop={8}>
        <Text style={styles.backText}>‹ Plans</Text>
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

function fmtLongDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function fmtShortDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function fmtDayName(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
  });
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
  headerSpacer: { width: 80 },

  scroll: { padding: 16, paddingBottom: 60 },
  title: { fontSize: 28, fontWeight: "700", color: "#202124", marginBottom: 4 },
  range: { fontSize: 14, color: "#5f6368", marginBottom: 20 },

  day: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 10,
  },
  dayName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#2e6f70",
    flex: 1,
  },
  dayDate: { fontSize: 13, color: "#5f6368" },
  dayNoteInput: {
    fontSize: 13,
    color: "#5f4a1a",
    backgroundColor: "#fdf6e0",
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    minHeight: 40,
    textAlignVertical: "top",
  },

  slot: { marginBottom: 12 },
  slotLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#5f6368",
    letterSpacing: 1,
    marginBottom: 6,
  },
  recipeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#f4ede0",
    borderRadius: 8,
    marginBottom: 4,
  },
  recipeRowMain: { flex: 1 },
  recipeTitle: { fontSize: 15, color: "#202124", fontWeight: "500" },
  recipeMeta: { fontSize: 12, color: "#5f6368", marginTop: 2 },
  removeBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtnText: { fontSize: 16, color: "#b3261e", fontWeight: "700" },
  addRecipeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dcdcdc",
    borderStyle: "dashed",
    backgroundColor: "transparent",
    alignSelf: "flex-start",
    marginTop: 4,
  },
  addRecipeBtnText: {
    color: "#2e6f70",
    fontSize: 13,
    fontWeight: "600",
  },
});
