/**
 * components/ui/AwayEarningsCard.tsx
 *
 * Shown when player returns to the app after being away.
 * Slides up from bottom, shows days elapsed + earnings/loss.
 * Dismisses after 6s or on tap.
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import { fmtCash } from "@/lib/revenue";
import { useAirline, useAwayEarnings, useGameStore } from "@/store";
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

export default function AwayEarningsCard() {
  const insets = useSafeAreaInsets();
  const awayEarnings = useAwayEarnings();
  const airline = useAirline();
  const setAway = useGameStore((s) => s.setAwayEarnings);

  const slideY = useRef(new Animated.Value(300)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(1)).current;
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progAnim = useRef<Animated.CompositeAnimation | null>(null);
  const [shown, setShown] = useState(false);

  const bottom = insets.bottom + TAB_H + Spacing.sm;
  const color = airline?.color ?? Colors.sky;
  const isGain = (awayEarnings?.amount ?? 0) >= 0;
  const accent = isGain ? "#22c55e" : "#ef4444";

  function dismiss() {
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
      setShown(false);
      setAway(null);
      slideY.setValue(300);
      opacity.setValue(0);
      progress.setValue(1);
    });
  }

  useEffect(() => {
    if (!awayEarnings || shown) return;
    setShown(true);

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

    holdTimer.current = setTimeout(dismiss, HOLD_MS);
  }, [awayEarnings]);

  if (!awayEarnings || !shown) return null;

  const { days, amount } = awayEarnings;

  return (
    <Animated.View
      style={[s.wrap, { bottom, opacity, transform: [{ translateY: slideY }] }]}
    >
      <TouchableOpacity
        style={[s.card, { borderColor: color + "44" }]}
        onPress={dismiss}
        activeOpacity={0.95}
      >
        {/* Icon + header */}
        <View style={s.header}>
          <View style={[s.iconWrap, { backgroundColor: color + "18" }]}>
            <Ionicons name="airplane" size={20} color={color} />
          </View>
          <View style={s.headerText}>
            <Text style={[s.welcome, { color }]}>Welcome back!</Text>
            <Text style={s.subtitle}>
              {days} game-day{days !== 1 ? "s" : ""} passed while you were away
            </Text>
          </View>
          <Ionicons name="close" size={14} color={Colors.dim} />
        </View>

        <View style={s.divider} />

        {/* Earnings row */}
        <View style={s.earningsRow}>
          <View style={s.earningsLeft}>
            <Ionicons
              name={isGain ? "trending-up-outline" : "trending-down-outline"}
              size={16}
              color={accent}
            />
            <Text style={s.earningsLabel}>
              {isGain ? "Revenue earned" : "Net loss"}
            </Text>
          </View>
          <Text style={[s.earningsAmount, { color: accent }]}>
            {isGain ? "+" : "-"}
            {fmtCash(Math.abs(amount))}
          </Text>
        </View>

        {/* Days detail */}
        <View style={s.detailRow}>
          <Ionicons name="time-outline" size={12} color={Colors.dim} />
          <Text style={s.detailTxt}>
            {days} day{days !== 1 ? "s" : ""} × ~
            {fmtCash(Math.abs(Math.round(amount / Math.max(1, days))))} per day
          </Text>
        </View>

        {/* Tap hint */}
        <Text style={s.tapHint}>Tap anywhere to dismiss</Text>

        {/* Progress bar */}
        <Animated.View
          style={[
            s.progress,
            {
              backgroundColor: color,
              width: progress.interpolate({
                inputRange: [0, 1],
                outputRange: ["0%", "100%"],
              }),
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
    zIndex: 70, // above everything except modals
  },
  card: {
    backgroundColor: "rgba(8,15,30,0.98)",
    borderRadius: Radius.xl,
    borderWidth: 1,
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
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headerText: { flex: 1, gap: 2 },
  welcome: { fontSize: 15, fontWeight: "700" },
  subtitle: { fontSize: 11, color: Colors.muted },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginBottom: Spacing.sm,
  },

  earningsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  earningsLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  earningsLabel: { fontSize: 13, color: Colors.text, fontWeight: "600" },
  earningsAmount: { fontSize: 22, fontWeight: "700" },

  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: Spacing.sm,
  },
  detailTxt: { fontSize: 10, color: Colors.dim },

  tapHint: {
    fontSize: 9,
    color: Colors.dim,
    textAlign: "center",
    opacity: 0.6,
  },
  progress: { position: "absolute", bottom: 0, left: 0, height: 3 },
});
