/**
 * One restrained operational notice at a time above the bottom navigation.
 */

import {
  Colors,
  MIN_TOUCH,
  Radius,
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

const HOLD_MS = 4_200;
const FADE_MS = 120;

type IconName = keyof typeof Ionicons.glyphMap;

interface ToastPresentation {
  color: string;
  icon: IconName;
  label: string;
  title: string;
  detail: string | null;
}

function presentation(toast: ToastData): ToastPresentation {
  switch (toast.type) {
    case "achievement": {
      const achievement = toast as AchievementToastData;
      return {
        color: Colors.skyDark,
        icon: (achievement.icon as IconName) ?? "star-outline",
        label: "Achievement unlocked",
        title: achievement.title,
        detail: `${achievement.points} points · ${achievement.flavor}`,
      };
    }

    case "mission": {
      const mission = toast as MissionToastData;
      return {
        color: Colors.green,
        icon: (mission.icon as IconName) ?? "checkmark-circle-outline",
        label: "Mission complete",
        title: mission.title,
        detail: `${fmtCash(mission.reward)} reward paid`,
      };
    }

    case "unlock": {
      const unlock = toast as UnlockToastData;
      return {
        color: Colors.skyDark,
        icon: "airplane-outline",
        label: "Aircraft available",
        title: unlock.nickname,
        detail: `${unlock.family} · Price from ${fmtCash(unlock.price)}`,
      };
    }

    case "warning": {
      const warning = toast as WarningToastData;
      const critical = warning.level === "critical";
      return {
        color: critical ? Colors.red : Colors.amber,
        icon: critical ? "warning" : "warning-outline",
        label: critical ? "Critical warning" : "Operations notice",
        title: warning.message,
        detail: `Available cash: ${fmtCash(warning.cash)}`,
      };
    }

    case "day-summary": {
      const summary = toast as DaySummaryToastData;
      const positive = summary.net >= 0;
      const details: string[] = [];

      if (summary.paxToday > 0) {
        details.push(`${summary.paxToday.toLocaleString()} passengers`);
      }
      if (summary.aiStolenPax) {
        details.push(`${summary.aiStolenPax.toLocaleString()} chose rivals`);
      }
      if (summary.crisisHubs) {
        details.push(
          `${summary.crisisHubs} crisis ${summary.crisisHubs === 1 ? "hub" : "hubs"}`,
        );
      }

      return {
        color: positive ? Colors.green : Colors.red,
        icon: positive ? "trending-up-outline" : "trending-down-outline",
        label: `Day ${summary.day} complete`,
        title: `${positive ? "+" : ""}${fmtCash(summary.net)} net`,
        detail: details.join(" · ") || null,
      };
    }

    case "revenue": {
      const revenue = toast as RevenueToastData;
      const positive = revenue.net >= 0;
      const details = [
        `${revenue.routes} ${revenue.routes === 1 ? "route" : "routes"}`,
        `${revenue.paxToday.toLocaleString()} passengers`,
      ];

      if (revenue.interest > 0) {
        details.push(`${fmtCash(revenue.interest)} interest`);
      }

      return {
        color: positive ? Colors.green : Colors.red,
        icon: positive ? "cash-outline" : "trending-down-outline",
        label: `Day ${revenue.day} result`,
        title: `${positive ? "+" : ""}${fmtCash(revenue.net)} net`,
        detail: details.join(" · "),
      };
    }
  }
}

function opensDetail(toast: ToastData): boolean {
  return toast.type === "achievement" || toast.type === "mission";
}

interface ToastItemProps {
  toast: ToastData;
  queuedCount: number;
  onDismiss: (id: string) => void;
  onPress: (toast: ToastData) => void;
}

function ToastItem({ toast, queuedCount, onDismiss, onPress }: ToastItemProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const dismissingRef = useRef(false);

  const appearance = presentation(toast);
  const canOpen = opensDetail(toast);

  const dismiss = useCallback(() => {
    if (!mountedRef.current || dismissingRef.current) return;
    dismissingRef.current = true;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    Animated.timing(opacity, {
      toValue: 0,
      duration: FADE_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && mountedRef.current) onDismiss(toast.id);
    });
  }, [onDismiss, opacity, toast.id]);

  useEffect(() => {
    mountedRef.current = true;

    if (toast.type === "achievement") gameSounds.play("achievement");
    if (toast.type === "mission") gameSounds.play("missionComplete");

    Animated.timing(opacity, {
      toValue: 1,
      duration: FADE_MS,
      useNativeDriver: true,
    }).start();

    timerRef.current = setTimeout(dismiss, HOLD_MS);

    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      opacity.stopAnimation();
    };
  }, [dismiss, opacity, toast.type]);

  const handlePress = () => {
    if (canOpen) onPress(toast);
    dismiss();
  };

  const queueLabel =
    queuedCount > 0
      ? ` · ${queuedCount} more ${queuedCount === 1 ? "notice" : "notices"}`
      : "";

  return (
    <Animated.View style={[styles.noticeContainer, { opacity }]}>
      <TouchableOpacity
        accessibilityHint={
          canOpen ? "Opens the related record" : "Dismisses this notice"
        }
        accessibilityLabel={`${appearance.label}: ${appearance.title}${queueLabel}`}
        accessibilityRole="button"
        activeOpacity={0.78}
        onPress={handlePress}
        style={styles.notice}
      >
        <View style={styles.iconArea}>
          <Ionicons name={appearance.icon} size={21} color={appearance.color} />
        </View>

        <View style={styles.body}>
          <Text style={[styles.label, { color: appearance.color }]}>
            {appearance.label}
            {queueLabel}
          </Text>
          <Text numberOfLines={1} style={styles.title}>
            {appearance.title}
          </Text>
          {appearance.detail ? (
            <Text numberOfLines={1} style={styles.detail}>
              {appearance.detail}
            </Text>
          ) : null}
        </View>

        <View style={styles.trailingControl}>
          <Ionicons
            name={canOpen ? "chevron-forward" : "close"}
            size={18}
            color={Colors.muted}
          />
        </View>
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
  const bottom = tabBarHeight + Spacing.md;

  const handlePress = useCallback(
    (pressedToast: ToastData) => {
      if (pressedToast.type === "achievement") openSheet("achievements");
      if (pressedToast.type === "mission") openSheet("missions");
    },
    [openSheet],
  );

  if (activeSheet || !toast) return null;

  return (
    <View pointerEvents="box-none" style={[styles.stack, { bottom }]}>
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
    right: 0,
    left: 0,
    zIndex: 60,
    alignItems: "center",
    paddingHorizontal: Spacing.md,
  },
  noticeContainer: {
    width: "100%",
    maxWidth: 520,
  },
  notice: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingLeft: Spacing.md,
    paddingRight: Spacing.xs,
    paddingVertical: Spacing.sm,
    overflow: "hidden",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSection,
    borderRadius: Radius.sm,
  },
  iconArea: {
    width: 32,
    minHeight: MIN_TOUCH,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
    fontWeight: Typography.weight.semibold,
  },
  title: {
    marginTop: Spacing.xxs,
    color: Colors.text,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
    fontWeight: Typography.weight.bold,
  },
  detail: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  trailingControl: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
