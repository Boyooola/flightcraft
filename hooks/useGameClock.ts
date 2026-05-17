/**
 * hooks/useGameClock.ts
 *
 * Game time simulation + background handling.
 *
 * Three responsibilities:
 *   1. CLOCK      — setInterval driving advanceDay() at speed×
 *   2. PAUSE      — auto-pauses when app backgrounds, resumes on foreground
 *   3. AWAY CALC  — on resume, calculates days elapsed while backgrounded,
 *                   applies away earnings (capped at 24hrs worth of days),
 *                   shows a notification summary
 *
 * Setup: expo install expo-notifications
 */

import { calcRouteRevenue, fmtCash } from "@/lib/revenue";
import { supabase } from "@/lib/supabase";
import { useGameStore } from "@/store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

// Lazy-load expo-notifications — won't crash if not installed
let Notifications: any = null;
try {
  Notifications = require("expo-notifications");
} catch {}

// ─────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────

const BASE_DAY_MS = 180_000; // 3 real min = 1 game day at ×1
const BG_TIMESTAMP_KEY = "@flightcraft:bg_timestamp";
const BG_SPEED_KEY = "@flightcraft:bg_speed";
const MAX_AWAY_DAYS = 48; // cap at 48 game-days (24h at ×1)

// ─────────────────────────────────────────────────────────────────
// NOTIFICATION SETUP
// ─────────────────────────────────────────────────────────────────

async function requestNotificationPermission() {
  if (!Notifications) return false;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

async function scheduleAwayNotification(
  minutesUntil: number,
  daysEarned: number,
  estimatedEarnings: number,
) {
  if (!Notifications) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "✈ Your airline is flying!",
        body: `${daysEarned} day${daysEarned !== 1 ? "s" : ""} of revenue ready — come collect ${fmtCash(estimatedEarnings)}`,
        data: { type: "away_earnings" },
      },
      trigger: { seconds: Math.max(10, minutesUntil * 60), repeats: false },
    });
  } catch {}
}

async function cancelNotifications() {
  if (!Notifications) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {}
}

// ─────────────────────────────────────────────────────────────────
// AWAY EARNINGS CALCULATION
// ─────────────────────────────────────────────────────────────────

function estimateDailyNetRevenue(): number {
  const { routes, demands, hubs, airline, ownedPlanes } =
    useGameStore.getState();
  const activeRoutes = routes.filter((r) => r.active);
  const activePlaneIds = new Set(activeRoutes.map((r) => r.plane.id));
  if (!airline) return 0;

  // Revenue from active routes
  const grossRevenue = activeRoutes.reduce((total, route) => {
    const demand =
      demands.find((d) => d.id === route.demand.id) ?? route.demand;
    const hub = hubs.find((h) => h.airport.iata === route.hub_iata);
    const p = route.plane.plane_model;
    const dist = route.total_dist_nm ?? demand.dist_nm;
    const paxDay = demand.base_pax_day ?? 0; // fixed: was demand.pax_day

    if (paxDay <= 0) return total;

    // Condition penalty — worn planes earn less while away too
    const condition = route.plane.condition ?? 100;
    const conditionMul = condition <= 15 ? 0.7 : condition <= 40 ? 0.85 : 1.0;

    const res = calcRouteRevenue({
      distNm: dist,
      speedKts: p.speed_kts,
      trustPct: hub?.trust ?? 0,
      deliveredPax: paxDay, // assume full delivery each away day
      paxDay,
      costPerSector: p.cost_per_sector ?? 500,
      fuelPerNm: p.fuel_per_nm ?? 2.0,
      businessPct: demand.business_pct ?? 0.25,
      leisurePct: demand.leisure_pct ?? 0.75,
    });

    return total + Math.round(res.net * conditionMul);
  }, 0);

  // Idle plane maintenance cost — same as live game
  const idlePlanes = (ownedPlanes ?? []).filter(
    (p) => !activePlaneIds.has(p.id),
  );
  const maintenanceCost = idlePlanes.reduce((sum, p) => {
    const dailyOps =
      (p.plane_model.cost_per_sector ?? 500) * 2 +
      (p.plane_model.fuel_per_nm ?? 2) * 500;
    return sum + Math.round(dailyOps * 0.15);
  }, 0);

  return grossRevenue - maintenanceCost;
}

