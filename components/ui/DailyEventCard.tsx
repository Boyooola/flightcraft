/**
 * components/ui/DailyEventCard.tsx
 *
 * WorldWide Rush-style daily event card.
 *
 * Updated for the taller 2-row TopHUD and demand-wave events.
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import { useHudHeight } from "@/hooks/useSheetLayout";
import { useDailyEvent, useGameStore } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const HOLD_MS = 5200;
const SLIDE_MS = 240;

const TYPE_COLOR = {
  positive: "#22c55e",
  negative: "#ef4444",
  neutral: "#94a3b8",
};

export default function DailyEventCard() {
  const hudH = useHudHeight();
  const dailyEvent = useDailyEvent();
  const setDailyEvent = useGameStore((s) => s.setDailyEvent);

  const slideY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;
  const progress = useRef(new Animated.Value(1)).current;
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progAnim = useRef<Animated.CompositeAnimation | null>(null);
  const [shown, setShown] = useState(false);

  const top = hudH + Spacing.sm;

  function dismiss() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (progAnim.current) progAnim.current.stop();

    Animated.parallel([
      Animated.timing(slideY, {
        toValue: -120,
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
      setDailyEvent(null);
      slideY.setValue(-120);
      opacity.setValue(0);
      scale.setValue(0.96);
      progress.setValue(1);
    });
  }

  useEffect(() => {
    if (!dailyEvent || shown) return;
    setShown(true);

    Animated.parallel([
      Animated.spring(slideY, {
        toValue: 0,
        friction: 8,
        tension: 85,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 8,
        tension: 90,
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
  }, [dailyEvent?.id]);

  if (!dailyEvent || !shown) return null;

  const isWave = !!dailyEvent.waveKind;
  const color = isWave ? Colors.amber : TYPE_COLOR[dailyEvent.type];

  const label = isWave
    ? "DEMAND WAVE"
    : dailyEvent.type === "positive"
      ? "RUSH BOOST"
      : dailyEvent.type === "negative"
        ? "ROUTE TROUBLE"
        : "MAP UPDATE";

  const trendIcon = isWave
    ? "pulse-outline"
    : dailyEvent.type === "positive"
      ? "trending-up"
      : dailyEvent.type === "negative"
        ? "trending-down"
        : "remove-outline";

  return (
    <Animated.View
      style={[
        s.wrap,
        {
          top,
          opacity,
          transform: [{ translateY: slideY }, { scale }],
        },
      ]}
    >
      <TouchableOpacity
        style={[s.card, { borderColor: color + "55" }]}
        onPress={dismiss}
        activeOpacity={0.94}
      >
        <View style={[s.iconWrap, { backgroundColor: color + "18" }]}>
          <Ionicons name={dailyEvent.icon as any} size={18} color={color} />
        </View>

        <View style={s.body}>
          <View style={s.topLine}>
            <Text style={[s.typeLabel, { color }]}>{label}</Text>
            {isWave && dailyEvent.waveAffectedSlots !== undefined && (
              <Text style={[s.waveMeta, { color }]}>
                {dailyEvent.waveAffectedSlots} slot
                {dailyEvent.waveAffectedSlots === 1 ? "" : "s"}
              </Text>
            )}
          </View>

          <Text style={s.title} numberOfLines={1}>
            {dailyEvent.title}
          </Text>

          <Text style={s.desc} numberOfLines={2}>
            {dailyEvent.desc}
          </Text>

          <View
            style={[
              s.effectBadge,
              { backgroundColor: color + "12", borderColor: color + "33" },
            ]}
          >
            <Ionicons name={trendIcon as any} size={11} color={color} />
            <Text style={[s.effectTxt, { color }]}>{dailyEvent.effect}</Text>
          </View>
        </View>

        <Ionicons name="close" size={14} color={Colors.dim} />

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
    zIndex: 45,
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    backgroundColor: "rgba(8,15,30,0.98)",
    borderRadius: Radius.xl,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.42,
    shadowRadius: 12,
    elevation: 9,
    overflow: "hidden",
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  topLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  typeLabel: {
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 2,
  },
  waveMeta: {
    fontSize: 8,
    fontWeight: "900",
  },
  title: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: "900",
  },
  desc: {
    fontSize: 11,
    color: Colors.muted,
    lineHeight: 16,
  },
  effectBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 3,
    marginTop: 2,
  },
  effectTxt: {
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
