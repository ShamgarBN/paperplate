import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native";
import { supabase } from "../lib/supabase";
import { NewPlanModal } from "../components/NewPlanModal";
import { colors, fonts, radii } from "../theme/tokens";

interface PlanRow {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  slot_count: number;
}

interface Props {
  onSelect: (planId: number) => void;
}

export function PlansScreen({ onSelect }: Props) {
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNewPlan, setShowNewPlan] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: e } = await supabase
      .from("meal_plans")
      .select("id, name, start_date, end_date")
      .order("start_date", { ascending: false });
    if (e) {
      setError(e.message);
      return;
    }
    const rows = (data ?? []) as Array<Omit<PlanRow, "slot_count">>;
    const slotCounts = await Promise.all(
      rows.map(async (p) => {
        const { data: slotIds } = await supabase
          .from("meal_plan_slots")
          .select("id")
          .eq("plan_id", p.id);
        const ids = ((slotIds ?? []) as any[]).map((s) => s.id as number);
        if (ids.length === 0) return 0;
        const { count } = await supabase
          .from("meal_plan_slot_recipes")
          .select("id", { count: "exact", head: true })
          .in("slot_id", ids);
        return count ?? 0;
      }),
    );
    setPlans(rows.map((p, i) => ({ ...p, slot_count: slotCounts[i] ?? 0 })));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Plans</Text>
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!plans) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Plans</Text>
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
        <Text style={styles.headerTitle}>Plans</Text>
        <Text style={styles.headerMeta}>{plans.length} total</Text>
        <Pressable
          style={styles.newBtn}
          onPress={() => setShowNewPlan(true)}
        >
          <Text style={styles.newBtnText}>+ New plan</Text>
        </Pressable>
      </View>
      <FlatList
        data={plans}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No plans yet</Text>
            <Text style={styles.emptyBody}>
              Tap "+ New plan" to schedule a week of meals.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => onSelect(item.id)}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Text style={styles.cardRange}>
              {fmtDate(item.start_date)} – {fmtDate(item.end_date)}
            </Text>
            <Text style={styles.cardMeta}>
              {item.slot_count}{" "}
              {item.slot_count === 1 ? "recipe" : "recipes"} planned
            </Text>
          </Pressable>
        )}
      />
      <NewPlanModal
        visible={showNewPlan}
        onClose={() => setShowNewPlan(false)}
        onCreated={(planId) => {
          setShowNewPlan(false);
          // Reload list, then jump straight into the new plan.
          void load().then(() => onSelect(planId));
        }}
      />
    </SafeAreaView>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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
  newBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  newBtnText: { color: colors.card, fontSize: 14, fontWeight: "600" },
  list: { padding: 16 },
  sep: { height: 12 },
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
  card: {
    backgroundColor: colors.card,
    padding: 18,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  cardTitle: { fontSize: 18, fontWeight: "600", color: colors.fg },
  cardRange: { marginTop: 4, color: colors.fg, fontSize: 14 },
  cardMeta: { marginTop: 6, color: colors.mutedFg, fontSize: 13 },
});
