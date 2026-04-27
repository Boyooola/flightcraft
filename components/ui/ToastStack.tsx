/**
 * components/ui/ToastStack.tsx
 *
 * Single toast queue — one at a time, never stacking.
 * Each toast shows for 4s with an animated progress bar.
 * When dismissed, next in queue slides up immediately.
 *
 * Priority order: achievement > mission > revenue > unlock > warning
 * Hidden when any bottom sheet is open.
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import type {
  AchievementToastData,
  MissionToastData,
  RevenueToastData,
  ToastData,
} from "@/hooks/useToast";
import { useToastListener } from "@/hooks/useToast";
import { fmtCash } from "@/lib/revenue";
import { useActiveSheet, useGameStore } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TAB_H = 72;
const HOLD_MS = 4000;
const SLIDE_MS = 240;
const GOLD = "#F59E0B";
const PURPLE = "#a78bfa";
const GREEN = "#22c55e";

// Priority — lower index = show first
const TYPE_PRIORITY: Record<string, number> = {
  achievement: 0,
  mission: 1,
  revenue: 2,
  unlock: 3,
  warning: 4,
};

function toastAccent(t: ToastData): string {
  if (t.type === "achievement") return PURPLE;
  if (t.type === "mission") return GREEN;
  if (t.type === "unlock") return GOLD;
  if (t.type === "warning") return Colors.red;
  return Colors.sky; // revenue
}

function toastIcon(t: ToastData): string {
  if (t.type === "achievement") return (t as AchievementToastData).icon;
  if (t.type === "mission") return "checkmark-circle";
  if (t.type === "unlock") return "airplane-outline";
  if (t.type === "warning") return "warning-outline";
  return "cash-outline";
}

function toastLabel(t: ToastData): string {
  if (t.type === "achievement") return "ACHIEVEMENT";
  if (t.type === "mission") return "MISSION COMPLETE";
  if (t.type === "unlock") return "UNLOCKED";
  if (t.type === "warning") return "NOTICE";
  return "DAILY REVENUE";
}

function toastTitle(t: ToastData): string {
  if (t.type === "achievement") return (t as AchievementToastData).title;
  if (t.type === "mission") return (t as MissionToastData).title;
  if (t.type === "unlock") return `${(t as any).nickname} available`;
  if (t.type === "warning") return (t as any).message ?? "Notice";
  // revenue
  const r = t as RevenueToastData;
  return `${fmtCash(r.revenue)} · Day ${r.day}`;
}

function toastSub(t: ToastData): string | null {
  if (t.type === "achievement") return (t as AchievementToastData).flavor;
  if (t.type === "mission")
    return `+${fmtCash((t as MissionToastData).reward)} earned`;
  if (t.type === "revenue") {
    const r = t as RevenueToastData;
    const netSign = r.net >= 0 ? "+" : "";
    return `${netSign}${fmtCash(r.net)} net · ${r.paxToday.toLocaleString()} pax`;
  }
  return null;
}

function toastOnPress(t: ToastData, openSheet: (s: any) => void) {
  if (t.type === "achievement") openSheet("achievements");
  if (t.type === "mission") openSheet("missions");
}

export default function ToastStack() {
  const insets = useSafeAreaInsets();
  const activeSheet = useActiveSheet();
  const openSheet = useGameStore((s) => s.openSheet);
  const { queue, dismiss } = useToastListener();

  // Current toast being shown
  const [current, setCurrent] = useState<ToastData | null>(null);
  const currentRef = useRef<ToastData | null>(null);

  // Animations
  const slideY = useRef(new Animated.Value(100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(1)).current; // 1 = full, 0 = empty
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progAnim = useRef<Animated.CompositeAnimation | null>(null);

  const bottom = insets.bottom + TAB_H + Spacing.md;

  // Sort queue by priority
  const sortedQueue = [...queue].sort(
    (a, b) => (TYPE_PRIORITY[a.type] ?? 9) - (TYPE_PRIORITY[b.type] ?? 9),
  );

  const dismissCurrent = useCallback(
    (id?: string) => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
      if (progAnim.current) progAnim.current.stop();

      Animated.parallel([
        Animated.timing(slideY, {
          toValue: 100,
          duration: SLIDE_MS,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: SLIDE_MS,
          useNativeDriver: true,
        }),
      ]).start(() => {
        const toRemove = id ?? currentRef.current?.id;
        if (toRemove) dismiss(toRemove);
        currentRef.current = null;
        setCurrent(null);
        // Reset for next
        slideY.setValue(100);
        opacity.setValue(0);
        progress.setValue(1);
      });
    },
    [dismiss],
  );

  const showToast = useCallback(
    (toast: ToastData) => {
      currentRef.current = toast;
      setCurrent(toast);
      progress.setValue(1);

      Animated.parallel([
        Animated.spring(slideY, {
          toValue: 0,
          friction: 8,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: SLIDE_MS,
          useNativeDriver: true,
        }),
      ]).start();

      // Progress bar drains over HOLD_MS
      progAnim.current = Animated.timing(progress, {
        toValue: 0,
        duration: HOLD_MS,
        useNativeDriver: false,
      });
      progAnim.current.start();

      holdTimer.current = setTimeout(() => dismissCurrent(toast.id), HOLD_MS);
    },
    [dismissCurrent],
  );

  // Show next toast when queue changes and nothing is showing
  useEffect(() => {
    if (activeSheet) return; // don't show behind sheets
    if (currentRef.current) return; // already showing one
    if (sortedQueue.length === 0) return;
    showToast(sortedQueue[0]);
  }, [sortedQueue.length, activeSheet]);

  // When sheet opens, dismiss current toast (will re-queue for later)
  useEffect(() => {
    if (activeSheet && currentRef.current) {
      dismissCurrent();
    }
  }, [activeSheet]);

  if (!current || activeSheet) return null;

  const accent = toastAccent(current);
  const sub = toastSub(current);

  return (
    <Animated.View
      style={[s.wrap, { bottom, opacity, transform: [{ translateY: slideY }] }]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        style={[s.card, { borderColor: accent + "55" }]}
        onPress={() => {
          toastOnPress(current, openSheet);
          dismissCurrent(current.id);
        }}
        activeOpacity={0.9}
      >
        {/* Icon */}
        <View style={[s.iconWrap, { backgroundColor: accent + "18" }]}>
          <Ionicons name={toastIcon(current) as any} size={18} color={accent} />
        </View>

        {/* Content */}
        <View style={s.body}>
          <Text style={[s.label, { color: accent }]}>
            {toastLabel(current)}
          </Text>
          <Text style={s.title} numberOfLines={1}>
            {toastTitle(current)}
          </Text>
          {sub && (
            <Text style={s.sub} numberOfLines={1}>
              {sub}
            </Text>
          )}
        </View>

        {/* Dismiss */}
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation();
            dismissCurrent(current.id);
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={14} color={Colors.dim} />
        </TouchableOpacity>

        {/* Progress bar */}
        <Animated.View
          style={[
            s.progressBar,
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
    zIndex: 60,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(8,15,30,0.97)",
    borderRadius: Radius.xl,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm + 2,
    paddingBottom: Spacing.sm + 6, // extra room for progress bar
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 9,
    overflow: "hidden",
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  body: { flex: 1, gap: 1, minWidth: 0 },
  label: { fontSize: 7, fontWeight: "700", letterSpacing: 2 },
  title: { fontSize: 13, color: Colors.text, fontWeight: "700" },
  sub: { fontSize: 10, color: Colors.dim },
  progressBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    height: 3,
    borderRadius: 0,
  },
});
