import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native";
import { supabase } from "../lib/supabase";

interface Recipe {
  id: number;
  title: string;
  description: string | null;
  base_servings: number;
  total_min: number | null;
  image_path: string | null;
}

interface Category {
  id: number;
  kind: string;
  name: string;
}

interface Props {
  onSelect: (recipeId: number) => void;
  onAdd: () => void;
}

const FILTER_KINDS = [
  { key: "cuisine", label: "Cuisine" },
  { key: "protein", label: "Protein" },
  { key: "type", label: "Type" },
  { key: "cooking_method", label: "Method" },
  { key: "dietary", label: "Dietary" },
] as const;

type FilterKind = (typeof FILTER_KINDS)[number]["key"];

export function LibraryScreen({ onSelect, onAdd }: Props) {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [recipeCategories, setRecipeCategories] = useState<
    Map<number, Set<number>>
  >(new Map());
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  // Map: filter kind → set of selected category ids. Multi-select within
  // a kind is OR (any matches), but across kinds is AND (must match all).
  const [selected, setSelected] = useState<Record<FilterKind, Set<number>>>({
    cuisine: new Set(),
    protein: new Set(),
    type: new Set(),
    cooking_method: new Set(),
    dietary: new Set(),
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [recipesResp, catsResp, linksResp] = await Promise.all([
        supabase
          .from("recipes")
          .select("id, title, description, base_servings, total_min, image_path")
          .order("title"),
        supabase
          .from("categories")
          .select("id, kind, name")
          .order("kind")
          .order("name"),
        supabase
          .from("recipe_categories")
          .select("recipe_id, category_id"),
      ]);
      if (cancelled) return;
      const e = recipesResp.error || catsResp.error || linksResp.error;
      if (e) {
        setError(e.message);
        return;
      }
      setRecipes((recipesResp.data ?? []) as Recipe[]);
      setCategories((catsResp.data ?? []) as Category[]);
      const links = new Map<number, Set<number>>();
      for (const row of (linksResp.data ?? []) as any[]) {
        const set = links.get(row.recipe_id) ?? new Set<number>();
        set.add(row.category_id);
        links.set(row.recipe_id, set);
      }
      setRecipeCategories(links);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

  function toggle(kind: FilterKind, id: number) {
    setSelected((prev) => {
      const next = { ...prev };
      const set = new Set(prev[kind]);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      next[kind] = set;
      return next;
    });
  }

  function clearAll() {
    setSelected({
      cuisine: new Set(),
      protein: new Set(),
      type: new Set(),
      cooking_method: new Set(),
      dietary: new Set(),
    });
  }

  const activeCount = useMemo(
    () =>
      Object.values(selected).reduce((sum, s) => sum + s.size, 0),
    [selected],
  );

  const categoriesByKind = useMemo(() => {
    const out: Record<string, Category[]> = {};
    for (const c of categories ?? []) {
      (out[c.kind] ??= []).push(c);
    }
    return out;
  }, [categories]);

  // Apply search + filters in one pass so the count is always consistent
  // with the rendered list.
  const filtered = useMemo(() => {
    if (!recipes) return null;
    const q = query.trim().toLowerCase();
    return recipes.filter((r) => {
      // Text match
      if (q.length > 0) {
        const haystack =
          r.title.toLowerCase() +
          " " +
          (r.description?.toLowerCase() ?? "");
        if (!haystack.includes(q)) return false;
      }
      // Category filters: AND across kinds, OR within a kind.
      const recipeCats = recipeCategories.get(r.id) ?? new Set<number>();
      for (const kind of Object.keys(selected) as FilterKind[]) {
        const wanted = selected[kind];
        if (wanted.size === 0) continue;
        let anyMatch = false;
        for (const id of wanted) {
          if (recipeCats.has(id)) {
            anyMatch = true;
            break;
          }
        }
        if (!anyMatch) return false;
      }
      return true;
    });
  }, [recipes, recipeCategories, query, selected]);

  if (error) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!recipes || !filtered || !categories) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.centered}>
          <ActivityIndicator color="#2e6f70" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Text style={styles.headerTitle}>Library</Text>
          <Pressable onPress={onAdd} style={styles.addBtn}>
            <Text style={styles.addBtnText}>+ Add</Text>
          </Pressable>
          <Pressable onPress={signOut} style={styles.signOut}>
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search recipes..."
            placeholderTextColor="#9aa0a6"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          <Pressable
            onPress={() => setShowFilters((s) => !s)}
            style={[
              styles.filterToggle,
              (showFilters || activeCount > 0) && styles.filterToggleActive,
            ]}
          >
            <Text
              style={[
                styles.filterToggleText,
                (showFilters || activeCount > 0) && styles.filterToggleTextActive,
              ]}
            >
              Filters{activeCount > 0 ? ` (${activeCount})` : ""}
            </Text>
          </Pressable>
        </View>

        {showFilters ? (
          <View style={styles.filtersPanel}>
            {FILTER_KINDS.map(({ key, label }) => {
              const list = categoriesByKind[key] ?? [];
              if (list.length === 0) return null;
              return (
                <View key={key} style={styles.filterKind}>
                  <Text style={styles.filterKindLabel}>{label}</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filterChipRow}
                  >
                    {list.map((c) => {
                      const active = selected[key].has(c.id);
                      return (
                        <Pressable
                          key={c.id}
                          onPress={() => toggle(key, c.id)}
                          style={[
                            styles.filterChip,
                            active && styles.filterChipActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.filterChipText,
                              active && styles.filterChipTextActive,
                            ]}
                          >
                            {c.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              );
            })}
            {activeCount > 0 ? (
              <Pressable onPress={clearAll} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>Clear all filters</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.headerCount}>
          {filtered.length} of {recipes.length}{" "}
          {recipes.length === 1 ? "recipe" : "recipes"}
        </Text>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              {query || activeCount > 0
                ? "No recipes match your filters."
                : "No recipes yet."}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => onSelect(item.id)}>
            {isHttpUrl(item.image_path) ? (
              <Image
                source={{ uri: item.image_path as string }}
                style={styles.cardImage}
                resizeMode="cover"
              />
            ) : null}
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardMeta}>
                Serves {item.base_servings}
                {item.total_min ? ` · ${item.total_min} min` : ""}
              </Text>
              {item.description ? (
                <Text style={styles.cardDesc} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4ede0" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: "#b3261e", fontSize: 16, padding: 24 },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e6dec9",
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  headerTitle: { fontSize: 28, fontWeight: "700", color: "#2e6f70", flex: 1 },
  headerCount: { color: "#5f6368", fontSize: 12, marginTop: 8 },

  searchRow: { flexDirection: "row", alignItems: "center" },
  searchInput: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: "#202124",
    borderWidth: 1,
    borderColor: "#dcdcdc",
    marginRight: 8,
  },
  filterToggle: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dcdcdc",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  filterToggleActive: { backgroundColor: "#2e6f70", borderColor: "#2e6f70" },
  filterToggleText: { color: "#3c4043", fontSize: 14, fontWeight: "600" },
  filterToggleTextActive: { color: "#fff" },

  filtersPanel: {
    marginTop: 12,
    paddingTop: 6,
  },
  filterKind: { marginBottom: 8 },
  filterKindLabel: {
    fontSize: 12,
    color: "#5f6368",
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  filterChipRow: { paddingVertical: 2 },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#dcdcdc",
    backgroundColor: "#fff",
    marginRight: 6,
  },
  filterChipActive: { backgroundColor: "#2e6f70", borderColor: "#2e6f70" },
  filterChipText: { fontSize: 12, color: "#3c4043", fontWeight: "500" },
  filterChipTextActive: { color: "#fff" },
  clearBtn: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginTop: 4,
  },
  clearBtnText: { color: "#b3261e", fontSize: 13, fontWeight: "600" },

  signOut: { paddingHorizontal: 12, paddingVertical: 6 },
  signOutText: { color: "#2e6f70", fontSize: 14, fontWeight: "600" },
  addBtn: {
    backgroundColor: "#2e6f70",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
  },
  addBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  list: { padding: 16 },
  sep: { height: 12 },
  emptyBox: { padding: 24, alignItems: "center" },
  emptyText: { color: "#5f6368", fontSize: 14 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    overflow: "hidden",
  },
  cardImage: {
    width: "100%",
    height: 180,
    backgroundColor: "#e6dec9",
  },
  cardBody: { padding: 18 },
  cardTitle: { fontSize: 18, fontWeight: "600", color: "#202124" },
  cardMeta: { marginTop: 4, color: "#5f6368", fontSize: 13 },
  cardDesc: { marginTop: 8, color: "#3c4043", fontSize: 14, lineHeight: 20 },
});

function isHttpUrl(value: string | null | undefined): boolean {
  return (
    typeof value === "string" &&
    (value.startsWith("http://") || value.startsWith("https://"))
  );
}
