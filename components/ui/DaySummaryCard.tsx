/**
 * components/ui/DaySummaryCard.tsx
 *
 * End-of-day summary card — slides up from above TabBar at each day tick.
 * Shows revenue, interest, net, pax, missions, net worth delta.
 * Displays for 6 seconds with a draining progress bar.
 * Dismisses on tap.
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
const HOLD_MS = 6000;
const SLIDE_MS = 300;
const GREEN = "#22c55e";
const RED = "#ef4444";

function DeltaBadge({ value }: { value: number }) {
  if (value === 0) return null;
  const positive = value > 0;
  return (
    <Text style={[db.txt, { color: positive ? GREEN : RED }]}>
      {positive ? "▲" : "▼"} {fmtCash(Math.abs(value))}
    </Text>
  );
}
const db = StyleSheet.create({
  txt: { fontSize: 9, fontWeight: "700" },
});

function Row({
  icon,
  label,
  value,
  valueColor,
  sub,
}: {
  icon: string;
  label: string;
  value: string;
  valueColor?: string;
  sub?: React.ReactNode;
}) {
  return (
    <View style={r.row}>
      <Ionicons
        name={icon as any}
        size={13}
        color={Colors.dim}
        style={r.icon}
      />
      <Text style={r.label}>{label}</Text>
      <View style={r.right}>
        {sub}
        <Text style={[r.value, { color: valueColor ?? Colors.text }]}>
          {value}
        </Text>
      </View>
    </View>
  );
}
const r = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 3 },
  icon: { width: 18, flexShrink: 0 },
  label: { flex: 1, fontSize: 11, color: Colors.muted },
  right: { flexDirection: "row", alignItems: "center", gap: 5 },
  value: { fontSize: 12, fontWeight: "700" },
});

export default function DaySummaryCard() {
  const insets = useSafeAreaInsets();
  const { queue, dismiss } = useToastListener();

  const slideY = useRef(new Animated.Value(300)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(1)).current;
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progAnim = useRef<Animated.CompositeAnimation | null>(null);
  const [current, setCurrent] = useState<DaySummaryToastData | null>(null);
  const currentRef = useRef<DaySummaryToastData | null>(null);

  const bottom = insets.bottom + TAB_H + Spacing.sm;

  const summaryQueue = queue.filter(
    (t): t is DaySummaryToastData => t.type === "day-summary",
  );
  const next = summaryQueue[0] ?? null;

  function dismissCurrent() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (progAnim.current) progAnim.current.stop();
    Animated.parallel([
      Animated.timing(slideY, {
        toValue: 300,
        duration: SLIDE_MS,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: SLIDE_MS,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (currentRef.current) dismiss(currentRef.current.id);
      currentRef.current = null;
      setCurrent(null);
      slideY.setValue(300);
      opacity.setValue(0);
      progress.setValue(1);
    });
  }

  useEffect(() => {
    if (!next || currentRef.current) return;
    currentRef.current = next;
    setCurrent(next);
    gameSounds.play("dayAdvance");
    progress.setValue(1);

    Animated.parallel([
      Animated.spring(slideY, {
        toValue: 0,
        friction: 9,
        tension: 70,
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

  const nwDelta = netWorth - prevNetWorth;
  const netColor = net >= 0 ? GREEN : RED;
  const allMissions = missionsToday === missionsTotal && missionsTotal > 0;

  return (
    <Animated.View
      style={[s.wrap, { bottom, opacity, transform: [{ translateY: slideY }] }]}
    >
      <TouchableOpacity
        style={s.card}
        onPress={dismissCurrent}
        activeOpacity={0.95}
      >
        {/* Header */}
        <View style={s.header}>
          <View style={s.dayBadge}>
            <Text style={s.dayLabel}>DAY {day} COMPLETE</Text>
          </View>
          <Ionicons name="close" size={14} color={Colors.dim} />
        </View>

        <View style={s.divider} />

        {/* Revenue rows */}
        <Row
          icon="airplane-outline"
          label="Revenue"
          value={revenue > 0 ? `+${fmtCash(revenue)}` : "$0"}
          valueColor={revenue > 0 ? GREEN : Colors.dim}
        />
        {interest > 0 && (
          <Row
            icon="card-outline"
            label="Loan interest"
            value={`-${fmtCash(interest)}`}
            valueColor={RED}
          />
        )}

        {/* Net separator */}
        <View style={s.netRow}>
          <Text style={s.netLabel}>Net</Text>
          <Text style={[s.netValue, { color: netColor }]}>
            {net >= 0 ? "+" : ""}
            {fmtCash(net)}
          </Text>
        </View>

        <View style={s.divider} />

        {/* Stats */}
        <Row
          icon="people-outline"
          label="Passengers"
          value={paxToday > 0 ? paxToday.toLocaleString() : "—"}
          valueColor={paxToday > 0 ? Colors.text : Colors.dim}
        />
        <Row
          icon="flag-outline"
          label="Missions"
          value={
            missionsTotal > 0
              ? `${missionsToday}/${missionsTotal}${allMissions ? " ✓" : ""}`
              : "—"
          }
          valueColor={allMissions ? GREEN : Colors.text}
        />
        <Row
          icon="trending-up-outline"
          label="Net worth"
          value={fmtCash(netWorth)}
          valueColor={Colors.text}
          sub={<DeltaBadge value={nwDelta} />}
        />

        {/* Progress bar */}
        <Animated.View
          style={[
            s.progress,
            {
              width: progress.interpolate({
                inputRange: [0, 1],
                outputRange: ["0%", "100%"],
              }),
              backgroundColor: net >= 0 ? GREEN : Colors.amber,
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
    zIndex: 55,
  },
  card: {
    backgroundColor: "rgba(8,15,30,0.98)",
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md + 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  dayBadge: {
    backgroundColor: Colors.sky + "15",
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.sky + "33",
  },
  dayLabel: {
    fontSize: 10,
    color: Colors.sky,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: Spacing.xs,
  },
  netRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  netLabel: { fontSize: 12, color: Colors.muted, fontWeight: "600" },
  netValue: { fontSize: 16, fontWeight: "700" },
  progress: { position: "absolute", bottom: 0, left: 0, height: 3 },
});
