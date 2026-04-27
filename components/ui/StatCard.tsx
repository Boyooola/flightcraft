import { View, Text, StyleSheet, type ViewStyle } from "react-native";
import { Colors, Spacing, Radius } from "@/constants/theme";

interface StatCardProps {
  label:  string;
  value:  string;
  color?: string;
  style?: ViewStyle;
}

export function StatCard({ label, value, color = Colors.text, style }: StatCardProps) {
  return (
    <View style={[s.card, style]}>
      <Text style={s.label}>{label.toUpperCase()}</Text>
      <Text style={[s.value, { color }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    alignItems: "center",
  },
  label: {
    fontSize: 8,
    color: Colors.dim,
    letterSpacing: 1,
    marginBottom: 4,
  },
  value: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
});
