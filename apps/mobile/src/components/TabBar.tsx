import { Pressable, StyleSheet, Text, View } from "react-native";

export type Tab = "library" | "plans" | "shopping";

interface Props {
  active: Tab;
  onChange: (tab: Tab) => void;
}

export function TabBar({ active, onChange }: Props) {
  return (
    <View style={styles.bar}>
      <TabButton
        label="Library"
        icon="📖"
        isActive={active === "library"}
        onPress={() => onChange("library")}
      />
      <TabButton
        label="Plans"
        icon="📅"
        isActive={active === "plans"}
        onPress={() => onChange("plans")}
      />
      <TabButton
        label="Shopping"
        icon="🛒"
        isActive={active === "shopping"}
        onPress={() => onChange("shopping")}
      />
    </View>
  );
}

function TabButton({
  label,
  icon,
  isActive,
  onPress,
}: {
  label: string;
  icon: string;
  isActive: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.button}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={[styles.label, isActive && styles.labelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e6dec9",
    paddingTop: 8,
    paddingBottom: 24,
  },
  button: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 4,
  },
  icon: { fontSize: 22, marginBottom: 2 },
  label: { fontSize: 12, color: "#5f6368", fontWeight: "500" },
  labelActive: { color: "#2e6f70", fontWeight: "700" },
});
