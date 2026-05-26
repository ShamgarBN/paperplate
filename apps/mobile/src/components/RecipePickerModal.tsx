/**
 * Modal that shows the recipe library with a search box and a tap-to-pick
 * handler. Used by the plans screen to assign a recipe to a slot.
 */
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native";
import { supabase } from "../lib/supabase";
import { colors, fonts, radii } from "../theme/tokens";

interface Recipe {
  id: number;
  title: string;
  base_servings: number;
  preferred_servings: number | null;
  total_min: number | null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onPick: (recipe: Recipe) => void;
  heading?: string;
}

export function RecipePickerModal({
  visible,
  onClose,
  onPick,
  heading = "Pick a recipe",
}: Props) {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setError(null);
    (async () => {
      const { data, error: e } = await supabase
        .from("recipes")
        .select("id, title, base_servings, preferred_servings, total_min")
        .order("title");
      if (cancelled) return;
      if (e) setError(e.message);
      else setRecipes((data ?? []) as Recipe[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const filtered = useMemo(() => {
    if (!recipes) return null;
    const q = query.trim().toLowerCase();
    if (q.length === 0) return recipes;
    return recipes.filter((r) => r.title.toLowerCase().includes(q));
  }, [recipes, query]);

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
          <Text style={styles.heading}>{heading}</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.searchWrap}>
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="Search recipes..."
            placeholderTextColor={colors.mutedFg}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </View>
        {error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : !filtered ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(r) => String(r.id)}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.centered}>
                <Text style={styles.muted}>No matches.</Text>
              </View>
            }
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <Pressable
                style={styles.row}
                onPress={() => {
                  onPick(item);
                  onClose();
                }}
              >
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.rowMeta}>
                  Serves {item.preferred_servings ?? item.base_servings}
                  {item.total_min ? ` · ${item.total_min} min` : ""}
                </Text>
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
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
  cancel: { paddingHorizontal: 12, paddingVertical: 6 },
  cancelText: { color: colors.primary, fontSize: 16, fontWeight: "600" },
  heading: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: colors.primary,
    textAlign: "center",
  },
  headerSpacer: { width: 70 },

  searchWrap: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  search: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.fg,
  },

  list: { padding: 16 },
  sep: { height: 8 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  muted: { color: colors.mutedFg, fontSize: 14 },
  errorText: { color: colors.destructive, fontSize: 14, padding: 24 },
  row: {
    backgroundColor: colors.card,
    padding: 14,
    borderRadius: 12,
  },
  rowTitle: { fontSize: 16, fontWeight: "600", color: colors.fg },
  rowMeta: { fontSize: 12, color: colors.mutedFg, marginTop: 4 },
});
