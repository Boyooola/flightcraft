import { View, StyleSheet, type ViewStyle } from "react-native";
import { Colors, Spacing } from "@/constants/theme";

export function Divider({ style }: { style?: ViewStyle }) {
  return <View style={[s.divider, style]} />;
}

const s = StyleSheet.create({
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: Spacing.sm,
  },
});