async function applyAwayEarnings(bgTimestamp: number, bgSpeed: number) {
  useGameStore.getState().setIsApplyingAway(true);
  const now = Date.now();
  const elapsedMs = now - bgTimestamp;
  const msPerDay = BASE_DAY_MS / Math.max(1, bgSpeed);
  const daysElapsed = Math.floor(elapsedMs / msPerDay);

  if (daysElapsed <= 0) {
    useGameStore.getState().setIsApplyingAway(false);
    return;
  }

  const cappedDays = Math.min(daysElapsed, MAX_AWAY_DAYS);
  const dailyNet = estimateDailyNetRevenue();

  // dailyNet can be negative (e.g. idle fleet, heavy loan)
  const totalEarnings = Math.round(dailyNet * cappedDays);

  const { earnCash, advanceDay, addLedgerEntries, airline } =
    useGameStore.getState();

  // Advance days in store
  for (let i = 0; i < cappedDays; i++) advanceDay();

  // Apply loan interest for away days
  const { airline: latestAirline } = useGameStore.getState();
  if (latestAirline && latestAirline.loan > 0) {
    const { dailyInterest } = await import("@/lib/revenue");
    const interestPerDay = dailyInterest(
      latestAirline.loan,
      latestAirline.loan_rate ?? 5,
    );
    const totalInterest = interestPerDay * cappedDays;
    if (totalInterest > 0) {
      useGameStore.getState().accrueInterest(totalInterest);
      useGameStore.getState().addLedgerEntries([
        {
          id: `away-interest-${Date.now()}`,
          day: latestAirline.day,
          type: "interest",
          label: `Loan interest (${cappedDays} days away)`,
          amount: -totalInterest,
          route_id: null,
        },
      ]);
    }
  }

  // Credit or debit net earnings (can be negative)
  if (totalEarnings !== 0) {
    earnCash(totalEarnings);
    useGameStore.getState().setAwayEarnings({
      days: cappedDays,
      amount: totalEarnings,
    });
    addLedgerEntries([
      {
        id: `away-earnings-${Date.now()}`,
        day: (airline?.day ?? 1) + cappedDays,
        type: totalEarnings >= 0 ? "revenue" : "interest",
        label: `Away ${totalEarnings >= 0 ? "earnings" : "loss"} (${cappedDays} day${cappedDays !== 1 ? "s" : ""})`,
        amount: totalEarnings,
        route_id: null,
      },
    ]);
  } else if (cappedDays > 0) {
    // Show the modal even if net is zero so player knows days passed
    useGameStore.getState().setAwayEarnings({ days: cappedDays, amount: 0 });
  }

  setTimeout(() => useGameStore.getState().setIsApplyingAway(false), 500);
}

// ─────────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────────

