/**
 * hooks/useRateUs.ts
 *
 * Prompts the player to rate the app at the right moment.
 * Uses expo-store-review — no EAS rebuild needed.
 *
 * Setup: expo install expo-store-review
 *
 * Trigger: ALL must be true:
 *   - Day >= 7 (seen demand waves, understands the loop)
 *   - Active routes >= 2 (actually playing)
 *   - Net worth > starting cash (genuinely succeeding)
 *   - Just completed a mission OR hit a day milestone (positive moment)
 *   - Not prompted before (AsyncStorage)
 *   - StoreReview.isAvailableAsync() returns true
 *
 * Fires ONCE per install. Never prompts twice.
 * Falls back to Play Store URL if native prompt unavailable.
 */

import { useGameStore, useRoutes } from "@/store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef } from "react";
import { Linking } from "react-native";

let StoreReview: any = null;
try {
  StoreReview = require("expo-store-review");
} catch {}

const RATE_US_KEY = "@flightcraft:rate_us_shown";
const PLAY_STORE_URL = "market://details?id=com.stratoslabs.flightcraft";
const PLAY_STORE_WEB =
  "https://play.google.com/store/apps/details?id=com.stratoslabs.flightcraft";

// Day milestones that trigger the prompt
const DAY_MILESTONES = [7, 14, 30];

export async function openPlayStorePage() {
  try {
    const canOpen = await Linking.canOpenURL(PLAY_STORE_URL);
    await Linking.openURL(canOpen ? PLAY_STORE_URL : PLAY_STORE_WEB);
  } catch {
    await Linking.openURL(PLAY_STORE_WEB).catch(() => {});
  }
}

export function useRateUs() {
  const hasChecked = useRef(false);
  const routes = useRoutes();
  const airline = useGameStore((s) => s.airline);
  const missionsCompleted = useGameStore((s) => s.missionsCompleted ?? 0);

  useEffect(() => {
    if (hasChecked.current) return;
    if (!airline) return;

    const day = airline.day;
    const activeRoutes = routes.filter((r) => r.active).length;
    const netWorth = Math.max(0, airline.cash - airline.loan);
    const startCash = airline.loan; // loan = starting cash at game start

    // Must be on a positive milestone day
    const isMilestoneDay = DAY_MILESTONES.includes(day);
    if (!isMilestoneDay) return;

    // Must be actually playing and succeeding
    if (activeRoutes < 2) return;
    if (netWorth <= startCash) return; // hasn't grown cash yet

    // Bonus trigger: just completed their first mission
    // (check separately so it can fire on any day)
    const justCompletedMission = missionsCompleted >= 1;
    const shouldTry = isMilestoneDay || justCompletedMission;
    if (!shouldTry) return;

    hasChecked.current = true;

    const tryPrompt = async () => {
      try {
        const already = await AsyncStorage.getItem(RATE_US_KEY);
        if (already) return;

        // Mark shown BEFORE requesting — prevents double-prompt
        await AsyncStorage.setItem(RATE_US_KEY, String(Date.now()));

        // 3s delay — let the current moment settle (don't interrupt gameplay)
        setTimeout(async () => {
          try {
            const available =
              StoreReview && (await StoreReview.isAvailableAsync());
            if (available) {
              await StoreReview.requestReview();
            } else {
              // Native prompt unavailable — open Play Store directly
              await openPlayStorePage();
            }
          } catch {}
        }, 3000);
      } catch {}
    };

    tryPrompt();
  }, [airline?.day, missionsCompleted]);
}
