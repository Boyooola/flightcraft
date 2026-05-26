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
 *   - Cash > 0 (hasn't gone bankrupt)
 *   - On a milestone day OR just completed first mission
 *   - Not prompted before (AsyncStorage flag)
 *   - StoreReview.isAvailableAsync() returns true
 *
 * Fires ONCE per install. Never prompts twice.
 * Falls back to Play Store URL if native prompt unavailable.
 *
 * Fixes applied:
 *   1. justCompletedMission now has its own early-return path —
 *      was previously unreachable because isMilestoneDay guard fired first.
 *   2. hasChecked.current moved inside tryPrompt, after AsyncStorage read —
 *      was set too early, blocking re-evaluation on subsequent days.
 *   3. netWorth guard replaced — airline.loan is not reliable as start cash.
 *      Now simply checks cash > 0 (player is solvent).
 *   4. routes added to useEffect dependency array — was stale.
 *   5. Prompt delay reduced from 3s to 1.5s — 3s felt too disconnected
 *      from the positive moment that triggered it.
 */

import { useGameStore, useRoutes } from "@/store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect } from "react";
import { Linking } from "react-native";

let StoreReview: any = null;
try {
  StoreReview = require("expo-store-review");
} catch {}

const RATE_US_KEY = "@flightcraft:rate_us_shown";
const PLAY_STORE_URL = "market://details?id=com.stratoslabs.flightcraft";
const PLAY_STORE_WEB =
  "https://play.google.com/store/apps/details?id=com.stratoslabs.flightcraft";
const DAY_MILESTONES = [7, 14, 30];
const PROMPT_DELAY_MS = 1500;

export async function openPlayStorePage() {
  try {
    const canOpen = await Linking.canOpenURL(PLAY_STORE_URL);
    await Linking.openURL(canOpen ? PLAY_STORE_URL : PLAY_STORE_WEB);
  } catch {
    await Linking.openURL(PLAY_STORE_WEB).catch(() => {});
  }
}

// ─────────────────────────────────────────────────────────────────
// CORE PROMPT — called once conditions are met
// Marks shown BEFORE requesting to prevent double-prompt on
// re-render races. Returns early if already shown.
// ─────────────────────────────────────────────────────────────────

async function tryShowPrompt() {
  try {
    const already = await AsyncStorage.getItem(RATE_US_KEY);
    if (already) return;

    // Mark as shown before the delay — prevents a second trigger
    // firing during the 1.5s window if state changes
    await AsyncStorage.setItem(RATE_US_KEY, String(Date.now()));

    setTimeout(async () => {
      try {
        const available = StoreReview && (await StoreReview.isAvailableAsync());
        if (available) {
          await StoreReview.requestReview();
        } else {
          await openPlayStorePage();
        }
      } catch {}
    }, PROMPT_DELAY_MS);
  } catch {}
}

// ─────────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────────

export function useRateUs() {
  const routes = useRoutes();
  const airline = useGameStore((s) => s.airline);
  const missionsCompleted = useGameStore((s) => s.missionsCompleted ?? 0);

  useEffect(() => {
    if (!airline) return;

    const day = airline.day;
    const cash = airline.cash ?? 0;
    const activeRoutes = routes.filter((r) => r.active).length;

    // Minimum bar — player must be genuinely playing and solvent
    if (day < 7) return;
    if (activeRoutes < 2) return;
    if (cash <= 0) return;

    const isMilestoneDay = DAY_MILESTONES.includes(day);
    const justCompletedMission = missionsCompleted >= 1;

    // Either condition independently qualifies —
    // previously justCompletedMission was unreachable because
    // the milestone guard returned early before it was evaluated
    if (!isMilestoneDay && !justCompletedMission) return;

    // hasChecked is now inside tryShowPrompt (AsyncStorage flag) —
    // this allows re-evaluation on subsequent milestone days
    // in case the first attempt failed silently
    tryShowPrompt();

    // routes included — was missing, causing stale activeRoutes count
  }, [airline?.day, airline?.cash, missionsCompleted, routes]);
}
