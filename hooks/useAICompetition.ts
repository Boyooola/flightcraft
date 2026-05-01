/**
 * hooks/useAICompetition.ts
 *
 * WorldWide Rush-style AI competition hook.
 *
 * Keeps your deterministic AI route conflict logic, but uses in-game warning
 * toasts instead of relying only on OS notifications. Rival passenger stealing
 * is handled in useRevenueTick at day-end.
 */

import { emitWarningToast } from "@/hooks/useToast";
import { getNewAIRouteConflicts } from "@/lib/AIAirline";
import { useGameStore } from "@/store";
import { useEffect, useRef } from "react";

let Notifications: any = null;
try {
  Notifications = require("expo-notifications");
} catch {}

async function notifyCompetition(aiName: string, origin: string, dest: string) {
  if (!Notifications) return;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `✈ ${aiName} entered your corridor`,
        body: `${aiName} opened ${origin}→${dest}. Ignored travelers may switch to them.`,
        data: { type: "competition", origin, dest },
      },
      trigger: null,
    });
  } catch {}
}

export function useAICompetition() {
  const lastDay = useRef<number>(-1);

  useEffect(() => {
    const unsub = useGameStore.subscribe(
      (s) => s.airline?.day,
      (day) => {
        if (!day || day === lastDay.current) return;
        lastDay.current = day;

        const { airline, aiAirlines, demands, airports } =
          useGameStore.getState();
        if (!airline || aiAirlines.length === 0) return;

        const gameSeed = airline.seed ?? "DEFAULT";
        const difficulty = (airline.ai_difficulty ?? "balanced") as
          | "passive"
          | "balanced"
          | "aggressive";

        if (difficulty === "passive") return;

        for (let i = 0; i < aiAirlines.length; i++) {
          const conflicts = getNewAIRouteConflicts(
            gameSeed,
            i,
            day,
            difficulty,
            demands,
            airports,
          );

          if (conflicts.length === 0) continue;

          const { aiName, origin, dest } = conflicts[0];

          emitWarningToast({
            id: `ai-conflict-${aiName}-${origin}-${dest}-${day}`,
            level: difficulty === "aggressive" ? "critical" : "low",
            cash: airline.cash,
            message: `${aiName} entered ${origin}→${dest}. Clear waiting travelers quickly or rivals may capture them.`,
          });

          notifyCompetition(aiName, origin, dest);
          break;
        }
      },
    );

    return () => unsub();
  }, []);
}
