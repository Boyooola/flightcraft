/**
 * components/ui/SurgeIndicator.tsx
 *
 * Persistent compact pill shown on the map while any demand surge or
 * revenue-affecting daily event is active.
 *
 * Unlike DailyEventCard (auto-dismisses in 5s) and DemandWaveBanner
 * (auto-dismisses in 8s), this stays visible all day so the player
 * always knows a multiplier is in effect while routes are running.
 *
 * Sources:
 *   - activeDemandWave  → wave boosted pax on specific demands
 *   - dailyEvent.waveKind → wave-type event from useDailyEvents
 *   - dailyEvent.revenueMultiplier ≠ 1 → positive/negative event
 *
 * Positioned bottom-left above the tab bar, below RevenueModifierBadge.
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import { useSheetLayout } from "@/hooks/useSheetLayout";
import { useActiveDemandWave, useDailyEvent, useGameStore } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
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

export default function SurgeIndicator() {
  const dailyEvent = useDailyEvent();
  const activeDemandWave = useActiveDemandWave();
  const { tabBarHeight } = useSheetLayout();

  const slideY = useRef(new Animated.Value(40)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const prevDay = useRef<number>(-1);
  const day = useGameStore((s) => s.airline?.day ?? 0);

  // Derive what to show — wave takes priority over plain event
  const waveKind = activeDemandWave?.wave.kind ?? dailyEvent?.waveKind;
  const isWave = !!waveKind;

  const revMul =
    (dailyEvent?.revenueMultiplier ?? 1.0) *
    (activeDemandWave?.wave.revenueMultiplier ?? 1.0);

  const hasEffect = isWave || Math.abs(revMul - 1.0) >= 0.01;

  const title =
    activeDemandWave?.wave.title ??
    (dailyEvent?.waveKind ? dailyEvent.title : null) ??
    dailyEvent?.title ??
    "";

  const icon =
    activeDemandWave?.wave.icon ?? dailyEvent?.icon ?? "flash-outline";

  const pct = Math.round((revMul - 1) * 100);
  const pctTxt = pct > 0 ? `+${pct}%` : pct < 0 ? `${pct}%` : null;

  const color = waveKind
    ? (WAVE_COLORS[waveKind] ?? Colors.amber)
    : revMul > 1
      ? "#22c55e"
      : "#ef4444";

  // How many pax affected (wave only)
  const totalAddedPax =
    activeDemandWave?.totalAddedPax ?? dailyEvent?.waveAddedPax;
  const affectedSlots =
    activeDemandWave?.updates.length ?? dailyEvent?.waveAffectedSlots;

  // Slide in when effect appears, slide out when it clears
  useEffect(() => {
    if (hasEffect) {
      Animated.parallel([
        Animated.spring(slideY, {
          toValue: 0,
          friction: 9,
          tension: 70,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY, {
          toValue: 40,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [hasEffect, opacity, slideY]);

  // Slide out when day advances (store clears event + wave on new day)
  useEffect(() => {
    if (prevDay.current !== -1 && day !== prevDay.current) {
      Animated.parallel([
        Animated.timing(slideY, {
          toValue: 40,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
    prevDay.current = day;
  }, [day]);

  // Never return null — let opacity handle visibility.
  // Returning null while hasEffect is true kills the animation.
  return (
    <Animated.View
      style={[
        s.wrap,
        {
          bottom: tabBarHeight + Spacing.xxl,
          opacity,
          transform: [{ translateY: slideY }],
        },
      ]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        style={[s.pill, { borderColor: color + "55" }]}
        activeOpacity={0.82}
        onPress={() => {
          // Tap opens airport sheet for the primary affected hub if wave
          const hub = activeDemandWave?.updates[0];
          if (hub) {
            const airports = useGameStore.getState().airports;
            const ap = airports.find((a) => a.iata === hub.originIata);
            if (ap) useGameStore.getState().openSheet?.("airport", ap);
          }
        }}
      >
        {/* Icon */}
        <View style={[s.iconWrap, { backgroundColor: color + "20" }]}>
          <Ionicons name={icon as any} size={13} color={color} />
        </View>

        {/* Text */}
        <View style={s.body}>
          <Text style={[s.title, { color }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={s.sub} numberOfLines={1}>
            {[
              // Pax boost — only for waves
              totalAddedPax != null && `+${totalAddedPax.toLocaleString()} pax`,
              // Revenue effect — for any event with multiplier
              pctTxt && `${pctTxt} revenue`,
              // Affected routes — only for waves
              affectedSlots != null &&
                `${affectedSlots} route${affectedSlots !== 1 ? "s" : ""}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>

        {/* Type badge — PAX or REV or BOTH */}
        <View
          style={[
            s.typeBadge,
            { backgroundColor: color + "18", borderColor: color + "44" },
          ]}
        >
          <Text style={[s.typeTxt, { color }]}>
            {isWave && pctTxt ? "PAX + REV" : isWave ? "PAX" : "REV"}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: Spacing.md,
    right: Spacing.md,
    zIndex: 42,
    alignItems: "flex-start",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs ?? 4,
    backgroundColor: "rgba(4,9,15,0.93)",
    borderWidth: 1,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  body: { flexShrink: 1 },
  title: { fontSize: 11, fontWeight: "700" },
  sub: { fontSize: 9, color: Colors.dim, marginTop: 1 },
  typeBadge: {
    borderRadius: Radius.sm ?? 4,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 2,
    flexShrink: 0,
  },
  typeTxt: { fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
});
