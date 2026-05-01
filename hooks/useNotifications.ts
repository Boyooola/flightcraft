/**
 * hooks/useNotifications.ts
 *
 * Registers push notification permissions and handles
 * notification taps (deep-links to relevant sheet).
 *
 * Setup:
 *   expo install expo-notifications
 *   expo install @react-native-async-storage/async-storage
 *
 * No EAS rebuild needed — expo-notifications works in managed workflow.
 *
 * For production push (server-sent notifications), you would also need
 * to collect the Expo push token and send it to your Supabase backend.
 * This file handles LOCAL notifications (scheduled on-device) only.
 */

import { useGameStore } from "@/store";
import { useEffect } from "react";

let Notifications: any = null;
try {
  Notifications = require("expo-notifications");
} catch {}

export function useNotifications() {
  const openSheet = useGameStore((s) => s.openSheet);

  useEffect(() => {
    if (!Notifications) return;

    // Configure how notifications appear while app is foregrounded
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });

    // Handle notification taps
    const tapSub = Notifications.addNotificationResponseReceivedListener(
      (response: any) => {
        const data = response.notification.request.content.data;
        if (data?.type === "away_return") {
          openSheet("finance"); // show finance to see earnings
        }
        if (data?.type === "away_earnings") {
          openSheet("routes");
        }
        if (data?.type === "rank_up") {
          openSheet("leaderboard");
        }
      },
    );

    return () => tapSub.remove();
  }, [openSheet]);
}

// ── Schedule a re-engagement notification ─────────────────────────
// Call this from useGameClock when going to background.
// The notification fires after `hoursUntil` real hours.

export async function scheduleReEngagement(
  hoursUntil: number,
  estimatedDays: number,
  estimatedEarnings: number,
) {
  if (!Notifications) return;

  try {
    await Notifications.cancelAllScheduledNotificationsAsync();

    const { fmtCash } = await import("@/lib/revenue");

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "✈ Your airline is earning!",
        body:
          estimatedEarnings > 0
            ? `${estimatedDays} game-day${estimatedDays !== 1 ? "s" : ""} have passed. Come collect ~${fmtCash(estimatedEarnings)}!`
            : `${estimatedDays} game-day${estimatedDays !== 1 ? "s" : ""} have passed. Check in on your airline!`,
        data: { type: "away_earnings" },
      },
      trigger: {
        seconds: Math.round(hoursUntil * 3600),
        repeats: false,
      },
    });
  } catch {}
}