export function useGameClock() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const hasSetup = useRef(false);

  const airline = useGameStore((s) => s.airline);
  const phase = useGameStore((s) => s.phase);
  const advanceDay = useGameStore((s) => s.advanceDay);
  const speed = airline?.speed ?? 1;

  // ── Notification permission ────────────────────────────────────
  useEffect(() => {
    requestNotificationPermission();
    if (Notifications) {
      Notifications.setNotificationHandler?.({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });
    }
  }, []);

  const stopClock = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startClock = useCallback(() => {
    stopClock();
    if (speed === 0 || phase !== "playing") return;

    const tickMs = 500;
    const msPerDay = BASE_DAY_MS / speed;
    let lastTick = Date.now();

    timerRef.current = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastTick;
      lastTick = now;

      const store = useGameStore.getState();
      const nextProgress = store.dayProgress + elapsed / msPerDay;

      if (nextProgress >= 1) {
        advanceDay();
        store.setDayProgress(nextProgress % 1);
      } else {
        store.setDayProgress(nextProgress);
      }
    }, tickMs);
  }, [speed, phase, advanceDay, stopClock]);

  // ── Clock lifecycle ────────────────────────────────────────────
  useEffect(() => {
    startClock();
    return stopClock;
  }, [startClock]);

  // ── Background / foreground handling ─────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener(
      "change",
      async (nextState: AppStateStatus) => {
        const wasActive = appState.current === "active";
        const nowActive = nextState === "active";
        appState.current = nextState;

        if (wasActive && !nowActive) {
          // ── Going to background ──────────────────────────────────
          stopClock();

          if (phase === "playing" && speed > 0) {
            // Save current state immediately before backgrounding
            // so if app is killed, progress is not lost
            try {
              const { airline, hubs, earnedAchievements, missionsCompleted } =
                useGameStore.getState();
              if (airline) {
                await supabase
                  .from("airlines")
                  .update({
                    cash: airline.cash,
                    loan: airline.loan,
                    day: airline.day,
                    demand_score: airline.demand_score,
                    reputation: airline.reputation,
                    achievements: earnedAchievements,
                    missions_completed: missionsCompleted,
                  })
                  .eq("id", airline.id);

                // Save hub trust values too
                const hubUpdates = hubs
                  .filter((h) => !h.id.startsWith("temp-"))
                  .map((h) =>
                    supabase
                      .from("hubs")
                      .update({ trust: Math.round(h.trust * 10) / 10 })
                      .eq("id", h.id),
                  );
                await Promise.all(hubUpdates);
              }
            } catch {}

            const ts = Date.now().toString();
            await AsyncStorage.setItem(BG_TIMESTAMP_KEY, ts);
            await AsyncStorage.setItem(BG_SPEED_KEY, speed.toString());

            // Schedule "come back" notification
            const dailyNet = estimateDailyNetRevenue();
            const msPerDay = BASE_DAY_MS / speed;
            const daysIn3Hours = (3 * 60 * 60 * 1000) / msPerDay;
            const est3h = Math.round(dailyNet * daysIn3Hours);

            if (dailyNet > 0) {
              await scheduleAwayNotification(
                3,
                Math.round(daysIn3Hours),
                est3h,
              );
            }
          }
        } else if (!wasActive && nowActive) {
          // ── Returning to foreground ──────────────────────────────
          await cancelNotifications();

          try {
            const tsStr = await AsyncStorage.getItem(BG_TIMESTAMP_KEY);
            const speedStr = await AsyncStorage.getItem(BG_SPEED_KEY);

            if (tsStr && phase === "playing") {
              const bgTs = parseInt(tsStr, 10);
              const bgSpeed = speedStr ? parseFloat(speedStr) : 1;
              await applyAwayEarnings(bgTs, bgSpeed);
              await AsyncStorage.removeItem(BG_TIMESTAMP_KEY);
              await AsyncStorage.removeItem(BG_SPEED_KEY);

              // Save after away earnings so day + cash are persisted
              try {
                const { airline, hubs, earnedAchievements, missionsCompleted } =
                  useGameStore.getState();
                if (airline) {
                  await supabase
                    .from("airlines")
                    .update({
                      cash: airline.cash,
                      loan: airline.loan,
                      day: airline.day,
                      demand_score: airline.demand_score,
                      reputation: airline.reputation,
                      achievements: earnedAchievements,
                      missions_completed: missionsCompleted,
                    })
                    .eq("id", airline.id);
                }
              } catch {}
            } else {
              // No away earnings but ensure pax is reset if day changed while backgrounded
              useGameStore.getState().resetDailyPax();
            }
          } catch {}

          startClock();
        }
      },
    );

    return () => sub.remove();
  }, [startClock, stopClock, phase, speed]);

  return {
    day: airline?.day ?? 1,
    speed: airline?.speed ?? 1,
    paused: speed === 0 || phase !== "playing",
  };
}
