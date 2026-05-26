/**
 * Settings: manage categories (by kind) and aisles. Mirrors the desktop's
 * Settings page, condensed for touch.
 *
 * - Categories grouped by `kind` ("cuisine", "protein", etc.); each row
 *   is rename-on-tap with a destructive ✕ to delete. Per-kind "+ Add" row
 *   inserts a new category with the next sort_order.
 * - Aisles are a single list; "Other" is the fallback aisle and protected
 *   from deletion. Renames propagate to free-form shopping_list_items
 *   rows via aisleRepo logic.
 *
 * Auth + theme actions (sign out) live at the bottom for parity with the
 * desktop's Settings sidebar.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native";
import { supabase } from "../lib/supabase";
import { colors, fonts, radii } from "../theme/tokens";

interface Category {
  id: number;
  kind: string;
  name: string;
  sort_order: number;
}

interface Aisle {
  id: number;
  name: string;
  sort_order: number;
}

const KIND_ORDER: Array<{ key: string; label: string }> = [
  { key: "cuisine", label: "Cuisine" },
  { key: "protein", label: "Protein" },
  { key: "type", label: "Type" },
  { key: "cooking_method", label: "Cooking method" },
  { key: "effort", label: "Effort" },
  { key: "tag", label: "Tag" },
  { key: "dietary", label: "Dietary" },
];

const FALLBACK_AISLE_NAME = "Other";

export function SettingsScreen() {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [aisles, setAisles] = useState<Aisle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newPerKind, setNewPerKind] = useState<Record<string, string>>({});
  const [newAisle, setNewAisle] = useState("");

  const load = useCallback(async () => {
    setError(null);
    const [catsResp, aislesResp] = await Promise.all([
      supabase
        .from("categories")
        .select("id, kind, name, sort_order")
        .order("kind")
        .order("name"),
      supabase
        .from("aisles")
        .select("id, name, sort_order")
        .order("name"),
    ]);
    if (catsResp.error || aislesResp.error) {
      setError(catsResp.error?.message ?? aislesResp.error?.message ?? "");
      return;
    }
    setCategories((catsResp.data ?? []) as Category[]);
    setAisles((aislesResp.data ?? []) as Aisle[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function signOut() {
    await supabase.auth.signOut();
  }

  // ----- Categories -----

  async function addCategory(kind: string) {
    const name = (newPerKind[kind] ?? "").trim();
    if (!name) return;
    const sameKind = (categories ?? []).filter((c) => c.kind === kind);
    const nextSort =
      sameKind.length === 0
        ? 0
        : Math.max(...sameKind.map((c) => c.sort_order)) + 1;
    const { error } = await supabase
      .from("categories")
      .insert({ kind, name, sort_order: nextSort });
    if (error) {
      Alert.alert("Could not add", error.message);
      return;
    }
    setNewPerKind((prev) => ({ ...prev, [kind]: "" }));
    await load();
  }

  function promptRenameCategory(cat: Category) {
    if (typeof window !== "undefined" && typeof window.prompt === "function") {
      const next = window.prompt(`Rename "${cat.name}"`, cat.name);
      if (next == null) return;
      void renameCategory(cat.id, next);
      return;
    }
    // Native fallback. (Alert.prompt is iOS-only; we set this up plainly.)
    Alert.alert(
      "Rename category",
      `Use the desktop to rename "${cat.name}" — inline rename UI on iPad is coming soon.`,
    );
  }

  async function renameCategory(id: number, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { error } = await supabase
      .from("categories")
      .update({ name: trimmed })
      .eq("id", id);
    if (error) {
      Alert.alert("Could not rename", error.message);
      return;
    }
    await load();
  }

  function confirmDeleteCategory(cat: Category) {
    Alert.alert(
      `Delete "${cat.name}"?`,
      "Any recipes tagged with this category will lose the tag.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase
              .from("categories")
              .delete()
              .eq("id", cat.id);
            if (error) Alert.alert("Could not delete", error.message);
            else await load();
          },
        },
      ],
    );
  }

  // ----- Aisles -----

  async function addAisle() {
    const name = newAisle.trim();
    if (!name) return;
    const nextSort =
      (aisles ?? []).reduce((max, a) => Math.max(max, a.sort_order), 0) + 10;
    const { error } = await supabase
      .from("aisles")
      .insert({ name, sort_order: nextSort });
    if (error) {
      Alert.alert("Could not add aisle", error.message);
      return;
    }
    setNewAisle("");
    await load();
  }

  function promptRenameAisle(aisle: Aisle) {
    if (typeof window !== "undefined" && typeof window.prompt === "function") {
      const next = window.prompt(`Rename "${aisle.name}"`, aisle.name);
      if (next == null) return;
      void renameAisle(aisle, next);
      return;
    }
    Alert.alert(
      "Rename aisle",
      `Use the desktop to rename "${aisle.name}" — inline rename UI on iPad is coming soon.`,
    );
  }

  async function renameAisle(aisle: Aisle, nameRaw: string) {
    const name = nameRaw.trim().slice(0, 60);
    if (!name || name === aisle.name) return;
    // Update the row.
    const { error: updErr } = await supabase
      .from("aisles")
      .update({ name })
      .eq("id", aisle.id);
    if (updErr) {
      Alert.alert("Could not rename", updErr.message);
      return;
    }
    // Propagate to free-form shopping_list_items rows referencing the old label.
    const { error: propErr } = await supabase
      .from("shopping_list_items")
      .update({ aisle: name })
      .eq("aisle", aisle.name);
    if (propErr) {
      console.warn("Failed to propagate aisle rename:", propErr.message);
    }
    await load();
  }

  function confirmDeleteAisle(aisle: Aisle) {
    if (aisle.name.toLowerCase() === FALLBACK_AISLE_NAME.toLowerCase()) {
      Alert.alert(
        "Cannot delete",
        `"${FALLBACK_AISLE_NAME}" is the fallback aisle and can't be removed.`,
      );
      return;
    }
    Alert.alert(
      `Delete "${aisle.name}"?`,
      `Items pinned to this aisle will move to "${FALLBACK_AISLE_NAME}".`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            // Reassign free-form items to "Other".
            await supabase
              .from("shopping_list_items")
              .update({ aisle: FALLBACK_AISLE_NAME })
              .eq("aisle", aisle.name);
            const { error } = await supabase
              .from("aisles")
              .delete()
              .eq("id", aisle.id);
            if (error) Alert.alert("Could not delete", error.message);
            else await load();
          },
        },
      ],
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settings</Text>
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!categories || !aisles) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settings</Text>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const catsByKind: Record<string, Category[]> = {};
  for (const c of categories) (catsByKind[c.kind] ??= []).push(c);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.sectionHeading}>Categories</Text>
        <Text style={styles.sectionBlurb}>
          Tags grouped by axis. Cuisines, proteins, and methods are
          independent — a single recipe can be tagged on any combination.
        </Text>

        {KIND_ORDER.map(({ key, label }) => {
          const list = catsByKind[key] ?? [];
          return (
            <View key={key} style={styles.kindBlock}>
              <Text style={styles.kindHeader}>{label}</Text>
              {list.length === 0 ? (
                <Text style={styles.emptyText}>No items.</Text>
              ) : (
                list.map((c) => (
                  <View key={c.id} style={styles.itemRow}>
                    <Pressable
                      style={styles.itemMain}
                      onPress={() => promptRenameCategory(c)}
                    >
                      <Text style={styles.itemName}>{c.name}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => confirmDeleteCategory(c)}
                      style={styles.deleteBtn}
                      hitSlop={6}
                    >
                      <Text style={styles.deleteBtnText}>✕</Text>
                    </Pressable>
                  </View>
                ))
              )}
              <View style={styles.addRow}>
                <TextInput
                  style={styles.addInput}
                  value={newPerKind[key] ?? ""}
                  onChangeText={(t) =>
                    setNewPerKind((prev) => ({ ...prev, [key]: t }))
                  }
                  placeholder={`Add ${label.toLowerCase()}...`}
                  placeholderTextColor={colors.mutedFg}
                  returnKeyType="done"
                  onSubmitEditing={() => addCategory(key)}
                />
                <Pressable
                  style={[
                    styles.addBtn,
                    !(newPerKind[key] ?? "").trim() && styles.addBtnDisabled,
                  ]}
                  onPress={() => addCategory(key)}
                  disabled={!(newPerKind[key] ?? "").trim()}
                >
                  <Text style={styles.addBtnText}>Add</Text>
                </Pressable>
              </View>
            </View>
          );
        })}

        <Text style={[styles.sectionHeading, { marginTop: 32 }]}>Aisles</Text>
        <Text style={styles.sectionBlurb}>
          Shopping list groupings. The "Other" aisle is the default fallback
          and can't be deleted.
        </Text>
        {aisles.map((a) => {
          const isFallback =
            a.name.toLowerCase() === FALLBACK_AISLE_NAME.toLowerCase();
          return (
            <View key={a.id} style={styles.itemRow}>
              <Pressable
                style={styles.itemMain}
                onPress={() => promptRenameAisle(a)}
              >
                <Text style={styles.itemName}>{a.name}</Text>
                {isFallback ? (
                  <Text style={styles.itemMeta}>fallback</Text>
                ) : null}
              </Pressable>
              {!isFallback ? (
                <Pressable
                  onPress={() => confirmDeleteAisle(a)}
                  style={styles.deleteBtn}
                  hitSlop={6}
                >
                  <Text style={styles.deleteBtnText}>✕</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
        <View style={styles.addRow}>
          <TextInput
            style={styles.addInput}
            value={newAisle}
            onChangeText={setNewAisle}
            placeholder="Add aisle..."
            placeholderTextColor={colors.mutedFg}
            returnKeyType="done"
            onSubmitEditing={addAisle}
          />
          <Pressable
            style={[
              styles.addBtn,
              !newAisle.trim() && styles.addBtnDisabled,
            ]}
            onPress={addAisle}
            disabled={!newAisle.trim()}
          >
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        </View>

        <Text style={[styles.sectionHeading, { marginTop: 32 }]}>Account</Text>
        <Pressable style={styles.signOutBtn} onPress={signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: colors.destructive, fontSize: 16, padding: 24 },

  header: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 28, fontWeight: "700", color: colors.primary },

  scroll: { padding: 16, paddingBottom: 80 },
  sectionHeading: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.primary,
    marginTop: 4,
    marginBottom: 4,
  },
  sectionBlurb: {
    fontSize: 13,
    color: colors.mutedFg,
    marginBottom: 14,
    lineHeight: 18,
  },

  kindBlock: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  kindHeader: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.mutedFg,
    letterSpacing: 1,
    marginBottom: 6,
  },

  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  itemMain: { flex: 1, flexDirection: "row", alignItems: "baseline" },
  itemName: { fontSize: 15, color: colors.fg },
  itemMeta: {
    marginLeft: 8,
    color: colors.mutedFg,
    fontSize: 11,
    fontStyle: "italic",
  },
  deleteBtn: { paddingHorizontal: 10, paddingVertical: 4 },
  deleteBtnText: { color: colors.destructive, fontSize: 16, fontWeight: "700" },
  emptyText: {
    color: colors.mutedFg,
    fontSize: 13,
    fontStyle: "italic",
    paddingVertical: 4,
  },

  addRow: { flexDirection: "row", marginTop: 8 },
  addInput: {
    flex: 1,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.fg,
    marginRight: 6,
  },
  addBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    justifyContent: "center",
  },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText: { color: colors.card, fontSize: 14, fontWeight: "600" },

  signOutBtn: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.destructive,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  signOutText: { color: colors.destructive, fontSize: 15, fontWeight: "600" },
});
