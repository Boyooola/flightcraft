/**
 * hooks/useRateUs.ts
 *
 * Prompts the player to rate the app at the right moment.
 * Uses expo-store-review — no EAS rebuild needed.
 *
 * Setup: expo install expo-store-review
 *
 * Trigger conditions (ALL must be true):
 *   - Day >= 10 (player has invested time)
 *   - Active routes >= 3 (player understands the game)
 *   - Net worth > 0 (player is succeeding, not frustrated)
 *   - Not prompted before (stored in AsyncStorage)
 *   - StoreReview.isAvailableAsync() returns true
 *
 * Only fires ONCE per install. Never bugs the player twice.
 */

import { useGameStore, useRoutes } from "@/store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef } from "react";

let StoreReview: any = null;
try {
  StoreReview = require("expo-store-review");
} catch {}

const RATE_US_KEY = "@flightcraft:rate_us_shown";

export function useRateUs() {
  const hasChecked = useRef(false);
  const routes = useRoutes();
  const airline = useGameStore((s) => s.airline);

  useEffect(() => {
    if (hasChecked.current) return;
    if (!StoreReview) return;
    if (!airline) return;

    const day = airline.day;
    const activeRoutes = routes.filter((r) => r.active).length;
    const netWorth = Math.max(0, airline.cash - airline.loan);

    // Check trigger conditions
    if (day < 10) return;
    if (activeRoutes < 3) return;
    if (netWorth <= 0) return;

    hasChecked.current = true;

    const tryPrompt = async () => {
      try {
        const already = await AsyncStorage.getItem(RATE_US_KEY);
        if (already) return;

        const available = await StoreReview.isAvailableAsync();
        if (!available) return;

        // Mark as shown BEFORE requesting — prevents double prompt
        // even if player dismisses or crashes
        await AsyncStorage.setItem(RATE_US_KEY, "1");

        // Small delay so it doesn't interrupt gameplay
        setTimeout(async () => {
          try {
            await StoreReview.requestReview();
          } catch {}
        }, 2000);
      } catch {}
    };

    tryPrompt();
  }, [airline?.day, routes.length]);
}
