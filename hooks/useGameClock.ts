/**
 * hooks/useGameClock.ts
 *
 * Drives the in-game day and persists the current session when the app leaves
 * the foreground. Day settlement remains owned by useRevenueTick, which reacts
 * to the single advanceDay() event emitted here.
 */

import { supabase } from "@/lib/supabase";
import { useGameStore } from "@/store";
import { useCallback, useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

const BASE_DAY_MS = 180_000;
const CLOCK_TICK_MS = 500;
const MAX_TICK_ELAPSED_MS = 5_000;

function isTemporaryId(id: string): boolean {
  return id.startsWith("temp-") || id.startsWith("custom-demand-");
}

async function persistCurrentSnapshot(): Promise<void> {
  const snapshot = useGameStore.getState();
  const {
    airline,
    hubs,
    demands,
    ownedPlanes,
    presence,
    earnedAchievements,
    missionsCompleted,
  } = snapshot;

  if (!airline) return;

  const airlineWrite = supabase
    .from("airlines")
    .update({
      cash: airline.cash,
      loan: airline.loan,
      loan_rate: airline.loan_rate,
      day: airline.day,
      speed: airline.speed,
      demand_score: airline.demand_score,
      reputation: airline.reputation,
      achievements: earnedAchievements,
      missions_completed: missionsCompleted,
    })
    .eq("id", airline.id);

  const hubWrites = Promise.all(
    hubs
      .filter((hub) => !isTemporaryId(hub.id))
      .map((hub) =>
        supabase
          .from("hubs")
          .update({
            trust: Math.round(hub.trust * 10) / 10,
            hub_pax: hub.hub_pax,
            trust_floor: 0,
            nickname: hub.nickname ?? null,
          })
          .eq("id", hub.id),
      ),
  );

  const demandWrites = Promise.all(
    demands
      .filter((demand) => !isTemporaryId(demand.id))
      .map((demand) =>
        supabase
          .from("demands")
          .update({
            status: demand.status,
            popularity: demand.popularity,
            base_pax_day: demand.base_pax_day,
            pax_ceiling: demand.pax_ceiling,
            delivered_pax_today: demand.delivered_pax_today,
            ai_stolen_pax: demand.ai_stolen_pax ?? 0,
          })
          .eq("id", demand.id),
      ),
  );

  const planeWrites = Promise.all(
    ownedPlanes
      .filter((plane) => !isTemporaryId(plane.id))
      .map((plane) =>
        supabase
          .from("owned_planes")
          .update({
            condition: plane.condition,
            days_active: plane.days_active,
            route_id: plane.route_id,
          })
          .eq("id", plane.id),
      ),
  );

  const savedPresence = presence.filter(
    (row) => !row.id.startsWith("presence-"),
  );
  const newPresence = presence.filter((row) => row.id.startsWith("presence-"));
  const savedPresenceWrite =
    savedPresence.length > 0
      ? supabase.from("airport_presence").upsert(
          savedPresence.map((row) => ({
            id: row.id,
            airline_id: airline.id,
            airport_iata: row.airport_iata,
            total_pax_delivered: row.total_pax_delivered,
          })),
          { onConflict: "airline_id,airport_iata" },
        )
      : Promise.resolve({ error: null });
  const newPresenceWrite =
    newPresence.length > 0
      ? supabase.from("airport_presence").upsert(
          newPresence.map((row) => ({
            airline_id: airline.id,
            airport_iata: row.airport_iata,
            total_pax_delivered: row.total_pax_delivered,
          })),
          { onConflict: "airline_id,airport_iata" },
        )
      : Promise.resolve({ error: null });

  const [
    airlineResult,
    hubResults,
    demandResults,
    planeResults,
    savedPresenceResult,
    newPresenceResult,
  ] = await Promise.all([
    airlineWrite,
    hubWrites,
    demandWrites,
    planeWrites,
    savedPresenceWrite,
    newPresenceWrite,
  ]);

  const error = [
    airlineResult.error,
    ...hubResults.map((result) => result.error),
    ...demandResults.map((result) => result.error),
    ...planeResults.map((result) => result.error),
    savedPresenceResult.error,
    newPresenceResult.error,
  ].find(Boolean);

  if (error) {
    throw new Error(error.message);
  }
}

export function useGameClock() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const transitionedDayRef = useRef<number | null>(null);

  const day = useGameStore((state) => state.airline?.day ?? 1);
  const speed = useGameStore((state) => state.airline?.speed ?? 1);
  const phase = useGameStore((state) => state.phase);

  const stopClock = useCallback(() => {
    if (!timerRef.current) return;
    clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const startClock = useCallback(() => {
    stopClock();
    if (
      speed === 0 ||
      phase !== "playing" ||
      AppState.currentState !== "active"
    ) {
      return;
    }

    const millisecondsPerDay = BASE_DAY_MS / speed;
    let lastTickAt = Date.now();

    timerRef.current = setInterval(() => {
      if (AppState.currentState !== "active") {
        stopClock();
        return;
      }

      const now = Date.now();
      const elapsed = Math.min(
        MAX_TICK_ELAPSED_MS,
        Math.max(0, now - lastTickAt),
      );
      lastTickAt = now;

      const store = useGameStore.getState();
      const currentDay = store.airline?.day;
      if (
        store.phase !== "playing" ||
        store.airline?.speed === 0 ||
        currentDay == null
      ) {
        stopClock();
        return;
      }

      const nextProgress = store.dayProgress + elapsed / millisecondsPerDay;
      if (nextProgress < 1) {
        store.setDayProgress(nextProgress);
        return;
      }

      // Emit one day transition. useRevenueTick settles the completed day and
      // prepares the next day's persistent passenger markets.
      if (transitionedDayRef.current === currentDay) return;
      transitionedDayRef.current = currentDay;
      store.advanceDay();
      store.setDayProgress(nextProgress % 1);
    }, CLOCK_TICK_MS);
  }, [phase, speed, stopClock]);

  const queueSnapshotSave = useCallback(() => {
    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(persistCurrentSnapshot)
      .catch((error: unknown) => {
        console.warn(
          "[useGameClock] background save failed:",
          error instanceof Error ? error.message : error,
        );
      });
  }, []);

  useEffect(() => {
    startClock();
    return stopClock;
  }, [startClock, stopClock]);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        const wasActive = appStateRef.current === "active";
        const isActive = nextState === "active";
        appStateRef.current = nextState;

        if (!isActive) {
          stopClock();
          if (wasActive) {
            // Manual pause affects simulation only. It must never suppress a
            // persistence save when the player leaves the app. Tutorial and
            // welcome progress may also contain purchased gameplay objects.
            queueSnapshotSave();
          }
          return;
        }

        if (!wasActive) startClock();
      },
    );

    return () => subscription.remove();
  }, [queueSnapshotSave, startClock, stopClock]);

  return {
    day,
    speed,
    paused: speed === 0 || phase !== "playing",
  };
}
