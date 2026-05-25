/**
 * Mobile shopping list, v1.
 *
 * Pulls the user's current global shopping list (recipes the user has added
 * via `shopping_list_recipes` + any free-form `shopping_list_items`),
 * groups overlapping ingredients by canonical name, resolves each into an
 * aisle (from `ingredient_aisle_map`), and renders aisle-grouped check-off
 * rows persisted to `shopping_list_checks`.
 *
 * Deliberately simpler than the desktop aggregator: no unit conversion or
 * indivisible-rounding yet. When we extract `packages/core` (during the
 * desktop→Supabase swap), the proper aggregator will replace this.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native";
import { supabase } from "../lib/supabase";

interface ShoppingItem {
  id: string;
  name: string;
  quantity: string | null;
  aisle: string;
  isOptional: boolean;
  contributors: string[];
  isExtra: boolean;
}

interface AisleGroup {
  aisle: string;
  items: ShoppingItem[];
}

interface RecipeOnList {
  entryId: number;
  recipeId: number;
  title: string;
  scaledServings: number | null;
}

interface AisleOption {
  id: number;
  name: string;
}

const AISLE_SORT: Record<string, number> = {
  Produce: 10,
  "Meat & Seafood": 20,
  "Dairy & Eggs": 30,
  Bakery: 40,
  "Pantry & Dry Goods": 50,
  "Spices & Oils": 60,
  Frozen: 70,
  Beverages: 80,
  Other: 90,
};

export function ShoppingListScreen() {
  const [groups, setGroups] = useState<AisleGroup[] | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [recipesOnList, setRecipesOnList] = useState<RecipeOnList[]>([]);
  const [aisleOptions, setAisleOptions] = useState<AisleOption[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add-item form state
  const [addName, setAddName] = useState("");
  const [addQty, setAddQty] = useState("");
  const [addUnit, setAddUnit] = useState("");
  const [addAisle, setAddAisle] = useState("Other");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const [entries, extras, aisleMap, checks, aisles] = await Promise.all([
      supabase
        .from("shopping_list_recipes")
        .select(
          "id, recipe_id, scaled_servings, recipe:recipes(id, title, base_servings)",
        )
        .order("added_at", { ascending: false }),
      supabase
        .from("shopping_list_items")
        .select("id, name, quantity, unit, aisle, is_checked")
        .order("added_at", { ascending: false }),
      supabase
        .from("ingredient_aisle_map")
        .select("item_canonical, aisle:aisles(name)"),
      supabase.from("shopping_list_checks").select("item_id, is_checked"),
      supabase.from("aisles").select("id, name").order("sort_order"),
    ]);

    const e =
      entries.error ||
      extras.error ||
      aisleMap.error ||
      checks.error ||
      aisles.error;
    if (e) {
      setError(e.message);
      return;
    }

    setAisleOptions((aisles.data ?? []) as AisleOption[]);

    const entryRows = (entries.data ?? []) as any[];
    const recipeIds = entryRows
      .map((r) => r.recipe_id)
      .filter((id) => id != null);

    setRecipesOnList(
      entryRows.map((e) => ({
        entryId: e.id,
        recipeId: e.recipe_id,
        title: e.recipe?.title ?? "Recipe",
        scaledServings: e.scaled_servings,
      })),
    );

    let ingredients: any[] = [];
    if (recipeIds.length > 0) {
      const ing = await supabase
        .from("recipe_ingredients")
        .select(
          "recipe_id, position, raw_text, quantity, unit, item_canonical, item_display, is_optional",
        )
        .in("recipe_id", recipeIds)
        .order("position");
      if (ing.error) {
        setError(ing.error.message);
        return;
      }
      ingredients = ing.data ?? [];
    }

    const aisleByCanonical = new Map<string, string>();
    for (const row of (aisleMap.data ?? []) as any[]) {
      const aisleName = row.aisle?.name;
      if (aisleName) aisleByCanonical.set(row.item_canonical, aisleName);
    }

    interface Accum {
      name: string;
      quantities: string[];
      isOptional: boolean;
      contributors: Set<string>;
    }
    const acc = new Map<string, Accum>();
    const recipesByEntry = new Map<number, any>();
    for (const e of entryRows) {
      recipesByEntry.set(e.recipe_id, e.recipe);
    }

    for (const ing of ingredients) {
      const recipe = recipesByEntry.get(ing.recipe_id);
      const contributorTitle = recipe?.title ?? "Recipe";
      const existing = acc.get(ing.item_canonical);
      const qtyStr =
        ing.quantity != null
          ? `${formatNumber(ing.quantity)}${ing.unit ? " " + ing.unit : ""}`
          : ing.raw_text || "";
      if (existing) {
        if (qtyStr) existing.quantities.push(qtyStr);
        if (ing.is_optional) existing.isOptional = true;
        existing.contributors.add(contributorTitle);
      } else {
        acc.set(ing.item_canonical, {
          name: ing.item_display || ing.item_canonical,
          quantities: qtyStr ? [qtyStr] : [],
          isOptional: !!ing.is_optional,
          contributors: new Set([contributorTitle]),
        });
      }
    }

    const items: ShoppingItem[] = [];
    for (const [canonical, a] of acc) {
      items.push({
        id: `agg-${canonical}`,
        name: a.name,
        quantity: a.quantities.length > 0 ? a.quantities.join(" + ") : null,
        aisle: aisleByCanonical.get(canonical) ?? "Other",
        isOptional: a.isOptional,
        contributors: Array.from(a.contributors),
        isExtra: false,
      });
    }

    for (const x of (extras.data ?? []) as any[]) {
      items.push({
        id: `extra-${x.id}`,
        name: x.name,
        quantity:
          x.quantity != null
            ? `${formatNumber(x.quantity)}${x.unit ? " " + x.unit : ""}`
            : null,
        aisle: x.aisle ?? "Other",
        isOptional: false,
        contributors: [],
        isExtra: true,
      });
    }

    const byAisle = new Map<string, ShoppingItem[]>();
    for (const it of items) {
      const arr = byAisle.get(it.aisle) ?? [];
      arr.push(it);
      byAisle.set(it.aisle, arr);
    }
    const groupArr: AisleGroup[] = Array.from(byAisle.entries())
      .map(([aisle, its]) => ({
        aisle,
        items: its.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort(
        (a, b) =>
          (AISLE_SORT[a.aisle] ?? 100) - (AISLE_SORT[b.aisle] ?? 100),
      );

    const checkedMap: Record<string, boolean> = {};
    for (const c of (checks.data ?? []) as any[]) {
      checkedMap[c.item_id] = !!c.is_checked;
    }
    for (const x of (extras.data ?? []) as any[]) {
      if (x.is_checked) checkedMap[`extra-${x.id}`] = true;
    }

    setGroups(groupArr);
    setChecked(checkedMap);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function toggle(id: string, isExtra: boolean) {
    const next = !checked[id];
    setChecked((prev) => ({ ...prev, [id]: next }));
    if (isExtra) {
      const extraId = Number(id.slice("extra-".length));
      const { error } = await supabase
        .from("shopping_list_items")
        .update({
          is_checked: next,
          checked_at: next ? new Date().toISOString() : null,
        })
        .eq("id", extraId);
      if (error) setChecked((prev) => ({ ...prev, [id]: !next }));
    } else {
      const { error } = await supabase
        .from("shopping_list_checks")
        .upsert(
          { item_id: id, is_checked: next, updated_at: new Date().toISOString() },
          { onConflict: "item_id" },
        );
      if (error) setChecked((prev) => ({ ...prev, [id]: !next }));
    }
  }

  async function addExtraItem() {
    const name = addName.trim();
    if (!name || adding) return;
    setAdding(true);
    const qty = addQty.trim() === "" ? null : Number(addQty);
    const { error } = await supabase.from("shopping_list_items").insert({
      name,
      quantity: qty != null && !Number.isNaN(qty) ? qty : null,
      unit: addUnit.trim() || null,
      aisle: addAisle,
    });
    setAdding(false);
    if (error) {
      Alert.alert("Could not add item", error.message);
      return;
    }
    setAddName("");
    setAddQty("");
    setAddUnit("");
    setAddAisle("Other");
    await load();
  }

  async function removeRecipe(entryId: number) {
    const { error } = await supabase
      .from("shopping_list_recipes")
      .delete()
      .eq("id", entryId);
    if (error) {
      Alert.alert("Could not remove recipe", error.message);
      return;
    }
    await load();
  }

  const totalItems = useMemo(
    () => (groups ? groups.reduce((n, g) => n + g.items.length, 0) : 0),
    [groups],
  );
  const totalChecked = useMemo(
    () =>
      groups
        ? groups.reduce(
            (n, g) => n + g.items.filter((it) => checked[it.id]).length,
            0,
          )
        : 0,
    [groups, checked],
  );

  if (error) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Shopping list</Text>
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!groups) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Shopping list</Text>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator color="#2e6f70" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Shopping list</Text>
        <Text style={styles.headerMeta}>
          {totalChecked} / {totalItems} checked
        </Text>
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={80}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#2e6f70"
            />
          }
          keyboardShouldPersistTaps="handled"
        >
          {/* Add free-form item */}
          <View style={styles.addCard}>
            <Text style={styles.addHeading}>Add item</Text>
            <View style={styles.addRow}>
              <TextInput
                style={[styles.addInput, { flex: 2 }]}
                value={addName}
                onChangeText={setAddName}
                placeholder="Item name"
                placeholderTextColor="#9aa0a6"
                returnKeyType="done"
                onSubmitEditing={addExtraItem}
              />
              <TextInput
                style={[styles.addInput, { flex: 1 }]}
                value={addQty}
                onChangeText={setAddQty}
                placeholder="Qty"
                placeholderTextColor="#9aa0a6"
                keyboardType="decimal-pad"
              />
              <TextInput
                style={[styles.addInput, { flex: 1 }]}
                value={addUnit}
                onChangeText={setAddUnit}
                placeholder="Unit"
                placeholderTextColor="#9aa0a6"
              />
            </View>
            <View style={styles.aislePickerRow}>
              {aisleOptions.map((a) => {
                const active = addAisle === a.name;
                return (
                  <Pressable
                    key={a.id}
                    onPress={() => setAddAisle(a.name)}
                    style={[
                      styles.aisleChip,
                      active && styles.aisleChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.aisleChipText,
                        active && styles.aisleChipTextActive,
                      ]}
                    >
                      {a.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              style={[
                styles.addBtn,
                (!addName.trim() || adding) && styles.addBtnDisabled,
              ]}
              onPress={addExtraItem}
              disabled={!addName.trim() || adding}
            >
              {adding ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.addBtnText}>Add to list</Text>
              )}
            </Pressable>
          </View>

          {/* Recipes on the list */}
          {recipesOnList.length > 0 ? (
            <View style={styles.recipesCard}>
              <Text style={styles.addHeading}>Recipes on this list</Text>
              {recipesOnList.map((r) => (
                <View key={r.entryId} style={styles.recipeRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recipeRowTitle}>{r.title}</Text>
                    {r.scaledServings ? (
                      <Text style={styles.recipeRowMeta}>
                        Scaled to {r.scaledServings} servings
                      </Text>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={() =>
                      Alert.alert(
                        "Remove recipe?",
                        `Remove "${r.title}" from the shopping list?`,
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Remove",
                            style: "destructive",
                            onPress: () => removeRecipe(r.entryId),
                          },
                        ],
                      )
                    }
                    style={styles.removeBtn}
                  >
                    <Text style={styles.removeBtnText}>Remove</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          {/* Aisle-grouped items */}
          {groups.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>Nothing on your list</Text>
              <Text style={styles.emptyBody}>
                Add recipes from the Library, or use the form above to add a
                free-form item.
              </Text>
            </View>
          ) : (
            groups.map((group) => (
              <View key={group.aisle} style={styles.group}>
                <Text style={styles.groupHeader}>
                  {group.aisle.toUpperCase()}
                </Text>
                {group.items.map((it) => {
                  const isChecked = !!checked[it.id];
                  return (
                    <Pressable
                      key={it.id}
                      style={styles.row}
                      onPress={() => toggle(it.id, it.isExtra)}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          isChecked && styles.checkboxChecked,
                        ]}
                      >
                        {isChecked ? <Text style={styles.tick}>✓</Text> : null}
                      </View>
                      <View style={styles.rowBody}>
                        <Text
                          style={[
                            styles.itemName,
                            isChecked && styles.itemNameChecked,
                          ]}
                        >
                          {it.name}
                          {it.isOptional ? (
                            <Text style={styles.optional}> (optional)</Text>
                          ) : null}
                        </Text>
                        {it.quantity ? (
                          <Text
                            style={[
                              styles.itemQty,
                              isChecked && styles.itemQtyChecked,
                            ]}
                          >
                            {it.quantity}
                          </Text>
                        ) : null}
                        {it.contributors.length > 0 ? (
                          <Text style={styles.contributors} numberOfLines={1}>
                            for {it.contributors.join(", ")}
                          </Text>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 100) / 100);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4ede0" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: "#b3261e", fontSize: 16, padding: 24 },

  header: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e6dec9",
    flexDirection: "row",
    alignItems: "baseline",
  },
  headerTitle: { fontSize: 28, fontWeight: "700", color: "#2e6f70", flex: 1 },
  headerMeta: { color: "#5f6368", fontSize: 14 },

  scroll: { padding: 16, paddingBottom: 60 },

  addCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  addHeading: {
    fontSize: 14,
    fontWeight: "700",
    color: "#5f6368",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  addRow: { flexDirection: "row", marginBottom: 10 },
  addInput: {
    backgroundColor: "#fafafa",
    borderWidth: 1,
    borderColor: "#dcdcdc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#202124",
    marginRight: 6,
  },
  aislePickerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 10,
  },
  aisleChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#dcdcdc",
    backgroundColor: "#fff",
    marginRight: 6,
    marginBottom: 6,
  },
  aisleChipActive: { backgroundColor: "#2e6f70", borderColor: "#2e6f70" },
  aisleChipText: { fontSize: 12, color: "#3c4043", fontWeight: "500" },
  aisleChipTextActive: { color: "#fff" },
  addBtn: {
    backgroundColor: "#2e6f70",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },

  recipesCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  recipeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e6dec9",
  },
  recipeRowTitle: { fontSize: 15, color: "#202124", fontWeight: "500" },
  recipeRowMeta: { fontSize: 12, color: "#5f6368", marginTop: 2 },
  removeBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  removeBtnText: { color: "#b3261e", fontSize: 13, fontWeight: "600" },

  emptyBox: { padding: 32, alignItems: "center" },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#3c4043",
    marginBottom: 6,
  },
  emptyBody: {
    fontSize: 14,
    color: "#5f6368",
    textAlign: "center",
    maxWidth: 320,
  },

  group: { marginBottom: 24 },
  groupHeader: {
    fontSize: 12,
    fontWeight: "700",
    color: "#5f6368",
    letterSpacing: 1,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 12,
    marginBottom: 6,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#c4c4c4",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: "#2e6f70", borderColor: "#2e6f70" },
  tick: { color: "#fff", fontSize: 16, fontWeight: "700" },
  rowBody: { flex: 1 },
  itemName: { fontSize: 15, color: "#202124", fontWeight: "500" },
  itemNameChecked: {
    color: "#9aa0a6",
    textDecorationLine: "line-through",
  },
  itemQty: { fontSize: 13, color: "#5f6368", marginTop: 2 },
  itemQtyChecked: { color: "#bdc1c6" },
  contributors: { fontSize: 11, color: "#9aa0a6", marginTop: 4 },
  optional: { color: "#9aa0a6", fontStyle: "italic", fontSize: 13 },
});
