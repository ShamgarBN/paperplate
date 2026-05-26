import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import type { Session } from "@supabase/supabase-js";
import {
  useFonts,
  Fraunces_500Medium,
  Fraunces_700Bold,
} from "@expo-google-fonts/fraunces";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { supabase } from "./src/lib/supabase";
import { SignInScreen } from "./src/screens/SignInScreen";
import { LibraryScreen } from "./src/screens/LibraryScreen";
import { RecipeDetailScreen } from "./src/screens/RecipeDetailScreen";
import { ShoppingListScreen } from "./src/screens/ShoppingListScreen";
import { PlansScreen } from "./src/screens/PlansScreen";
import { PlanDetailScreen } from "./src/screens/PlanDetailScreen";
import { PlanShoppingListScreen } from "./src/screens/PlanShoppingListScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { AddRecipeScreen } from "./src/screens/AddRecipeScreen";
import { EditRecipeScreen } from "./src/screens/EditRecipeScreen";
import { TabBar, type Tab } from "./src/components/TabBar";
import { colors } from "./src/theme/tokens";

export default function App() {
  // Load the Fraunces (display) + Inter (sans) families before rendering
  // anything so the first paint doesn't flash a system font.
  const [fontsLoaded] = useFonts({
    Fraunces_500Medium,
    Fraunces_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const [session, setSession] = useState<Session | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [tab, setTab] = useState<Tab>("library");
  const [selectedRecipeId, setSelectedRecipeId] = useState<number | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [viewingPlanShopping, setViewingPlanShopping] = useState(false);
  const [isAddingRecipe, setIsAddingRecipe] = useState(false);
  const [editingRecipeId, setEditingRecipeId] = useState<number | null>(null);
  // Bumping these causes the relevant screens to refetch.
  const [libraryNonce, setLibraryNonce] = useState(0);
  const [detailNonce, setDetailNonce] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setBootstrapped(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      if (!s) {
        setSelectedRecipeId(null);
        setSelectedPlanId(null);
        setViewingPlanShopping(false);
        setIsAddingRecipe(false);
        setEditingRecipeId(null);
        setTab("library");
      }
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!fontsLoaded || !bootstrapped) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.primary} size="large" />
        <StatusBar style="auto" />
      </View>
    );
  }

  if (!session) {
    return (
      <>
        <SignInScreen />
        <StatusBar style="auto" />
      </>
    );
  }

  function changeTab(next: Tab) {
    setTab(next);
    setSelectedRecipeId(null);
    setSelectedPlanId(null);
    setViewingPlanShopping(false);
    setIsAddingRecipe(false);
    setEditingRecipeId(null);
  }

  let body;
  if (isAddingRecipe) {
    body = (
      <AddRecipeScreen
        onBack={() => setIsAddingRecipe(false)}
        onCreated={(id) => {
          setIsAddingRecipe(false);
          setLibraryNonce((n) => n + 1);
          setSelectedRecipeId(id);
          setTab("library");
        }}
      />
    );
  } else if (editingRecipeId != null) {
    body = (
      <EditRecipeScreen
        recipeId={editingRecipeId}
        onBack={() => setEditingRecipeId(null)}
        onSaved={(id) => {
          setEditingRecipeId(null);
          setLibraryNonce((n) => n + 1);
          setDetailNonce((n) => n + 1);
          setSelectedRecipeId(id);
        }}
      />
    );
  } else if (tab === "library") {
    body =
      selectedRecipeId != null ? (
        <RecipeDetailScreen
          recipeId={selectedRecipeId}
          reloadKey={detailNonce}
          onBack={() => setSelectedRecipeId(null)}
          onEdit={(id) => setEditingRecipeId(id)}
        />
      ) : (
        <LibraryScreen
          key={libraryNonce}
          onSelect={setSelectedRecipeId}
          onAdd={() => setIsAddingRecipe(true)}
        />
      );
  } else if (tab === "plans") {
    if (selectedRecipeId != null) {
      // Opened a recipe from inside a plan; back returns to the plan detail.
      body = (
        <RecipeDetailScreen
          recipeId={selectedRecipeId}
          reloadKey={detailNonce}
          onBack={() => setSelectedRecipeId(null)}
          onEdit={(id) => setEditingRecipeId(id)}
        />
      );
    } else if (selectedPlanId != null && viewingPlanShopping) {
      body = (
        <PlanShoppingListScreen
          planId={selectedPlanId}
          onBack={() => setViewingPlanShopping(false)}
        />
      );
    } else if (selectedPlanId != null) {
      body = (
        <PlanDetailScreen
          planId={selectedPlanId}
          onBack={() => setSelectedPlanId(null)}
          onOpenRecipe={setSelectedRecipeId}
          onOpenShopping={() => setViewingPlanShopping(true)}
        />
      );
    } else {
      body = <PlansScreen onSelect={setSelectedPlanId} />;
    }
  } else if (tab === "shopping") {
    body = <ShoppingListScreen />;
  } else {
    body = <SettingsScreen />;
  }

  return (
    <View style={styles.appRoot}>
      <View style={styles.appBody}>{body}</View>
      <TabBar active={tab} onChange={changeTab} />
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  appRoot: { flex: 1, backgroundColor: colors.bg },
  appBody: { flex: 1 },
});
