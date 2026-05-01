/**
 * components/ui/ToastStack.tsx
 *
 * WorldWide Rush-style toast system.
 * Fast, punchy, reward-focused.
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import { gameSounds } from "@/hooks/useGameSounds";
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

const HOLD_MS = 3200; // faster than before
const SLIDE_MS = 200;

const PURPLE = "#a78bfa";
const GREEN = "#22c55e";
const GOLD = "#F59E0B";

function accent(t: ToastData) {
  if (t.type === "achievement") return PURPLE;
  if (t.type === "mission") return GREEN;
  if (t.type === "unlock") return GOLD;
  if (t.type === "warning") return Colors.red;
  return Colors.sky;
}

function icon(t: ToastData) {
  if (t.type === "achievement") return (t as AchievementToastData).icon;
  if (t.type === "mission") return "checkmark";
  if (t.type === "unlock") return "airplane-outline";
  if (t.type === "warning") return "warning-outline";
  return "cash-outline";
}

function title(t: ToastData) {
  if (t.type === "achievement") return (t as AchievementToastData).title;
  if (t.type === "mission") return "Mission Cleared";
  if (t.type === "unlock") return "New Plane";
  if (t.type === "warning") return "Notice";
  return "Revenue";
}

function value(t: ToastData) {
  if (t.type === "achievement") return null;
  if (t.type === "mission")
    return `+${fmtCash((t as MissionToastData).reward)}`;
  if (t.type === "revenue") {
    const r = t as RevenueToastData;
    return `${fmtCash(r.revenue)}`;
  }
  return null;
}

export default function ToastStack() {
  const insets = useSafeAreaInsets();
  const activeSheet = useActiveSheet();
  const openSheet = useGameStore((s) => s.openSheet);
  const { queue, dismiss } = useToastListener();

  const [current, setCurrent] = useState<ToastData | null>(null);
  const refCurrent = useRef<ToastData | null>(null);

  const slideY = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;

  const progress = useRef(new Animated.Value(1)).current;

  const timer = useRef<any>(null);
  const progAnim = useRef<any>(null);

  const bottom = insets.bottom + 80;

  const dismissNow = useCallback(
    (id?: string) => {
      if (timer.current) clearTimeout(timer.current);
      if (progAnim.current) progAnim.current.stop();

      Animated.parallel([
        Animated.timing(slideY, {
          toValue: 80,
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
        const removeId = id ?? refCurrent.current?.id;
        if (removeId) dismiss(removeId);
        refCurrent.current = null;
        setCurrent(null);
        progress.setValue(1);
      });
    },
    [dismiss],
  );

  const show = useCallback(
    (toast: ToastData) => {
      refCurrent.current = toast;
      setCurrent(toast);

      // Sound = instant feedback
      if (toast.type === "achievement") gameSounds.play("achievement");
      else if (toast.type === "mission") gameSounds.play("missionComplete");
      else if (toast.type === "revenue") {
        const net = (toast as any).net ?? 0;
        gameSounds.play(net >= 0 ? "revenuePositive" : "revenueNegative");
      }

      progress.setValue(1);

      Animated.parallel([
        Animated.spring(slideY, {
          toValue: 0,
          friction: 7,
          tension: 90,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 7,
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

      timer.current = setTimeout(() => dismissNow(toast.id), HOLD_MS);
    },
    [dismissNow],
  );

  useEffect(() => {
    if (activeSheet) return;
    if (refCurrent.current) return;
    if (queue.length === 0) return;
    show(queue[0]);
  }, [queue.length, activeSheet]);

  useEffect(() => {
    if (activeSheet && refCurrent.current) {
      dismissNow();
    }
  }, [activeSheet]);

  if (!current || activeSheet) return null;

  const a = accent(current);
  const val = value(current);

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
        style={[s.card, { borderColor: a + "55" }]}
        onPress={() => {
          if (current.type === "achievement") openSheet("achievements");
          if (current.type === "mission") openSheet("missions");
          dismissNow(current.id);
        }}
        activeOpacity={0.9}
      >
        <View style={[s.icon, { backgroundColor: a + "18" }]}>
          <Ionicons name={icon(current) as any} size={18} color={a} />
        </View>

        <View style={s.body}>
          <Text style={[s.title, { color: a }]}>{title(current)}</Text>
          {val && <Text style={s.value}>{val}</Text>}
        </View>

        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation();
            dismissNow(current.id);
          }}
        >
          <Ionicons name="close" size={14} color={Colors.dim} />
        </TouchableOpacity>

        <Animated.View
          style={[
            s.bar,
            {
              backgroundColor: a,
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
    backgroundColor: "rgba(8,15,30,0.98)",
    borderRadius: Radius.xl,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    overflow: "hidden",
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 12,
    fontWeight: "900",
  },
  value: {
    fontSize: 11,
    color: Colors.text,
    fontWeight: "700",
  },
  bar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    height: 3,
  },
});
