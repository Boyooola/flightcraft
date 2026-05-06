/**
 * components/ui/ToastStack.tsx
 *
 * WorldWide Rush-style toast system.
 * - TYPE label above title for instant parse
 * - Sub-value on every toast type
 * - 85% width left-anchored pill (not full banner)
 * - Max 2 toasts visible stacked with offset
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import { gameSounds } from "@/hooks/useGameSounds";
import type {
  AchievementToastData,
  DaySummaryToastData,
  MissionToastData,
  ToastData,
  UnlockToastData,
  WarningToastData,
} from "@/hooks/useToast";
import { useToastListener } from "@/hooks/useToast";
import { fmtCash } from "@/lib/revenue";
import { useActiveSheet, useGameStore } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const HOLD_MS = 3400;
const SLIDE_MS = 180;
const MAX_VISIBLE = 1;

// ─────────────────────────────────────────────────────────────────
// PER-TYPE CONFIG
// ─────────────────────────────────────────────────────────────────

const PURPLE = "#a78bfa";
const GREEN = "#22c55e";
const GOLD = "#f59e0b";
const RED = Colors.red;
const SKY = Colors.sky;
const TEAL = "#14b8a6";

function cfg(t: ToastData): {
  color: string;
  icon: string;
  label: string;
  title: string;
  sub: string | null;
} {
  switch (t.type) {
    case "achievement": {
      const a = t as AchievementToastData;
      return {
        color: PURPLE,
        icon: a.icon ?? "star-outline",
        label: "ACHIEVEMENT",
        title: a.title,
        sub: a.flavor ?? null,
      };
    }
    case "mission": {
      const m = t as MissionToastData;
      return {
        color: GREEN,
        icon: m.icon ?? "checkmark-circle-outline",
        label: "MISSION CLEARED",
        title: m.title,
        sub: `+${fmtCash(m.reward)} reward`,
      };
    }
    case "unlock": {
      const u = t as UnlockToastData;
      return {
        color: GOLD,
        icon: "airplane-outline",
        label: "NEW PLANE",
        title: u.nickname,
        sub: `Now available in fleet`,
      };
    }
    case "warning": {
      const w = t as WarningToastData;
      return {
        color: w.level === "critical" ? RED : Colors.amber,
        icon: w.level === "critical" ? "warning" : "warning-outline",
        label: w.level === "critical" ? "CRITICAL" : "NOTICE",
        title: w.message,
        sub: `Cash: ${fmtCash(w.cash)}`,
      };
    }
    case "day-summary": {
      const d = t as DaySummaryToastData;
      const netPositive = d.net >= 0;
      const parts: string[] = [];
      if (d.paxToday > 0) parts.push(`${d.paxToday.toLocaleString()} pax`);
      if (d.aiStolenPax) parts.push(`${d.aiStolenPax.toLocaleString()} stolen`);
      if (d.crisisHubs)
        parts.push(`${d.crisisHubs} crisis hub${d.crisisHubs > 1 ? "s" : ""}`);
      return {
        color: netPositive ? TEAL : RED,
        icon: netPositive ? "trending-up-outline" : "trending-down-outline",
        label: `DAY ${d.day} SUMMARY`,
        title: `${netPositive ? "+" : ""}${fmtCash(d.net)} net`,
        sub: parts.join(" · ") || null,
      };
    }
    default:
      return {
        color: SKY,
        icon: "cash-outline",
        label: "REVENUE",
        title: fmtCash((t as any).revenue ?? 0),
        sub: null,
      };
  }
}

// ─────────────────────────────────────────────────────────────────
// SINGLE TOAST ITEM
// ─────────────────────────────────────────────────────────────────

interface ToastItemProps {
  toast: ToastData;
  stackIndex: number; // 0 = front, 1 = behind
  onDismiss: (id: string) => void;
  onPress: (t: ToastData) => void;
}

function ToastItem({ toast, stackIndex, onDismiss, onPress }: ToastItemProps) {
  const slideY = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;
  const progress = useRef(new Animated.Value(1)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progAnim = useRef<Animated.CompositeAnimation | null>(null);
  const mounted = useRef(true);

  const c = cfg(toast);

  const dismiss = useCallback(() => {
    if (!mounted.current) return;
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
        toValue: 0.94,
        duration: SLIDE_MS,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (mounted.current) onDismiss(toast.id);
    });
  }, [onDismiss, toast.id]);

  useEffect(() => {
    // Sounds
    if (toast.type === "achievement") gameSounds.play("achievement");
    else if (toast.type === "mission") gameSounds.play("missionComplete");

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
        toValue: stackIndex === 0 ? 1 : 0.55,
        duration: SLIDE_MS,
        useNativeDriver: true,
      }),
    ]).start();

    if (stackIndex === 0) {
      progAnim.current = Animated.timing(progress, {
        toValue: 0,
        duration: HOLD_MS,
        useNativeDriver: false,
      });
      progAnim.current.start();
      timer.current = setTimeout(dismiss, HOLD_MS);
    }

    return () => {
      mounted.current = false;
    };
  }, []);

  // When promoted to front (stackIndex 0→0 after front dismisses)
  useEffect(() => {
    if (stackIndex === 0) {
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
      progress.setValue(1);
      progAnim.current = Animated.timing(progress, {
        toValue: 0,
        duration: HOLD_MS,
        useNativeDriver: false,
      });
      progAnim.current.start();
      timer.current = setTimeout(dismiss, HOLD_MS);
    }
  }, [stackIndex]);

  // Stacked offset — back toast peeks above
  const translateY = stackIndex === 0 ? 0 : -6;
  const scaleVal = stackIndex === 0 ? 1 : 0.96;

  return (
    <Animated.View
      style={[
        s.toastWrap,
        {
          opacity,
          transform: [
            {
              translateY: Animated.add(slideY, new Animated.Value(translateY)),
            },
            { scale: Animated.multiply(scale, new Animated.Value(scaleVal)) },
          ],
          zIndex: MAX_VISIBLE - stackIndex,
        },
      ]}
    >
      <TouchableOpacity
        style={[s.card, { borderColor: c.color + "55" }]}
        onPress={() => {
          onPress(toast);
          dismiss();
        }}
        activeOpacity={0.88}
      >
        {/* Icon */}
        <View style={[s.iconWrap, { backgroundColor: c.color + "18" }]}>
          <Ionicons name={c.icon as any} size={17} color={c.color} />
        </View>

        {/* Body */}
        <View style={s.body}>
          <Text style={[s.label, { color: c.color }]}>{c.label}</Text>
          <Text style={s.title} numberOfLines={1}>
            {c.title}
          </Text>
          {c.sub && (
            <Text style={s.sub} numberOfLines={1}>
              {c.sub}
            </Text>
          )}
        </View>

        {/* Dismiss */}
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation();
            dismiss();
          }}
          hitSlop={12}
          style={s.closeBtn}
        >
          <Ionicons name="close" size={13} color={Colors.dim} />
        </TouchableOpacity>

        {/* Progress bar */}
        {stackIndex === 0 && (
          <Animated.View
            style={[
              s.bar,
              {
                backgroundColor: c.color,
                width: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", "100%"],
                }),
              },
            ]}
          />
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────
// STACK
// ─────────────────────────────────────────────────────────────────

