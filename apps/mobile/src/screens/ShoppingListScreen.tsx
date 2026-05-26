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
import { printHtml, shoppingListPrintHtml } from "../lib/print";
import { colors, fonts, radii } from "../theme/tokens";
import {
  buildShoppingList,
  type MealPlanSlot,
  type Recipe,
  type RecipeIngredient,
  type ShoppingItem as CoreShoppingItem,
} from "@paperplate/core";

interface ShoppingItem {
  id: string;
  /** Aggregator's formatted display string ("1½ cup flour"). */
  display: string;
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

    // Build the inputs `buildShoppingList` expects: a recipe map, an
    // ingredients-by-recipe map, and the aisle map. The aggregator then
    // handles unit-merging, fraction formatting, indivisible rounding,
    // and aisle assignment.
    const recipesById = new Map<number, Recipe>();
    const ingredientsByRecipeId = new Map<number, RecipeIngredient[]>();
    if (recipeIds.length > 0) {
      const [rResp, iResp] = await Promise.all([
        supabase.from("recipes").select("*").in("id", recipeIds),
        supabase
          .from("recipe_ingredients")
          .select("*")
          .in("recipe_id", recipeIds)
          .order("position"),
      ]);
      if (rResp.error) {
        setError(rResp.error.message);
        return;
      }
      if (iResp.error) {
        setError(iResp.error.message);
        return;
      }
      for (const r of (rResp.data ?? []) as Recipe[]) {
        recipesById.set(r.id, r);
      }
      // Supabase returns boolean is_optional; aggregator expects 0|1.
      for (const ing of ((iResp.data ?? []) as any[]).map((row) => ({
        ...row,
        is_optional: row.is_optional ? 1 : 0,
      })) as RecipeIngredient[]) {
        const arr = ingredientsByRecipeId.get(ing.recipe_id) ?? [];
        arr.push(ing);
        ingredientsByRecipeId.set(ing.recipe_id, arr);
      }
    }

    const aisleByCanonical = new Map<string, string>();
    for (const row of (aisleMap.data ?? []) as any[]) {
      const aisle = Array.isArray(row.aisle) ? row.aisle[0] : row.aisle;
      if (aisle?.name) aisleByCanonical.set(row.item_canonical, aisle.name);
    }

    // Shape each shopping-list recipe entry into a synthetic MealPlanSlot
    // the aggregator can consume.
    const slots: MealPlanSlot[] = entryRows.map((e, i) => ({
      id: e.id ?? i + 1,
      plan_id: 0,
      date: (e.added_at ?? new Date().toISOString()).slice(0, 10),
      slot: "dinner",
      recipe_id: e.recipe_id,
      scaled_servings:
        e.scaled_servings ??
        recipesById.get(e.recipe_id)?.base_servings ??
        null,
      is_locked: 0,
    }));

    const aggregated: CoreShoppingItem[] = buildShoppingList({
      slots,
      recipesById,
      ingredientsByRecipeId,
      aisleByCanonical,
    });

    const items: ShoppingItem[] = aggregated.map((it) => ({
      id: it.id,
      display: it.display,
      aisle: it.aisle,
      isOptional: it.isOptional,
      contributors: it.contributors,
      isExtra: false,
    }));

    for (const x of (extras.data ?? []) as any[]) {
      items.push({
        id: `extra-${x.id}`,
        display:
          x.quantity != null
            ? `${x.quantity}${x.unit ? " " + x.unit : ""} ${x.name}`
            : x.name,
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
        items: its.sort((a, b) => a.display.localeCompare(b.display)),
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
          <ActivityIndicator color={colors.primary} size="large" />
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
        <Pressable
          style={styles.printBtn}
          onPress={() =>
            printHtml(
              shoppingListPrintHtml("Shopping list", groups ?? []),
              "Shopping list",
            )
          }
        >
          <Text style={styles.printBtnText}>Print</Text>
        </Pressable>
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
              tintColor={colors.primary}
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
                placeholderTextColor={colors.mutedFg}
                returnKeyType="done"
                onSubmitEditing={addExtraItem}
              />
              <TextInput
                style={[styles.addInput, { flex: 1 }]}
                value={addQty}
                onChangeText={setAddQty}
                placeholder="Qty"
                placeholderTextColor={colors.mutedFg}
                keyboardType="decimal-pad"
              />
              <TextInput
                style={[styles.addInput, { flex: 1 }]}
                value={addUnit}
                onChangeText={setAddUnit}
                placeholder="Unit"
                placeholderTextColor={colors.mutedFg}
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
                <ActivityIndicator color={colors.card} size="small" />
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
                          {it.display}
                          {it.isOptional ? (
                            <Text style={styles.optional}> (optional)</Text>
                          ) : null}
                        </Text>
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
  root: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: colors.destructive, fontSize: 16, padding: 24 },

  header: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: "row",
    alignItems: "baseline",
  },
  headerTitle: { fontSize: 28, fontWeight: "700", color: colors.primary, flex: 1 },
  headerMeta: { color: colors.mutedFg, fontSize: 14, marginRight: 12 },
  printBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  printBtnText: { color: colors.primary, fontSize: 13, fontWeight: "600" },

  scroll: { padding: 16, paddingBottom: 60 },

  addCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  addHeading: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.mutedFg,
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  addRow: { flexDirection: "row", marginBottom: 10 },
  addInput: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.fg,
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
    borderColor: colors.border,
    backgroundColor: colors.card,
    marginRight: 6,
    marginBottom: 6,
  },
  aisleChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  aisleChipText: { fontSize: 12, color: colors.fg, fontWeight: "500" },
  aisleChipTextActive: { color: colors.card },
  addBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: { color: colors.card, fontSize: 14, fontWeight: "600" },

  recipesCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  recipeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  recipeRowTitle: { fontSize: 15, color: colors.fg, fontWeight: "500" },
  recipeRowMeta: { fontSize: 12, color: colors.mutedFg, marginTop: 2 },
  removeBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  removeBtnText: { color: colors.destructive, fontSize: 13, fontWeight: "600" },

  emptyBox: { padding: 32, alignItems: "center" },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.fg,
    marginBottom: 6,
  },
  emptyBody: {
    fontSize: 14,
    color: colors.mutedFg,
    textAlign: "center",
    maxWidth: 320,
  },

  group: { marginBottom: 24 },
  groupHeader: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.mutedFg,
    letterSpacing: 1,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.card,
    padding: 14,
    borderRadius: 12,
    marginBottom: 6,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  tick: { color: colors.card, fontSize: 16, fontWeight: "700" },
  rowBody: { flex: 1 },
  itemName: { fontSize: 15, color: colors.fg, fontWeight: "500" },
  itemNameChecked: {
    color: colors.mutedFg,
    textDecorationLine: "line-through",
  },
  itemQty: { fontSize: 13, color: colors.mutedFg, marginTop: 2 },
  itemQtyChecked: { color: colors.mutedFg },
  contributors: { fontSize: 11, color: colors.mutedFg, marginTop: 4 },
  optional: { color: colors.mutedFg, fontStyle: "italic", fontSize: 13 },
});
