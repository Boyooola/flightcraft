/**
 * components/ui/SeasonPill.tsx
 *
 * Persistent pill showing the current top seasonal effect.
 * Always visible on the map — positioned below SurgeIndicator.
 * Tapping it does nothing for now (could open a season breakdown later).
 */

import { SURGE_PILL_HEIGHT } from "@/components/ui/SurgeIndicator";
import { Radius, Spacing } from "@/constants/theme";
import { useSheetLayout } from "@/hooks/useSheetLayout";
import { getActiveSeason } from "@/lib/seasons";
import { useActiveDemandWave, useGameStore } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

// Height of SurgeIndicator pill + gap — pill sits below it
const GAP = Spacing.xs ?? 4;

export default function SeasonPill() {
  const activeDemandWave = useActiveDemandWave();
  const { tabBarHeight } = useSheetLayout();
  const day = useGameStore((s) => s.airline?.day ?? 1);

  const season = useMemo(() => {
    const { effects } = getActiveSeason(day);
    // Pick top effect by absolute impact
    const top = effects[0];
    if (!top || Math.abs(top.multiplier - 1.0) < 0.05) return null;

    const pct = Math.round(Math.abs(top.multiplier - 1.0) * 100);
    const positive = top.multiplier > 1;

    return {
      label: top.label,
      icon: top.icon,
      color: positive ? "#22c55e" : "#f59e0b",
      pct: positive ? `+${pct}%` : `-${pct}%`,
      region: top.region.replace(/_/g, " "),
    };
  }, [day]);

  if (!season) return null;

  return (
    <View
      style={[
        s.wrap,
        {
          bottom: tabBarHeight + Spacing.xxl + SURGE_PILL_HEIGHT + GAP + 8,
        },
      ]}
      pointerEvents="none"
    >
      <View style={[s.pill, { borderColor: season.color + "44" }]}>
        <Ionicons name={season.icon as any} size={11} color={season.color} />
        <Text style={[s.label, { color: season.color }]} numberOfLines={1}>
          {season.label}
        </Text>
        <View style={[s.badge, { backgroundColor: season.color + "18" }]}>
          <Text style={[s.pct, { color: season.color }]}>{season.pct}</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: Spacing.md,
    right: Spacing.md,
    zIndex: 41,
    alignItems: "flex-start",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(4,9,15,0.88)",
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  label: {
    fontSize: 10,
    fontWeight: "700",
    flexShrink: 1,
  },
  badge: {
    borderRadius: Radius.full,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  pct: {
    fontSize: 9,
    fontWeight: "900",
  },
});