export default function ToastStack() {
  const insets = useRef(useSafeAreaInsets()).current;
  const activeSheet = useActiveSheet();
  const openSheet = useGameStore((s) => s.openSheet);
  const { queue, dismiss } = useToastListener();

  // Show max MAX_VISIBLE from the queue
  const visible = queue.slice(0, MAX_VISIBLE);
  const bottom = insets.bottom + 140 + Spacing.xxl;

  const handlePress = useCallback(
    (t: ToastData) => {
      if (t.type === "achievement") openSheet("achievements");
      if (t.type === "mission") openSheet("missions");
    },
    [openSheet],
  );

  if (activeSheet || visible.length === 0) return null;

  return (
    <View style={[s.wrap, { bottom }]} pointerEvents="box-none">
      {/* Render in reverse so front toast is on top */}
      {[...visible].reverse().map((toast, revIdx) => {
        const stackIndex = visible.length - 1 - revIdx;
        return (
          <ToastItem
            key={toast.id}
            toast={toast}
            stackIndex={stackIndex}
            onDismiss={dismiss}
            onPress={handlePress}
          />
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: "7.5%",
    right: "7.5%",
    zIndex: 60,
  },
  toastWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(4,9,15,0.97)",
    borderRadius: Radius.xl,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    overflow: "hidden",
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  body: {
    flex: 1,
    gap: 1,
  },
  label: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.6,
    opacity: 0.8,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.text,
    marginTop: 1,
  },
  sub: {
    fontSize: 11,
    color: Colors.muted,
    marginTop: 1,
  },
  closeBtn: {
    paddingLeft: 4,
    flexShrink: 0,
  },
  bar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    height: 3,
    borderRadius: 0,
  },
});
