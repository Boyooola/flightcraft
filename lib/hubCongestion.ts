/**
 * lib/hubCongestion.ts
 */

export function congestionEfficiencyMultiplier(level?: string | null): number {
  if (level === "crisis") return 0.8;
  if (level === "overcrowded") return 0.9;
  if (level === "busy") return 0.97;
  return 1.0;
}

export function congestionPenaltyPct(level?: string | null): number {
  return Math.round((1 - congestionEfficiencyMultiplier(level)) * 100);
}

export function congestionLabel(level?: string | null): string {
  if (level === "crisis") return "Crisis";
  if (level === "overcrowded") return "Overcrowded";
  if (level === "busy") return "Busy";
  return "Normal";
}
