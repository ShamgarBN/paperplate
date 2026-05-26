/**
 * Per-plan shopping list. Aggregates ingredients across every recipe attached
 * to the plan's slots, groups by aisle, and lets the user check items off.
 *
 * Check state persists to shopping_list_checks using plan-scoped item ids
 * (`plan-{planId}-agg-{canonical}`) so a check here doesn't bleed into the
 * global list or vice versa.
 *
 * Aggregation is the simpler v1 (group by item_canonical, concat quantities)
 * matching the global list screen. When packages/core is extracted, both
 * screens will use the proper desktop aggregator with unit conversion.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
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
} from "@paperplate/core";

interface Props {
  planId: number;
  onBack: () => void;
}

interface ShoppingItem {
  id: string;
  display: string;
  aisle: string;
  isOptional: boolean;
  contributors: string[];
}

interface AisleGroup {
  aisle: string;
  items: ShoppingItem[];
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

export function PlanShoppingListScreen({ planId, onBack }: Props) {
  const [planName, setPlanName] = useState("");
  const [groups, setGroups] = useState<AisleGroup[] | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setError(null);

    const [planResp, attachmentsResp, aisleMapResp] = await Promise.all([
      supabase
        .from("meal_plans")
        .select("name")
        .eq("id", planId)
        .single(),
      // Every recipe attachment under this plan's slots, joined with the slot
      // (for FK filter) and the recipe (for title + base_servings).
      supabase
        .from("meal_plan_slot_recipes")
        .select(
          "id, recipe_id, scaled_servings, slot:meal_plan_slots!inner(plan_id), recipe:recipes(id, title, base_servings)",
        )
        .eq("slot.plan_id", planId),
      supabase
        .from("ingredient_aisle_map")
        .select("item_canonical, aisle:aisles(name)"),
    ]);

    const e =
      planResp.error || attachmentsResp.error || aisleMapResp.error;
    if (e) {
      setError(e.message);
      return;
    }
    setPlanName((planResp.data?.name as string) ?? "");

    const attachments = (attachmentsResp.data ?? []) as Array<any>;
    if (attachments.length === 0) {
      setGroups([]);
      setChecked({});
      return;
    }

    const recipeIds = Array.from(
      new Set(attachments.map((a) => a.recipe_id as number)),
    );

    // Pull recipe rows and full ingredient records for the aggregator.
    const [recipesResp, ingResp] = await Promise.all([
      supabase.from("recipes").select("*").in("id", recipeIds),
      supabase
        .from("recipe_ingredients")
        .select("*")
        .in("recipe_id", recipeIds)
        .order("position"),
    ]);
    if (recipesResp.error) {
      setError(recipesResp.error.message);
      return;
    }
    if (ingResp.error) {
      setError(ingResp.error.message);
      return;
    }
    const recipesById = new Map<number, Recipe>();
    for (const r of (recipesResp.data ?? []) as Recipe[]) {
      recipesById.set(r.id, r);
    }
    const ingredientsByRecipeId = new Map<number, RecipeIngredient[]>();
    for (const ing of ((ingResp.data ?? []) as any[]).map((row) => ({
      ...row,
      is_optional: row.is_optional ? 1 : 0,
    })) as RecipeIngredient[]) {
      const arr = ingredientsByRecipeId.get(ing.recipe_id) ?? [];
      arr.push(ing);
      ingredientsByRecipeId.set(ing.recipe_id, arr);
    }

    const aisleByCanonical = new Map<string, string>();
    for (const row of (aisleMapResp.data ?? []) as any[]) {
      const aisle = Array.isArray(row.aisle) ? row.aisle[0] : row.aisle;
      if (aisle?.name) aisleByCanonical.set(row.item_canonical, aisle.name);
    }

    // Each attachment becomes one virtual slot for the aggregator. Using
    // the attachment id as the slot id keeps any pass-through ingredient
    // ids unique across attachments.
    const slots: MealPlanSlot[] = attachments.map((a) => ({
      id: a.id,
      plan_id: planId,
      date: new Date().toISOString().slice(0, 10),
      slot: "dinner",
      recipe_id: a.recipe_id,
      scaled_servings:
        (a.scaled_servings as number | null) ??
        recipesById.get(a.recipe_id)?.base_servings ??
        null,
      is_locked: 0,
    }));

    const aggregated = buildShoppingList({
      slots,
      recipesById,
      ingredientsByRecipeId,
      aisleByCanonical,
    });

    // Prefix item ids with `plan-{planId}-` so checks persisted here don't
    // collide with the global list's check storage.
    const items: ShoppingItem[] = aggregated.map((it) => ({
      id: `plan-${planId}-${it.id}`,
      display: it.display,
      aisle: it.aisle,
      isOptional: it.isOptional,
      contributors: it.contributors,
    }));

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

    // Hydrate persisted checks (only for ids in this plan's scope).
    const itemIds = items.map((it) => it.id);
    if (itemIds.length > 0) {
      const { data: checks } = await supabase
        .from("shopping_list_checks")
        .select("item_id, is_checked")
        .in("item_id", itemIds);
      const checkedMap: Record<string, boolean> = {};
      for (const c of (checks ?? []) as any[]) {
        if (c.is_checked) checkedMap[c.item_id] = true;
      }
      setChecked(checkedMap);
    } else {
      setChecked({});
    }
    setGroups(groupArr);
  }, [planId]);

  useEffect(() => {
    load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function toggle(id: string) {
    const next = !checked[id];
    setChecked((prev) => ({ ...prev, [id]: next }));
    const { error } = await supabase.from("shopping_list_checks").upsert(
      {
        item_id: id,
        is_checked: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "item_id" },
    );
    if (error) {
      // Roll back optimistic update.
      setChecked((prev) => ({ ...prev, [id]: !next }));
    }
  }

  /**
   * Push every recipe in this plan onto the global shopping_list_recipes
   * with from_plan_id set so we can de-dupe. Skips recipes already pushed
   * from this plan; keeps the larger of any existing vs new scaled
   * servings so the global list never under-shops.
   */
  async function sendToMainList() {
    if (sending) return;
    setSending(true);
    // Pull plan's attachments fresh.
    const { data: attachments, error: attErr } = await supabase
      .from("meal_plan_slot_recipes")
      .select(
        "recipe_id, scaled_servings, slot:meal_plan_slots!inner(plan_id)",
      )
      .eq("slot.plan_id", planId);
    if (attErr || !attachments) {
      setSending(false);
      Alert.alert("Could not send", attErr?.message ?? "Unknown error");
      return;
    }
    // Dedupe by recipe; keep max scaled_servings seen.
    const byRecipe = new Map<number, number | null>();
    for (const a of attachments as any[]) {
      const existing = byRecipe.get(a.recipe_id);
      const next = a.scaled_servings as number | null;
      if (existing == null || (next != null && next > existing)) {
        byRecipe.set(a.recipe_id, next);
      }
    }
    // Existing rows from THIS plan; we won't re-add those.
    const { data: existingRows } = await supabase
      .from("shopping_list_recipes")
      .select("recipe_id")
      .eq("from_plan_id", planId);
    const alreadyHave = new Set(
      ((existingRows ?? []) as any[]).map((r) => r.recipe_id as number),
    );
    const inserts: Array<{
      recipe_id: number;
      scaled_servings: number | null;
      from_plan_id: number;
    }> = [];
    for (const [recipeId, servings] of byRecipe) {
      if (alreadyHave.has(recipeId)) continue;
      inserts.push({
        recipe_id: recipeId,
        scaled_servings: servings,
        from_plan_id: planId,
      });
    }
    if (inserts.length === 0) {
      setSending(false);
      Alert.alert(
        "Already on main list",
        "Every recipe from this plan is already on your main shopping list.",
      );
      return;
    }
    const { error: insErr } = await supabase
      .from("shopping_list_recipes")
      .insert(inserts);
    setSending(false);
    if (insErr) {
      Alert.alert("Could not send", insErr.message);
      return;
    }
    Alert.alert(
      "Sent to main list",
      `Added ${inserts.length} ${
        inserts.length === 1 ? "recipe" : "recipes"
      } to your main shopping list.`,
    );
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
        <Header onBack={onBack} title={planName} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!groups) {
    return (
      <SafeAreaView style={styles.root}>
        <Header onBack={onBack} title={planName} />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <Header onBack={onBack} title={planName} />
      <View style={styles.subHeader}>
        <Text style={styles.subTitle}>Shopping list</Text>
        <Text style={styles.subMeta}>
          {totalChecked} / {totalItems} checked
        </Text>
        <Pressable
          style={styles.printBtn}
          onPress={() =>
            printHtml(
              shoppingListPrintHtml(
                planName ? `Shopping list — ${planName}` : "Shopping list",
                groups ?? [],
              ),
              "Plan shopping list",
            )
          }
        >
          <Text style={styles.printBtnText}>Print</Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {groups.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No ingredients yet</Text>
            <Text style={styles.emptyBody}>
              Assign recipes to slots and they'll show up here grouped by
              aisle.
            </Text>
          </View>
        ) : (
          <>
            <Pressable
              style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
              onPress={sendToMainList}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator color={colors.card} size="small" />
              ) : (
                <Text style={styles.sendBtnText}>
                  Send these recipes to my main list
                </Text>
              )}
            </Pressable>

            {groups.map((group) => (
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
                      onPress={() => toggle(it.id)}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          isChecked && styles.checkboxChecked,
                        ]}
                      >
                        {isChecked ? (
                          <Text style={styles.tick}>✓</Text>
                        ) : null}
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
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} style={styles.back} hitSlop={8}>
        <Text style={styles.backText}>‹ Plan</Text>
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.headerSpacer} />
    </View>
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
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
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
  headerSpacer: { width: 70 },

  subHeader: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "baseline",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  subTitle: { fontSize: 28, fontWeight: "700", color: colors.primary, flex: 1 },
  subMeta: { color: colors.mutedFg, fontSize: 14, marginRight: 12 },
  printBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  printBtnText: { color: colors.primary, fontSize: 13, fontWeight: "600" },

  scroll: { padding: 16, paddingBottom: 60 },

  sendBtn: {
    backgroundColor: colors.secondary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 20,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: colors.card, fontWeight: "600", fontSize: 14 },

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
