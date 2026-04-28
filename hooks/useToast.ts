/**
 * hooks/useToast.ts
 *
 * Lightweight typed event-emitter for ephemeral UI toasts.
 * Four toast types:
 *   revenue   — daily P&L
 *   unlock    — new plane just became available
 *   warning   — cash low / consecutive losses
 *   milestone — goal reached
 */

import type { AchievementCategory } from "@/lib/achievements";
import { useCallback, useEffect, useState } from "react";

export interface RevenueToastData {
  type: "revenue";
  id: string;
  revenue: number;
  interest: number;
  net: number;
  day: number;
  routes: number;
  paxToday: number;
}

export interface UnlockToastData {
  type: "unlock";
  id: string;
  nickname: string;
  family: string;
  price: number;
}

export interface WarningToastData {
  type: "warning";
  id: string;
  level: "low" | "critical";
  cash: number;
  message: string;
}

export interface MissionToastData {
  type: "mission";
  id: string;
  missionId: string;
  title: string;
  reward: number;
  icon: string;
}

export interface DaySummaryToastData {
  type: "day-summary";
  id: string;
  day: number;
  revenue: number;
  interest: number;
  net: number;
  paxToday: number;
  missionsToday: number; // completed this day
  missionsTotal: number; // total missions available
  netWorth: number;
  prevNetWorth: number; // so we can show delta
}

export interface AchievementToastData {
  type: "achievement";
  id: string;
  achievementId: string;
  title: string;
  flavor: string;
  icon: string;
  points: number;
  category: AchievementCategory;
}

export type ToastData =
  | RevenueToastData
  | UnlockToastData
  | WarningToastData
  | MissionToastData
  | AchievementToastData
  | DaySummaryToastData;

// ─────────────────────────────────────────────────────────────────
// EMITTER
// ─────────────────────────────────────────────────────────────────

type Listener = (toast: ToastData) => void;
const listeners = new Set<Listener>();

export function emitToast(toast: ToastData) {
  listeners.forEach((l) => l(toast));
}

export function emitRevenueToast(data: Omit<RevenueToastData, "type">) {
  emitToast({ type: "revenue", ...data });
}

export function emitUnlockToast(data: Omit<UnlockToastData, "type">) {
  emitToast({ type: "unlock", ...data });
}

export function emitWarningToast(data: Omit<WarningToastData, "type">) {
  emitToast({ type: "warning", ...data });
}

export function emitMissionToast(data: Omit<MissionToastData, "type">) {
  emitToast({ type: "mission", ...data });
}

export function emitDaySummaryToast(data: Omit<DaySummaryToastData, "type">) {
  emitToast({ type: "day-summary", ...data });
}

export function emitAchievementToast(data: Omit<AchievementToastData, "type">) {
  emitToast({ type: "achievement", ...data });
}

// ─────────────────────────────────────────────────────────────────
// SUBSCRIBER HOOK
// ─────────────────────────────────────────────────────────────────

export function useToastListener() {
  const [queue, setQueue] = useState<ToastData[]>([]);

  useEffect(() => {
    const handler: Listener = (toast) => {
      setQueue((prev) => [...prev, toast]);
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    setQueue((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { queue, dismiss };
}
