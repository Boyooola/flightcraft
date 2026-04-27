import { View, Text, StyleSheet, type ViewStyle } from "react-native";
import { Colors, Radius, Spacing } from "@/constants/theme";

interface PillProps {
  label:  string;
  color?: string;
  style?: ViewStyle;
}

export function Pill({ label, color = Colors.sky, style }: PillProps) {
  return (
    <View style={[s.pill, { backgroundColor: color + "18", borderColor: color + "33" }, style]}>
      <Text style={[s.label, { color }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  pill: {
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  label: {
    fontSize: 9,
    letterSpacing: 0.8,
    fontWeight: "600",
  },
});
