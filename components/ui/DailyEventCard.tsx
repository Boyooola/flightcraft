/**
 * components/ui/DailyEventCard.tsx
 *
 * WorldWide Rush-style daily event card.
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

const HOLD_MS = 3600;
const SLIDE_MS = 220;

const TYPE_COLOR = {
  positive: "#22c55e",
  negative: "#ef4444",
  neutral: "#94a3b8",
};

export default function DailyEventCard() {
  const insets = useSafeAreaInsets();
  const dailyEvent = useDailyEvent();
  const setDailyEvent = useGameStore((s) => s.setDailyEvent);

  const slideY = useRef(new Animated.Value(-90)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;
  const progress = useRef(new Animated.Value(1)).current;

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progAnim = useRef<Animated.CompositeAnimation | null>(null);
  const [shown, setShown] = useState(false);

  const top = insets.top + 64 + Spacing.sm;

  const dismiss = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (progAnim.current) progAnim.current.stop();

    Animated.parallel([
      Animated.timing(slideY, {
        toValue: -90,
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
      slideY.setValue(-90);
      opacity.setValue(0);
      scale.setValue(0.96);
      progress.setValue(1);
    });
  };

  useEffect(() => {
    if (!dailyEvent || shown) return;

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
  }, [dailyEvent?.id]);

  if (!dailyEvent || !shown) return null;

  const color = TYPE_COLOR[dailyEvent.type];

  const label =
    dailyEvent.type === "positive"
      ? "RUSH BOOST"
      : dailyEvent.type === "negative"
        ? "ROUTE TROUBLE"
        : "MAP UPDATE";

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
        activeOpacity={0.93}
      >
        <View style={[s.iconWrap, { backgroundColor: color + "18" }]}>
          <Ionicons name={dailyEvent.icon as any} size={17} color={color} />
        </View>

        <View style={s.body}>
          <Text style={[s.label, { color }]}>{label}</Text>
          <Text style={s.title} numberOfLines={1}>
            {dailyEvent.title}
          </Text>
          <Text style={s.effect} numberOfLines={1}>
            {dailyEvent.effect}
          </Text>
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
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(8,15,30,0.98)",
    borderRadius: Radius.xl,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.42,
    shadowRadius: 12,
    elevation: 9,
    overflow: "hidden",
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  label: {
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 2,
  },
  title: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: "900",
  },
  effect: {
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
