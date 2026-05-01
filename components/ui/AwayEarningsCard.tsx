/**
 * components/ui/AwayEarningsCard.tsx
 *
 * WorldWide Rush-style away earnings card.
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import { fmtCash } from "@/lib/revenue";
import { useAwayEarnings, useGameStore } from "@/store";
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
const SLIDE_MS = 220;

export default function AwayEarningsCard() {
  const insets = useSafeAreaInsets();
  const awayEarnings = useAwayEarnings();
  const setAway = useGameStore((s) => s.setAwayEarnings);

  const slideY = useRef(new Animated.Value(260)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;
  const progress = useRef(new Animated.Value(1)).current;

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progAnim = useRef<Animated.CompositeAnimation | null>(null);
  const [shown, setShown] = useState(false);

  const bottom = insets.bottom + TAB_H + Spacing.sm;

  const dismiss = () => {
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
      setShown(false);
      setAway(null);
      slideY.setValue(260);
      opacity.setValue(0);
      scale.setValue(0.96);
      progress.setValue(1);
    });
  };

  useEffect(() => {
    if (!awayEarnings || shown) return;

    setShown(true);

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
    holdTimer.current = setTimeout(dismiss, HOLD_MS);
  }, [awayEarnings]);

  if (!awayEarnings || !shown) return null;

  const { days, amount } = awayEarnings;
  const isGain = amount >= 0;
  const accent = isGain ? "#22c55e" : "#ef4444";
  const perDay = Math.round(Math.abs(amount) / Math.max(1, days));

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
        style={[s.card, { borderColor: accent + "44" }]}
        onPress={dismiss}
        activeOpacity={0.94}
      >
        <View style={[s.icon, { backgroundColor: accent + "18" }]}>
          <Ionicons
            name={isGain ? "flash-outline" : "warning-outline"}
            size={20}
            color={accent}
          />
        </View>

        <View style={s.body}>
          <Text style={[s.label, { color: accent }]}>WELCOME BACK</Text>
          <Text style={[s.amount, { color: accent }]}>
            {isGain ? "+" : "-"}
            {fmtCash(Math.abs(amount))}
          </Text>
          <Text style={s.sub}>
            {days} day{days !== 1 ? "s" : ""} away · {fmtCash(perDay)}/day
          </Text>
        </View>

        <Ionicons name="close" size={14} color={Colors.dim} />

        <Animated.View
          style={[
            s.progress,
            {
              backgroundColor: accent,
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
    zIndex: 70,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(8,15,30,0.98)",
    borderRadius: Radius.xl,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 12,
    overflow: "hidden",
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.8,
  },
  amount: {
    fontSize: 23,
    fontWeight: "900",
    marginTop: 1,
  },
  sub: {
    fontSize: 10,
    color: Colors.dim,
    fontWeight: "700",
  },
  progress: {
    position: "absolute",
    bottom: 0,
    left: 0,
    height: 3,
  },
});
