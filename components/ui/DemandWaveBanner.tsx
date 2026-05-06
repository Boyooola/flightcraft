/**
 * components/ui/DemandWaveBanner.tsx
 *
 * Slides in from below TopHUD when a demand wave is active.
 * Shows wave title, affected routes count, and pax added.
 * Tapping shows a breakdown. Auto-dismisses after 8 seconds.
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import { useHudHeight } from "@/hooks/useSheetLayout";
import { useActiveDemandWave } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const WAVE_COLORS: Record<string, string> = {
  holiday: "#f59e0b",
  business: "#3b82f6",
  festival: "#ec4899",
  school_break: "#10b981",
  global_rush: "#8b5cf6",
};

export default function DemandWaveBanner() {
  const wave = useActiveDemandWave();
  const hudH = useHudHeight();
  const slideY = useRef(new Animated.Value(-80)).current;
  const [expanded, setExpanded] = useState(false);
  const prevId = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (wave && wave.wave.id !== prevId.current) {
      prevId.current = wave.wave.id;
      setExpanded(false);

      // Slide in
      Animated.spring(slideY, {
        toValue: 0,
        friction: 9,
        tension: 70,
        useNativeDriver: true,
      }).start();

      // Auto-dismiss after 8s
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => dismiss(), 8000);
    } else if (!wave) {
      dismiss();
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [wave?.wave.id]);

  function dismiss() {
    Animated.timing(slideY, {
      toValue: -120,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }

  if (!wave) return null;

  const color = WAVE_COLORS[wave.wave.kind] ?? Colors.sky;

  return (
    <Animated.View
      style={[
        s.wrap,
        { top: hudH + Spacing.sm, transform: [{ translateY: slideY }] },
      ]}
    >
      <TouchableOpacity
        style={[s.pill, { borderColor: color + "44" }]}
        onPress={() => setExpanded((e) => !e)}
        activeOpacity={0.88}
      >
        {/* Header row */}
        <View style={s.header}>
          <View style={[s.iconWrap, { backgroundColor: color + "22" }]}>
            <Ionicons name={wave.wave.icon as any} size={16} color={color} />
          </View>
          <View style={s.headerBody}>
            <Text style={[s.title, { color }]}>{wave.wave.title}</Text>
            <Text style={s.sub}>
              +{wave.totalAddedPax.toLocaleString()} pax across{" "}
              {wave.updates.length} route{wave.updates.length !== 1 ? "s" : ""}
            </Text>
          </View>
          <View style={[s.badge, { backgroundColor: color + "22" }]}>
            <Text style={[s.badgeTxt, { color }]}>
              ×{wave.wave.multiplier.toFixed(1)}
            </Text>
          </View>
          <TouchableOpacity onPress={dismiss} hitSlop={12}>
            <Ionicons name="close" size={14} color={Colors.dim} />
          </TouchableOpacity>
        </View>

        {/* Expanded breakdown */}
        {expanded && (
          <View style={s.breakdown}>
            <Text style={s.breakdownDesc}>{wave.wave.desc}</Text>
            {wave.updates.slice(0, 5).map((u) => (
              <View key={u.demandId} style={s.breakdownRow}>
                <Text style={s.breakdownRoute}>
                  {u.originIata} → {u.destIata}
                </Text>
                <Text style={[s.breakdownDelta, { color }]}>
                  +{u.addedPax.toLocaleString()} pax
                </Text>
              </View>
            ))}
            {wave.updates.length > 5 && (
              <Text style={s.moreRoutes}>
                +{wave.updates.length - 5} more routes affected
              </Text>
            )}
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: Spacing.md,
    right: Spacing.md,
    zIndex: 54,
  },
  pill: {
    backgroundColor: "rgba(8,15,30,0.96)",
    borderRadius: Radius.xl,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headerBody: { flex: 1, gap: 1 },
  title: { fontSize: 12, fontWeight: "700" },
  sub: { fontSize: 10, color: Colors.muted },
  badge: {
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeTxt: { fontSize: 11, fontWeight: "700" },
  breakdown: {
    marginTop: Spacing.sm,
    gap: 4,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  breakdownDesc: { fontSize: 10, color: Colors.muted, marginBottom: 4 },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between" },
  breakdownRoute: { fontSize: 10, color: Colors.text },
  breakdownDelta: { fontSize: 10, fontWeight: "700" },
  moreRoutes: { fontSize: 9, color: Colors.dim, marginTop: 2 },
});
