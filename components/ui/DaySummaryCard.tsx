/**
 * components/ui/DaySummaryCard.tsx
 *
 * Compact end-of-day summary toast.
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import { gameSounds } from "@/hooks/useGameSounds";
import type { DaySummaryToastData } from "@/hooks/useToast";
import { useToastListener } from "@/hooks/useToast";
import { fmtCash } from "@/lib/revenue";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TAB_H = 72;
const HOLD_MS = 4200;
const SLIDE_MS = 200;

const GREEN = "#22c55e";
const RED = "#ef4444";
const AMBER = "#F59E0B";

function fmtPax(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${Math.round(value / 1000)}K`;
  return value.toLocaleString();
}

export default function DaySummaryCard() {
  const insets = useSafeAreaInsets();
  const { queue, dismiss } = useToastListener();

  const slideY = useRef(new Animated.Value(180)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.98)).current;
  const progress = useRef(new Animated.Value(1)).current;

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progAnim = useRef<Animated.CompositeAnimation | null>(null);

  const [current, setCurrent] = useState<DaySummaryToastData | null>(null);
  const currentRef = useRef<DaySummaryToastData | null>(null);

  const bottom = insets.bottom + TAB_H + Spacing.sm;

  const next =
    queue.find(
      (toast): toast is DaySummaryToastData => toast.type === "day-summary",
    ) ?? null;

  const dismissCurrent = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (progAnim.current) progAnim.current.stop();

    Animated.parallel([
      Animated.timing(slideY, {
        toValue: 180,
        duration: SLIDE_MS,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: SLIDE_MS,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.98,
        duration: SLIDE_MS,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (currentRef.current) dismiss(currentRef.current.id);

      currentRef.current = null;
      setCurrent(null);

      slideY.setValue(180);
      opacity.setValue(0);
      scale.setValue(0.98);
      progress.setValue(1);
    });
  };

  useEffect(() => {
    if (!next || currentRef.current) return;

    currentRef.current = next;
    setCurrent(next);

    gameSounds.play("dayAdvance");

    progress.setValue(1);

    Animated.parallel([
      Animated.spring(slideY, {
        toValue: 0,
        friction: 8,
        tension: 100,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 8,
        tension: 110,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: SLIDE_MS,
        useNativeDriver: true,
      }),
    ]).start();

    progAnim.current = Animated.timing(progress, {
      toValue: 0,
      duration: HOLD_MS,
      useNativeDriver: false,
    });

    progAnim.current.start();
    holdTimer.current = setTimeout(dismissCurrent, HOLD_MS);
  }, [next?.id]);

  if (!current) return null;

  const {
    day,
    revenue,
    interest,
    net,
    paxToday,
    missionsToday,
    missionsTotal,
    netWorth,
    prevNetWorth,
  } = current;

  const waitingPax = current.waitingPax ?? 0;
  const stalledRoutes = current.stalledRoutes ?? 0;
  const aiLostPax = current.aiStolenPax ?? 0;
  const busyHubs = current.busyHubs ?? 0;
  const overcrowdedHubs = current.overcrowdedHubs ?? 0;
  const crisisHubs = current.crisisHubs ?? 0;

  const netPositive = net >= 0;
  const allMissions = missionsToday === missionsTotal && missionsTotal > 0;
  const nwDelta = netWorth - prevNetWorth;

  const flowColor =
    crisisHubs > 0
      ? RED
      : overcrowdedHubs > 0 || stalledRoutes > 0 || waitingPax > paxToday
        ? AMBER
        : GREEN;

  const statusText =
    crisisHubs > 0
      ? `${crisisHubs} crisis`
      : overcrowdedHubs > 0
        ? `${overcrowdedHubs} crowded`
        : aiLostPax > 0
          ? `${fmtPax(aiLostPax)} lost`
          : stalledRoutes > 0
            ? `${stalledRoutes} stalled`
            : waitingPax > 0
              ? `${fmtPax(waitingPax)} waiting`
              : "Flow clear";

  return (
    <Animated.View
      style={[
        s.wrap,
        {
          bottom,
          opacity,
          transform: [{ translateY: slideY }, { scale }],
        },
      ]}
    >
      <TouchableOpacity
        style={[s.card, { borderColor: flowColor + "44" }]}
        onPress={dismissCurrent}
        activeOpacity={0.94}
      >
        <View style={[s.stripe, { backgroundColor: flowColor }]} />

        <View style={s.main}>
          <View style={s.top}>
            <View style={s.dayPill}>
              <Text style={s.dayLabel}>DAY</Text>
              <Text style={[s.day, { color: flowColor }]}>{day}</Text>
            </View>

            <View style={s.center}>
              <Text style={s.label}>DAILY RESULT</Text>
              <Text
                style={[s.net, { color: netPositive ? GREEN : RED }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {netPositive ? "+" : ""}
                {fmtCash(net)}
              </Text>
            </View>

            <TouchableOpacity
              onPress={dismissCurrent}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={s.closeBtn}
            >
              <Ionicons name="close" size={15} color={Colors.dim} />
            </TouchableOpacity>
          </View>

          <View style={s.metrics}>
            <View style={s.metric}>
              <Ionicons name="people-outline" size={12} color={Colors.sky} />
              <Text style={s.metricText}>{fmtPax(paxToday)} moved</Text>
            </View>

            <View style={s.dot} />

            <View style={s.metric}>
              <Ionicons
                name={
                  statusText === "Flow clear"
                    ? "checkmark-circle"
                    : "warning-outline"
                }
                size={12}
                color={flowColor}
              />
              <Text style={[s.metricText, { color: flowColor }]}>
                {statusText}
              </Text>
            </View>

            {missionsTotal > 0 && (
              <>
                <View style={s.dot} />
                <View style={s.metric}>
                  <Ionicons
                    name="flag-outline"
                    size={12}
                    color={allMissions ? GREEN : AMBER}
                  />
                  <Text
                    style={[
                      s.metricText,
                      { color: allMissions ? GREEN : Colors.dim },
                    ]}
                  >
                    {missionsToday}/{missionsTotal}
                    {allMissions ? " ✓" : ""}
                  </Text>
                </View>
              </>
            )}
          </View>

          <View style={s.footer}>
            <Text style={s.footerText} numberOfLines={1}>
              Rewards {fmtCash(revenue)}
              {interest > 0 ? ` · Loan -${fmtCash(interest)}` : ""}
            </Text>

            <Text
              style={[s.netWorth, { color: nwDelta >= 0 ? GREEN : RED }]}
              numberOfLines={1}
            >
              {nwDelta !== 0
                ? `${nwDelta > 0 ? "▲" : "▼"} ${fmtCash(Math.abs(nwDelta))}`
                : fmtCash(netWorth)}
            </Text>
          </View>
        </View>

        <Animated.View
          style={[
            s.progress,
            {
              width: progress.interpolate({
                inputRange: [0, 1],
                outputRange: ["0%", "100%"],
              }),
              backgroundColor: flowColor,
            },
          ]}
        />
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: Spacing.md,
    right: Spacing.md,
    zIndex: 65,
  },

  card: {
    flexDirection: "row",
    backgroundColor: "rgba(8,15,30,0.98)",
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.42,
    shadowRadius: 12,
    elevation: 12,
  },

  stripe: {
    width: 4,
  },

  main: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 6,
  },

  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },

  dayPill: {
    width: 42,
    height: 38,
    borderRadius: Radius.md,
    backgroundColor: "rgba(255,255,255,.045)",
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },

  dayLabel: {
    fontSize: 7,
    color: Colors.dim,
    letterSpacing: 1.3,
    fontWeight: "900",
  },

  day: {
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 18,
  },

  center: {
    flex: 1,
    minWidth: 0,
  },

  label: {
    fontSize: 8,
    color: Colors.dim,
    letterSpacing: 1.5,
    fontWeight: "900",
  },

  net: {
    fontSize: 22,
    fontWeight: "900",
    marginTop: 1,
  },

  closeBtn: {
    padding: 4,
  },

  metrics: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },

  metric: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  metricText: {
    fontSize: 10,
    color: Colors.dim,
    fontWeight: "800",
  },

  dot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.border,
  },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },

  footerText: {
    flex: 1,
    fontSize: 10,
    color: Colors.dim,
    fontWeight: "700",
  },

  netWorth: {
    fontSize: 10,
    fontWeight: "900",
  },

  progress: {
    position: "absolute",
    bottom: 0,
    left: 0,
    height: 3,
  },
});
