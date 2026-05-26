/**
 * Modal for creating a new meal plan: name (optional, defaults to date range),
 * start + end date, breakfast/lunch toggles. On save, inserts the plan row
 * and pre-generates one slot per day for each enabled meal kind (dinner
 * always; breakfast / lunch when checked).
 */
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native";
import { supabase } from "../lib/supabase";
import { colors, fonts, radii } from "../theme/tokens";

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreated: (planId: number) => void;
}

export function NewPlanModal({ visible, onClose, onCreated }: Props) {
  // Default range: today → 7 days from now.
  const today = new Date();
  const defaultStart = isoFromDate(today);
  const defaultEnd = isoFromDate(addDays(today, 6));

  const [name, setName] = useState("");
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [includeBreakfast, setIncludeBreakfast] = useState(false);
  const [includeLunch, setIncludeLunch] = useState(false);
  const [saving, setSaving] = useState(false);

  const range = useMemo(() => {
    if (!isValidDate(start) || !isValidDate(end)) return null;
    if (start > end) return null;
    return enumerateDates(start, end);
  }, [start, end]);

  const finalName = name.trim().length > 0
    ? name.trim()
    : range
      ? defaultLabel(range)
      : "Untitled plan";

  async function save() {
    if (!range || saving) return;
    setSaving(true);
    const { data: planRow, error: planErr } = await supabase
      .from("meal_plans")
      .insert({ name: finalName, start_date: start, end_date: end })
      .select("id")
      .single();
    if (planErr || !planRow) {
      setSaving(false);
      Alert.alert("Could not create plan", planErr?.message ?? "Unknown error");
      return;
    }
    const planId = planRow.id as number;

    // Build slot inserts: dinner always, breakfast/lunch when enabled.
    const slotRows: Array<{
      plan_id: number;
      date: string;
      slot: "breakfast" | "lunch" | "dinner";
    }> = [];
    for (const d of range) {
      if (includeBreakfast)
        slotRows.push({ plan_id: planId, date: d, slot: "breakfast" });
      if (includeLunch)
        slotRows.push({ plan_id: planId, date: d, slot: "lunch" });
      slotRows.push({ plan_id: planId, date: d, slot: "dinner" });
    }
    if (slotRows.length > 0) {
      const { error: slotErr } = await supabase
        .from("meal_plan_slots")
        .insert(slotRows);
      if (slotErr) {
        setSaving(false);
        Alert.alert(
          "Plan created, but slots failed",
          slotErr.message,
        );
        onCreated(planId);
        return;
      }
    }
    setSaving(false);
    // Reset form for next open.
    setName("");
    onCreated(planId);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.cancel} hitSlop={8}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Text style={styles.heading}>New plan</Text>
          <Pressable
            onPress={save}
            disabled={!range || saving}
            style={[
              styles.saveBtn,
              (!range || saving) && styles.saveBtnDisabled,
            ]}
          >
            {saving ? (
              <ActivityIndicator color={colors.card} size="small" />
            ) : (
              <Text style={styles.saveBtnText}>Save</Text>
            )}
          </Pressable>
        </View>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={
                range ? defaultLabel(range) : "e.g. Memorial Day Week"
              }
              placeholderTextColor={colors.mutedFg}
            />

            <View style={styles.row2}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.label}>Start date</Text>
                <TextInput
                  style={[
                    styles.input,
                    !isValidDate(start) && styles.inputError,
                  ]}
                  value={start}
                  onChangeText={setStart}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.mutedFg}
                  keyboardType="numbers-and-punctuation"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.label}>End date</Text>
                <TextInput
                  style={[
                    styles.input,
                    !isValidDate(end) && styles.inputError,
                  ]}
                  value={end}
                  onChangeText={setEnd}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.mutedFg}
                  keyboardType="numbers-and-punctuation"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>
            {!range ? (
              <Text style={styles.helpError}>
                Use YYYY-MM-DD format; end must be on or after start.
              </Text>
            ) : (
              <Text style={styles.help}>
                {range.length} {range.length === 1 ? "day" : "days"}
              </Text>
            )}

            <Text style={[styles.label, { marginTop: 20 }]}>
              Include slots for
            </Text>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Breakfast</Text>
              <Switch
                value={includeBreakfast}
                onValueChange={setIncludeBreakfast}
                trackColor={{ true: colors.primary, false: "#cdcdcd" }}
                ios_backgroundColor="#cdcdcd"
              />
            </View>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Lunch</Text>
              <Switch
                value={includeLunch}
                onValueChange={setIncludeLunch}
                trackColor={{ true: colors.primary, false: "#cdcdcd" }}
                ios_backgroundColor="#cdcdcd"
              />
            </View>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Dinner</Text>
              <Text style={styles.alwaysOn}>always</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function isoFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00");
  return !Number.isNaN(d.getTime());
}

function enumerateDates(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = new Date(start + "T00:00:00");
  const endD = new Date(end + "T00:00:00");
  while (cur.getTime() <= endD.getTime()) {
    out.push(isoFromDate(cur));
    cur = addDays(cur, 1);
  }
  return out;
}

function defaultLabel(range: string[]): string {
  if (range.length === 0) return "Untitled plan";
  const start = new Date(range[0] + "T00:00:00");
  const end = new Date(range[range.length - 1] + "T00:00:00");
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
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
  cancel: { paddingHorizontal: 12, paddingVertical: 6 },
  cancelText: { color: colors.primary, fontSize: 16, fontWeight: "600" },
  heading: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: colors.primary,
    textAlign: "center",
  },
  saveBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: colors.card, fontWeight: "600", fontSize: 14 },

  body: { padding: 24 },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.fg,
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.fg,
  },
  inputError: { borderColor: colors.destructive },
  row2: { flexDirection: "row" },
  help: { fontSize: 12, color: colors.mutedFg, marginTop: 6 },
  helpError: { fontSize: 12, color: colors.destructive, marginTop: 6 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  toggleLabel: { flex: 1, fontSize: 15, color: colors.fg },
  alwaysOn: { color: colors.mutedFg, fontSize: 13, fontStyle: "italic" },
});
