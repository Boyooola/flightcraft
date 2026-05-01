/**
 * components/ui/DaySummaryCard.tsx
 *
 * WorldWide Rush-style end-of-day flow / pressure result card.
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
const HOLD_MS = 4800;
const SLIDE_MS = 220;
const GREEN = "#22c55e";
const RED = "#ef4444";
const AMBER = "#F59E0B";

function fmtPax(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${Math.round(value / 1000)}K`;
  return value.toLocaleString();
}

function Stat({
  icon,
  label,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={st.box}>
      <Ionicons name={icon as any} size={14} color={color} />
      <Text style={[st.value, { color }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={st.label}>{label}</Text>
    </View>
  );
}

export default function DaySummaryCard() {
  const insets = useSafeAreaInsets();
  const { queue, dismiss } = useToastListener();

  const slideY = useRef(new Animated.Value(260)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;
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
        toValue: 260,
        duration: SLIDE_MS,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: SLIDE_MS,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.96,
        duration: SLIDE_MS,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (currentRef.current) dismiss(currentRef.current.id);
      currentRef.current = null;
      setCurrent(null);
      slideY.setValue(260);
      opacity.setValue(0);
      scale.setValue(0.96);
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
        tension: 90,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 8,
        tension: 100,
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
  const pressuredHubs = busyHubs + overcrowdedHubs + crisisHubs;

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
      ? `${crisisHubs} crisis hub${crisisHubs === 1 ? "" : "s"}`
      : overcrowdedHubs > 0
        ? `${overcrowdedHubs} overcrowded`
        : aiLostPax > 0
          ? `${fmtPax(aiLostPax)} lost to rivals`
          : stalledRoutes > 0
            ? `${stalledRoutes} stalled`
            : null;

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
        <View style={s.header}>
          <View>
            <Text style={[s.label, { color: flowColor }]}>
              DAY {day} {pressuredHubs > 0 ? "PRESSURE RESULT" : "FLOW RESULT"}
            </Text>
            <Text style={[s.net, { color: netPositive ? GREEN : RED }]}>
              {netPositive ? "+" : ""}
              {fmtCash(net)}
            </Text>
          </View>

          <TouchableOpacity
            onPress={dismissCurrent}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={14} color={Colors.dim} />
          </TouchableOpacity>
        </View>

        <View style={s.stats}>
          <Stat
            icon="people-outline"
            label="Moved"
            value={fmtPax(paxToday)}
            color={paxToday > 0 ? Colors.sky : Colors.dim}
          />
          <Stat
            icon="time-outline"
            label="Waiting"
            value={fmtPax(waitingPax)}
            color={waitingPax > 0 ? AMBER : GREEN}
          />
          <Stat
            icon="flag-outline"
            label="Missions"
            value={
              missionsTotal > 0
                ? `${missionsToday}/${missionsTotal}${allMissions ? "✓" : ""}`
                : "—"
            }
            color={allMissions ? GREEN : Colors.amber}
          />
        </View>

        <View style={s.rewardRow}>
          <View style={s.rewardLeft}>
            <Ionicons
              name={statusText ? "warning-outline" : "cash-outline"}
              size={13}
              color={statusText ? flowColor : GREEN}
            />
            <Text style={s.rewardText}>
              {revenue > 0 ? fmtCash(revenue) : "$0"} route rewards
            </Text>
          </View>

          {statusText && <Text style={s.stalledText}>{statusText}</Text>}
        </View>

        <View style={s.footer}>
          <Text style={s.footerText} numberOfLines={1}>
            Net worth {fmtCash(netWorth)}
            {nwDelta !== 0
              ? ` · ${nwDelta > 0 ? "▲" : "▼"} ${fmtCash(Math.abs(nwDelta))}`
              : ""}
          </Text>

          {interest > 0 && (
            <Text style={s.dragText}>Loan drag -{fmtCash(interest)}</Text>
          )}
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

const st = StyleSheet.create({
  box: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    borderRadius: Radius.lg,
    backgroundColor: "rgba(255,255,255,.035)",
    paddingVertical: Spacing.sm,
    minWidth: 0,
  },
  value: {
    fontSize: 13,
    fontWeight: "900",
  },
  label: {
    fontSize: 8,
    color: Colors.dim,
    fontWeight: "800",
  },
});

const s = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: Spacing.md,
    right: Spacing.md,
    zIndex: 65,
  },
  card: {
    backgroundColor: "rgba(8,15,30,0.98)",
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.48,
    shadowRadius: 16,
    elevation: 13,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  label: {
    fontSize: 9,
    color: Colors.dim,
    letterSpacing: 1.8,
    fontWeight: "900",
  },
  net: {
    fontSize: 28,
    fontWeight: "900",
    marginTop: 2,
  },
  stats: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  rewardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  rewardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  rewardText: {
    fontSize: 10,
    color: Colors.dim,
    fontWeight: "800",
  },
  stalledText: {
    fontSize: 10,
    color: RED,
    fontWeight: "900",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  footerText: {
    flex: 1,
    fontSize: 10,
    color: Colors.dim,
    fontWeight: "700",
  },
  dragText: {
    fontSize: 10,
    color: RED,
    fontWeight: "800",
  },
  progress: {
    position: "absolute",
    bottom: 0,
    left: 0,
    height: 3,
  },
});
