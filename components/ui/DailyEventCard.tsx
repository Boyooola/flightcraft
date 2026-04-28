/**
 * components/ui/DailyEventCard.tsx
 *
 * Shows the day's random event as a card on the map.
 * Slides up from below TopHUD when a new day starts.
 * Auto-dismisses after 5 seconds. Tap to dismiss early.
 * Positioned top-right below TopHUD so it doesn't block the map.
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import { useAirline, useDailyEvent, useGameStore } from "@/store";
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

const HOLD_MS = 5000;
const SLIDE_MS = 280;

const TYPE_COLOR = {
  positive: "#22c55e",
  negative: "#ef4444",
  neutral: "#94a3b8",
};

export default function DailyEventCard() {
  const insets = useSafeAreaInsets();
  const dailyEvent = useDailyEvent();
  const airline = useAirline();
  const setDailyEvent = useGameStore((s) => s.setDailyEvent);

  const slideY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(1)).current;
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progAnim = useRef<Animated.CompositeAnimation | null>(null);
  const [shown, setShown] = useState(false);

  const top = insets.top + 64 + Spacing.sm; // below TopHUD

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
    ]).start(() => {
      setShown(false);
      setDailyEvent(null);
      slideY.setValue(-120);
      opacity.setValue(0);
      progress.setValue(1);
    });
  }

  useEffect(() => {
    if (!dailyEvent || shown) return;
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
  }, [dailyEvent?.id]);

  if (!dailyEvent || !shown) return null;

  const color = TYPE_COLOR[dailyEvent.type];

  return (
    <Animated.View
      style={[s.wrap, { top, opacity, transform: [{ translateY: slideY }] }]}
    >
      <TouchableOpacity
        style={[s.card, { borderColor: color + "44" }]}
        onPress={dismiss}
        activeOpacity={0.95}
      >
        {/* Header */}
        <View style={s.header}>
          <View style={[s.iconWrap, { backgroundColor: color + "18" }]}>
            <Ionicons name={dailyEvent.icon as any} size={16} color={color} />
          </View>
          <View style={s.titleWrap}>
            <Text style={[s.typeLabel, { color }]}>
              {dailyEvent.type === "positive"
                ? "GOOD NEWS"
                : dailyEvent.type === "negative"
                  ? "HEADS UP"
                  : "NOTICE"}
            </Text>
            <Text style={s.title} numberOfLines={1}>
              {dailyEvent.title}
            </Text>
          </View>
          <Ionicons name="close" size={14} color={Colors.dim} />
        </View>

        {/* Description */}
        <Text style={s.desc} numberOfLines={2}>
          {dailyEvent.desc}
        </Text>

        {/* Effect badge */}
        <View
          style={[
            s.effectBadge,
            { backgroundColor: color + "12", borderColor: color + "33" },
          ]}
        >
          <Ionicons
            name={
              dailyEvent.type === "positive"
                ? "trending-up"
                : dailyEvent.type === "negative"
                  ? "trending-down"
                  : "remove-outline"
            }
            size={11}
            color={color}
          />
          <Text style={[s.effectTxt, { color }]}>{dailyEvent.effect}</Text>
        </View>

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
    zIndex: 45,
  },
  card: {
    backgroundColor: "rgba(8,15,30,0.97)",
    borderRadius: Radius.xl,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md + 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  titleWrap: { flex: 1, gap: 1 },
  typeLabel: { fontSize: 7, fontWeight: "700", letterSpacing: 2 },
  title: { fontSize: 13, color: Colors.text, fontWeight: "700" },
  desc: {
    fontSize: 11,
    color: Colors.muted,
    lineHeight: 16,
    marginBottom: Spacing.sm,
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
  },
  effectTxt: { fontSize: 10, fontWeight: "700" },
  progress: { position: "absolute", bottom: 0, left: 0, height: 3 },
});
