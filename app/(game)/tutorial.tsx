/**
 * app/(game)/tutorial.tsx
 *
 * 5-step tutorial reflecting the current UI:
 *   1. Buy a hub — tap airport dot
 *   2. Buy a plane — Fleet tab
 *   3. Create a route — FAB button or hub demand
 *   4. Watch revenue — speed controls
 *   5. Daily missions — earn bonus cash each day
 *
 * Map stays fully interactive throughout (pointerEvents="box-none").
 * No dark overlay, no spotlight. Just a floating card + hint pill.
 */

import { Colors, MIN_TOUCH, Radius, Spacing } from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { useAirline, useGameStore } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ─────────────────────────────────────────────────────────────────
// STEPS
// ─────────────────────────────────────────────────────────────────

const STEPS = [
  {
    id: "hub",
    icon: "location" as const,
    title: "Buy your first hub",
    body: "Tap any airport dot on the map. Start with a regional or domestic airport — cheaper and easier to grow from.",
    hint: "👆  Tap any airport dot",
    cardPos: "bottom" as const,
  },
  {
    id: "plane",
    icon: "airplane" as const,
    title: "Buy an aircraft",
    body: "Tap Fleet below. The CRJ-200 ($800K) is the best starter — affordable and reliable for short routes.",
    hint: "👇  Tap Fleet tab below",
    cardPos: "bottom" as const,
  },
  {
    id: "route",
    icon: "add-circle-outline" as const,
    title: "Create a route",
    body: "Tap the ✈ button (centre tab) to enter route creation. Tap your hub then a destination, then ↑ to assign a plane.",
    hint: "👇  Tap the ✈ button below",
    cardPos: "bottom" as const,
  },
  {
    id: "revenue",
    icon: "speedometer-outline" as const,
    title: "Earn revenue",
    body: "Revenue ticks live as planes land. Use 1× 2× 3× to control game speed. Watch the TODAY counter rise in real time.",
    hint: "☝️  Speed controls top right",
    cardPos: "bottom" as const,
  },
  {
    id: "missions",
    icon: "flag-outline" as const,
    title: "Daily missions",
    body: "Each day brings 3 missions for bonus cash. Tap the flag pill (top right of map) to check progress anytime.",
    hint: "🎯  Missions pill — top right",
    cardPos: "bottom" as const,
  },
];

// ─────────────────────────────────────────────────────────────────
// PROGRESS DOTS
// ─────────────────────────────────────────────────────────────────

function ProgressDots({
  idx,
  total,
  color,
}: {
  idx: number;
  total: number;
  color: string;
}) {
  return (
    <View style={pd.row}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            pd.dot,
            i === idx && { backgroundColor: color, width: 20 },
            i < idx && { backgroundColor: color, opacity: 0.4 },
          ]}
        />
      ))}
    </View>
  );
}
const pd = StyleSheet.create({
  row: { flexDirection: "row", gap: 5, alignItems: "center" },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.dim },
});

// ─────────────────────────────────────────────────────────────────
// TUTORIAL SCREEN
// ─────────────────────────────────────────────────────────────────

export default function TutorialScreen() {
  const insets = useSafeAreaInsets();
  const airline = useAirline();
  const setPhase = useGameStore((s) => s.setPhase);
  const haptics = useHaptics();

  const [idx, setIdx] = useState(0);
  const fadeY = useRef(new Animated.Value(0)).current;
  const fadeO = useRef(new Animated.Value(0)).current;

  const step = STEPS[idx];
  const color = airline?.color ?? Colors.sky;
  const isLast = idx === STEPS.length - 1;

  const topInset =
    Platform.OS === "android"
      ? (StatusBar.currentHeight ?? insets.top ?? 24)
      : insets.top;

  useEffect(() => {
    fadeO.setValue(0);
    fadeY.setValue(14);
    Animated.parallel([
      Animated.timing(fadeO, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.timing(fadeY, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start();
  }, [idx]);

  const next = () => {
    haptics.tap();
    if (isLast) {
      haptics.success();
      setPhase("playing");
    } else {
      setIdx((i) => i + 1);
    }
  };

  const skip = () => {
    haptics.tap();
    setPhase("playing");
  };

  const cardBottom = insets.bottom + 90 + Spacing.sm;

  return (
    <View
      style={[StyleSheet.absoluteFillObject, { zIndex: 150, elevation: 150 }]}
      pointerEvents="box-none"
    >
      {/* Tutorial card */}
      <Animated.View
        style={[
          s.card,
          { bottom: cardBottom, left: Spacing.lg, right: Spacing.lg },
          {
            borderColor: color + "33",
            opacity: fadeO,
            transform: [{ translateY: fadeY }],
          },
        ]}
        pointerEvents="box-none"
      >
        {/* Header */}
        <View style={s.hdr}>
          <View style={[s.iconBox, { backgroundColor: color + "1a" }]}>
            <Ionicons name={step.icon} size={20} color={color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.stepLbl}>
              STEP {idx + 1} OF {STEPS.length}
            </Text>
            <Text style={s.stepTitle}>{step.title}</Text>
          </View>
          <ProgressDots idx={idx} total={STEPS.length} color={color} />
        </View>

        {/* Body */}
        <Text style={s.body}>{step.body}</Text>

        {/* Actions */}
        <View style={s.actions}>
          <TouchableOpacity style={s.skipBtn} onPress={skip}>
            <Text style={s.skipTxt}>Skip tutorial</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.nextBtn, { backgroundColor: color }]}
            onPress={next}
            activeOpacity={0.85}
          >
            <Text style={s.nextTxt}>{isLast ? "Let's fly!" : "Got it"}</Text>
            <Ionicons
              name={isLast ? "rocket-outline" : "arrow-forward"}
              size={15}
              color={Colors.bg}
            />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    position: "absolute",
    backgroundColor: "rgba(8,15,30,0.96)",
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  hdr: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  stepLbl: {
    fontSize: 8,
    color: Colors.dim,
    letterSpacing: 2,
    marginBottom: 2,
  },
  stepTitle: { fontSize: 13, color: Colors.text, fontWeight: "700" },
  body: { fontSize: 11, color: Colors.muted, lineHeight: 17 },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  skipBtn: {
    minHeight: MIN_TOUCH,
    justifyContent: "center",
    paddingHorizontal: Spacing.sm,
  },
  skipTxt: { fontSize: 11, color: Colors.dim },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    minHeight: MIN_TOUCH,
  },
  nextTxt: {
    fontSize: 13,
    color: Colors.bg,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});
