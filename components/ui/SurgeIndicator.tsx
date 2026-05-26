/**
 * components/ui/SurgeIndicator.tsx
 *
 * Persistent compact pill shown on the map while any demand surge,
 * revenue-affecting daily event, or choice event consequence is active.
 *
 * Unlike DailyEventCard (auto-dismisses in 5s) and DemandWaveBanner
 * (auto-dismisses in 8s), this stays visible all day so the player
 * always knows a multiplier is in effect while routes are running.
 *
 * Sources (priority order):
 *   1. activeDemandWave  → wave boosted pax on specific demands
 *   2. dailyEvent        → passive daily event with revenue multiplier
 *   3. activeChoiceConsequence → lingering effect from a player decision
 *
 * When multiple sources are active, wave takes priority for display,
 * but all multipliers stack in the revenue tick regardless.
 *
 * Positioned bottom-left above the tab bar, below SeasonPill.
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import { useSheetLayout } from "@/hooks/useSheetLayout";
import { useActiveDemandWave, useDailyEvent, useGameStore } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// Exported so SeasonPill can position itself directly below
export const SURGE_PILL_HEIGHT = 42;

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
  const activeChoiceConsequence = useGameStore(
    (s) => s.activeChoiceConsequence,
  );
  const day = useGameStore((s) => s.airline?.day ?? 0);
  const { tabBarHeight } = useSheetLayout();

  const slideY = useRef(new Animated.Value(40)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const prevDay = useRef<number>(-1);

  // ── Derive what to show ────────────────────────────────────────
  // Wave > daily event > choice consequence for display priority.
  // All active multipliers are noted in the sub-label when stacking.
  const display = useMemo(() => {
    const waveKind = activeDemandWave?.wave.kind ?? dailyEvent?.waveKind;
    const isWave = !!waveKind;

    // Combined revenue multiplier from daily event + demand wave
    const eventRevMul =
      (dailyEvent?.revenueMultiplier ?? 1.0) *
      (activeDemandWave?.wave.revenueMultiplier ?? 1.0);

    // Choice consequence multiplier — only if still active today
    const choiceActive =
      activeChoiceConsequence?.revenueMultiplier != null &&
      activeChoiceConsequence?.revenueMultiplierEndsDay != null &&
      day < activeChoiceConsequence.revenueMultiplierEndsDay;

    const choiceRevMul = choiceActive
      ? (activeChoiceConsequence!.revenueMultiplier ?? 1.0)
      : 1.0;

    // Combined multiplier shown in badge (all sources stacked)
    const combinedRevMul = eventRevMul * choiceRevMul;

    // Whether there's anything worth showing
    const hasEventEffect = isWave || Math.abs(eventRevMul - 1.0) >= 0.01;
    const hasChoiceEffect = choiceActive;
    const hasEffect = hasEventEffect || hasChoiceEffect;

    // ── Display values ─────────────────────────────────────────
    // If wave or daily event is active, that leads. Choice is shown
    // as a secondary note in the sub-label. If only choice is active
    // (no wave/event), choice leads.

    let title: string;
    let icon: string;
    let color: string;
    let totalAddedPax: number | undefined;
    let affectedSlots: number | undefined;
    let primaryMul: number;
    let isChoiceOnly: boolean;

    if (hasEventEffect) {
      // Wave or daily event leads
      title =
        activeDemandWave?.wave.title ??
        (dailyEvent?.waveKind ? dailyEvent.title : null) ??
        dailyEvent?.title ??
        "";
      icon = activeDemandWave?.wave.icon ?? dailyEvent?.icon ?? "flash-outline";
      color = waveKind
        ? (WAVE_COLORS[waveKind] ?? Colors.amber)
        : eventRevMul > 1
          ? "#22c55e"
          : "#ef4444";
      totalAddedPax =
        activeDemandWave?.totalAddedPax ?? dailyEvent?.waveAddedPax;
      affectedSlots =
        activeDemandWave?.updates.length ?? dailyEvent?.waveAffectedSlots;
      primaryMul = combinedRevMul; // show combined pct
      isChoiceOnly = false;
    } else {
      // Only choice consequence is active — lead with it
      const choicePct = Math.round((choiceRevMul - 1) * 100);
      title = "Decision in effect";
      icon = "timer-outline";
      color = choiceRevMul >= 1 ? "#22c55e" : "#ef4444";
      primaryMul = choiceRevMul;
      isChoiceOnly = true;
    }

    const pct = Math.round((primaryMul - 1) * 100);
    const pctTxt = pct > 0 ? `+${pct}%` : pct < 0 ? `${pct}%` : null;

    // Badge label
    const badgeLabel =
      isWave && pctTxt
        ? "Boost"
        : isWave
          ? "Demand"
          : isChoiceOnly
            ? "Choice"
            : pct > 0
              ? "Bonus"
              : "Event";

    // Sub-label lines
    const subParts: string[] = [];
    if (totalAddedPax != null)
      subParts.push(`+${totalAddedPax.toLocaleString()} passengers`);
    if (pctTxt) subParts.push(`${pctTxt} revenue`);
    if (affectedSlots != null)
      subParts.push(
        `${affectedSlots} route${affectedSlots !== 1 ? "s" : ""} affected`,
      );

    // If choice is stacking ON TOP of an event, note it
    if (hasEventEffect && hasChoiceEffect && choiceRevMul !== 1.0) {
      const choicePct = Math.round((choiceRevMul - 1) * 100);
      const choiceSign = choicePct >= 0 ? "+" : "";
      const daysLeft =
        (activeChoiceConsequence!.revenueMultiplierEndsDay ?? 0) - day;
      subParts.push(`🎯 ${choiceSign}${choicePct}% choice · ${daysLeft}d left`);
    }

    // If choice-only, show days left
    if (isChoiceOnly && activeChoiceConsequence?.revenueMultiplierEndsDay) {
      const daysLeft = activeChoiceConsequence.revenueMultiplierEndsDay - day;
      subParts.push(`${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining`);
    }

    return {
      hasEffect,
      title,
      icon,
      color,
      pctTxt,
      badgeLabel,
      sub: subParts.join(" · "),
      isWave,
      waveKind,
    };
  }, [activeDemandWave, dailyEvent, activeChoiceConsequence, day]);

  // ── Animation ──────────────────────────────────────────────────
  useEffect(() => {
    const dayChanged = prevDay.current !== -1 && day !== prevDay.current;
    prevDay.current = day;

    if (dayChanged && !display.hasEffect) {
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
      return;
    }

    if (display.hasEffect) {
      if (dayChanged) {
        slideY.setValue(40);
        opacity.setValue(0);
      }
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
  }, [day, display.hasEffect]);

  // Never return null — opacity handles visibility.
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
        style={[s.pill, { borderColor: display.color + "55" }]}
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
        <View style={[s.iconWrap, { backgroundColor: display.color + "20" }]}>
          <Ionicons
            name={display.icon as any}
            size={13}
            color={display.color}
          />
        </View>

        {/* Text */}
        <View style={s.body}>
          <Text style={[s.title, { color: display.color }]} numberOfLines={1}>
            {display.title}
          </Text>
          {display.sub ? (
            <Text style={s.sub} numberOfLines={1}>
              {display.sub}
            </Text>
          ) : null}
        </View>

        {/* Badge */}
        <View
          style={[
            s.typeBadge,
            {
              backgroundColor: display.color + "18",
              borderColor: display.color + "44",
            },
          ]}
        >
          <Text style={[s.typeTxt, { color: display.color }]}>
            {display.badgeLabel}
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
