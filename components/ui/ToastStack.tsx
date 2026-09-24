/**
 * Compact in-game notifications shown one at a time above the bottom bar.
 */

import {
  Colors,
  MIN_TOUCH,
  Palette,
  Radius,
  Shadow,
  Spacing,
  Typography,
} from "@/constants/theme";
import { gameSounds } from "@/hooks/useGameSounds";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import type {
  AchievementToastData,
  DaySummaryToastData,
  MissionToastData,
  RevenueToastData,
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

const HOLD_MS = 3400;
const SLIDE_MS = 180;

interface ToastPresentation {
  color: string;
  surface: string;
  icon: string;
  label: string;
  title: string;
  detail: string | null;
}

function presentation(toast: ToastData): ToastPresentation {
  switch (toast.type) {
    case "achievement": {
      const achievement = toast as AchievementToastData;
      return {
        color: Colors.purple,
        surface: Palette.violetSoft,
        icon: achievement.icon ?? "star-outline",
        label: "ACHIEVEMENT UNLOCKED",
        title: achievement.title,
        detail: `+${achievement.points} pts · ${achievement.flavor}`,
      };
    }

    case "mission": {
      const mission = toast as MissionToastData;
      return {
        color: Colors.green,
        surface: Palette.greenSoft,
        icon: mission.icon ?? "checkmark-circle-outline",
        label: "MISSION CLEARED",
        title: mission.title,
        detail: `+${fmtCash(mission.reward)} reward`,
      };
    }

    case "unlock": {
      const unlock = toast as UnlockToastData;
      return {
        color: Colors.amber,
        surface: Palette.orangeSoft,
        icon: "airplane-outline",
        label: "AIRCRAFT UNLOCKED",
        title: unlock.nickname,
        detail: `${unlock.family} · From ${fmtCash(unlock.price)}`,
      };
    }

    case "warning": {
      const warning = toast as WarningToastData;
      const critical = warning.level === "critical";
      return {
        color: critical ? Colors.red : Colors.amber,
        surface: critical ? Palette.redSoft : Palette.orangeSoft,
        icon: critical ? "warning" : "warning-outline",
        label: critical ? "CRITICAL WARNING" : "OPERATIONS NOTICE",
        title: warning.message,
        detail: `Available cash: ${fmtCash(warning.cash)}`,
      };
    }

    case "day-summary": {
      const summary = toast as DaySummaryToastData;
      const positive = summary.net >= 0;
      const details: string[] = [];

      if (summary.paxToday > 0) {
        details.push(`${summary.paxToday.toLocaleString()} pax`);
      }
      if (summary.aiStolenPax) {
        details.push(`${summary.aiStolenPax.toLocaleString()} lost to rivals`);
      }
      if (summary.crisisHubs) {
        details.push(
          `${summary.crisisHubs} crisis hub${summary.crisisHubs === 1 ? "" : "s"}`,
        );
      }

      return {
        color: positive ? Colors.green : Colors.red,
        surface: positive ? Palette.greenSoft : Palette.redSoft,
        icon: positive ? "trending-up-outline" : "trending-down-outline",
        label: `DAY ${summary.day} COMPLETE`,
        title: `${positive ? "+" : ""}${fmtCash(summary.net)} net`,
        detail: details.join(" · ") || null,
      };
    }

    case "revenue": {
      const revenue = toast as RevenueToastData;
      const positive = revenue.net >= 0;
      const details = [
        `${revenue.routes} route${revenue.routes === 1 ? "" : "s"}`,
        `${revenue.paxToday.toLocaleString()} pax`,
      ];

      if (revenue.interest > 0) {
        details.push(`${fmtCash(revenue.interest)} interest`);
      }

      return {
        color: positive ? Colors.green : Colors.red,
        surface: positive ? Palette.greenSoft : Palette.redSoft,
        icon: positive ? "cash-outline" : "trending-down-outline",
        label: `DAY ${revenue.day} REVENUE`,
        title: `${positive ? "+" : ""}${fmtCash(revenue.net)} net`,
        detail: details.join(" · "),
      };
    }
  }
}

function opensDetail(toast: ToastData) {
  return toast.type === "achievement" || toast.type === "mission";
}

interface ToastItemProps {
  toast: ToastData;
  queuedCount: number;
  onDismiss: (id: string) => void;
  onPress: (toast: ToastData) => void;
}

function ToastItem({ toast, queuedCount, onDismiss, onPress }: ToastItemProps) {
  const translateY = useRef(new Animated.Value(42)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.98)).current;
  const progress = useRef(new Animated.Value(1)).current;
  const holdAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const enterAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const mountedRef = useRef(true);
  const dismissingRef = useRef(false);

  const appearance = presentation(toast);
  const canOpen = opensDetail(toast);

  const dismiss = useCallback(() => {
    if (!mountedRef.current || dismissingRef.current) return;
    dismissingRef.current = true;
    holdAnimation.current?.stop();

    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 36,
        duration: SLIDE_MS,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: SLIDE_MS,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.98,
        duration: SLIDE_MS,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished && mountedRef.current) onDismiss(toast.id);
    });
  }, [onDismiss, opacity, scale, toast.id, translateY]);

  useEffect(() => {
    if (toast.type === "achievement") gameSounds.play("achievement");
    if (toast.type === "mission") gameSounds.play("missionComplete");

    enterAnimation.current = Animated.parallel([
      Animated.spring(translateY, {
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
    ]);
    enterAnimation.current.start();

    holdAnimation.current = Animated.timing(progress, {
      toValue: 0,
      duration: HOLD_MS,
      useNativeDriver: false,
    });
    holdAnimation.current.start(({ finished }) => {
      if (finished) dismiss();
    });

    return () => {
      mountedRef.current = false;
      enterAnimation.current?.stop();
      holdAnimation.current?.stop();
    };
  }, [dismiss, opacity, progress, scale, toast.type, translateY]);

  const handlePress = () => {
    onPress(toast);
    dismiss();
  };

  return (
    <Animated.View
      style={[
        styles.toastContainer,
        {
          opacity,
          transform: [{ translateY }, { scale }],
        },
      ]}
    >
      <TouchableOpacity
        accessibilityLabel={`${appearance.label}: ${appearance.title}`}
        accessibilityHint={
          canOpen ? "Opens more details" : "Dismisses notification"
        }
        accessibilityRole="button"
        style={[styles.card, { borderLeftColor: appearance.color }]}
        onPress={handlePress}
        activeOpacity={0.88}
      >
        <View style={[styles.icon, { backgroundColor: appearance.surface }]}>
          <Ionicons
            name={appearance.icon as any}
            size={19}
            color={appearance.color}
          />
        </View>

        <View style={styles.body}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, { color: appearance.color }]}>
              {appearance.label}
            </Text>
            {queuedCount > 0 && (
              <View style={styles.queueBadge}>
                <Text style={styles.queueText}>+{queuedCount}</Text>
              </View>
            )}
          </View>

          <Text style={styles.title} numberOfLines={1}>
            {appearance.title}
          </Text>
          {appearance.detail && (
            <Text style={styles.detail} numberOfLines={1}>
              {appearance.detail}
            </Text>
          )}
        </View>

        {canOpen ? (
          <Ionicons name="chevron-forward" size={17} color={appearance.color} />
        ) : (
          <TouchableOpacity
            accessibilityLabel="Dismiss notification"
            accessibilityRole="button"
            hitSlop={8}
            style={styles.closeButton}
            onPress={(event) => {
              event.stopPropagation();
              dismiss();
            }}
          >
            <Ionicons name="close" size={16} color={Colors.muted} />
          </TouchableOpacity>
        )}

        <Animated.View
          style={[
            styles.progressTrack,
            {
              width: progress.interpolate({
                inputRange: [0, 1],
                outputRange: ["0%", "100%"],
              }),
            },
          ]}
        >
          <View
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: appearance.color },
            ]}
          />
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function ToastStack() {
  const activeSheet = useActiveSheet();
  const openSheet = useGameStore((state) => state.openSheet);
  const tabBarHeight = useTabBarHeight();
  const { queue, dismiss } = useToastListener();

  const toast = queue[0];
  const bottom = tabBarHeight + Spacing.xxxl * 2;

  const handlePress = useCallback(
    (pressedToast: ToastData) => {
      if (pressedToast.type === "achievement") openSheet("achievements");
      if (pressedToast.type === "mission") openSheet("missions");
    },
    [openSheet],
  );

  if (activeSheet || !toast) return null;

  return (
    <View style={[styles.stack, { bottom }]} pointerEvents="box-none">
      <ToastItem
        key={toast.id}
        toast={toast}
        queuedCount={Math.max(0, queue.length - 1)}
        onDismiss={dismiss}
        onPress={handlePress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 60,
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
  },
  toastContainer: {
    width: "100%",
    maxWidth: 520,
  },
  card: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.panel,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 5,
    paddingLeft: Spacing.md,
    paddingRight: Spacing.sm,
    paddingVertical: Spacing.sm,
    overflow: "hidden",
    ...Shadow.floating,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  label: {
    flexShrink: 1,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: Typography.weight.bold,
    letterSpacing: 0.9,
  },
  queueBadge: {
    backgroundColor: Colors.inset,
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  queueText: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: 7,
    fontWeight: Typography.weight.bold,
  },
  title: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: Typography.weight.bold,
    marginTop: Spacing.xxs,
  },
  detail: {
    color: Colors.muted,
    fontSize: 10,
    lineHeight: 14,
    marginTop: Spacing.xxs,
  },
  closeButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  progressTrack: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: 3,
    overflow: "hidden",
  },
});
