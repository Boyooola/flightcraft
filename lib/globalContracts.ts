/**
 * lib/globalContracts.ts
 *
 * Endgame layer: multi-day Global Contracts.
 *
 * These are bigger than daily missions. They run for several days and create
 * a clear late-game target while demand waves, AI stealing, and congestion
 * pressure try to break the player's network.
 */

import { seedHash } from "@/lib/seed";

export type GlobalContractKind =
  | "move_pax"
  | "clear_slots"
  | "earn_net"
  | "stable_hubs"
  | "anti_rival";

export type GlobalContractStatus = "active" | "completed" | "failed";

export interface GlobalContractState {
  id: string;
  kind: GlobalContractKind;
  title: string;
  desc: string;
  icon: string;
  startDay: number;
  endDay: number;
  durationDays: number;
  target: number;
  progress: number;
  rewardCash: number;
  status: GlobalContractStatus;
  failureReason?: string;
}

export interface GlobalContractDailyStats {
  day: number;
  movedPax: number;
  clearedSlots: number;
  net: number;
  crisisHubs: number;
  rivalCapturedPax: number;
}

const CONTRACT_POOL: {
  kind: GlobalContractKind;
  title: string;
  desc: string;
  icon: string;
  durationDays: number;
  baseTarget: number;
  targetGrowth: number;
  baseReward: number;
}[] = [
  {
    kind: "move_pax",
    title: "Global Passenger Push",
    desc: "Move a large number of travelers before the contract expires.",
    icon: "people-outline",
    durationDays: 7,
    baseTarget: 8_000,
    targetGrowth: 850,
    baseReward: 450_000,
  },
  {
    kind: "clear_slots",
    title: "Slot Clearance Drive",
    desc: "Clear demand slots quickly to prove your network can absorb pressure.",
    icon: "checkmark-done-outline",
    durationDays: 6,
    baseTarget: 10,
    targetGrowth: 1.2,
    baseReward: 350_000,
  },
  {
    kind: "earn_net",
    title: "Profit Sprint",
    desc: "Earn net positive cash before loan drag and congestion eat your margins.",
    icon: "cash-outline",
    durationDays: 7,
    baseTarget: 900_000,
    targetGrowth: 150_000,
    baseReward: 500_000,
  },
  {
    kind: "stable_hubs",
    title: "No-Crisis Network",
    desc: "Keep hubs out of crisis across several days. One crisis day slows progress.",
    icon: "shield-checkmark-outline",
    durationDays: 5,
    baseTarget: 5,
    targetGrowth: 0,
    baseReward: 400_000,
  },
  {
    kind: "anti_rival",
    title: "Beat Rival Capture",
    desc: "Move more travelers than rivals steal during this contract window.",
    icon: "flash-outline",
    durationDays: 6,
    baseTarget: 4_500,
    targetGrowth: 650,
    baseReward: 475_000,
  },
];

function scaleTarget(
  baseTarget: number,
  growth: number,
  day: number,
  completed: number,
) {
  const dayScale = Math.max(0, day - 15);
  return Math.round(
    baseTarget + dayScale * growth + completed * baseTarget * 0.25,
  );
}

function scaleReward(baseReward: number, day: number, completed: number) {
  return Math.round(
    baseReward + Math.max(0, day - 15) * 18_000 + completed * 150_000,
  );
}

export function shouldStartGlobalContracts(day: number) {
  return day >= 15;
}

export function createGlobalContract(params: {
  day: number;
  seed: string;
  completedContracts: number;
}): GlobalContractState {
  const { day, seed, completedContracts } = params;
  const template =
    CONTRACT_POOL[
      seedHash(seed, "global-contract", day, completedContracts) %
        CONTRACT_POOL.length
    ];

  const target =
    template.kind === "stable_hubs"
      ? template.baseTarget
      : scaleTarget(
          template.baseTarget,
          template.targetGrowth,
          day,
          completedContracts,
        );

  const rewardCash = scaleReward(template.baseReward, day, completedContracts);
  const id = `global-contract-${template.kind}-${day}-${completedContracts}`;

  return {
    id,
    kind: template.kind,
    title: template.title,
    desc: template.desc,
    icon: template.icon,
    startDay: day,
    endDay: day + template.durationDays - 1,
    durationDays: template.durationDays,
    target,
    progress: 0,
    rewardCash,
    status: "active",
  };
}

export function applyGlobalContractDay(
  contract: GlobalContractState,
  stats: GlobalContractDailyStats,
): GlobalContractState {
  if (contract.status !== "active") return contract;

  let progressGain = 0;
  let failureReason: string | undefined;

  switch (contract.kind) {
    case "move_pax":
      progressGain = Math.max(0, stats.movedPax);
      break;

    case "clear_slots":
      progressGain = Math.max(0, stats.clearedSlots);
      break;

    case "earn_net":
      progressGain = Math.max(0, stats.net);
      break;

    case "stable_hubs":
      // Streak-like contract. Crisis days do not fail immediately, but they
      // waste the day and make the contract hard to finish.
      progressGain = stats.crisisHubs <= 0 ? 1 : 0;
      if (stats.crisisHubs > 0) {
        failureReason = `${stats.crisisHubs} hub${stats.crisisHubs === 1 ? "" : "s"} hit crisis`;
      }
      break;

    case "anti_rival":
      // Reward moving pax while penalizing rival capture.
      progressGain = Math.max(0, stats.movedPax - stats.rivalCapturedPax);
      break;
  }

  const progress = Math.min(contract.target, contract.progress + progressGain);

  if (progress >= contract.target) {
    return {
      ...contract,
      progress,
      status: "completed",
    };
  }

  if (stats.day >= contract.endDay) {
    return {
      ...contract,
      progress,
      status: "failed",
      failureReason: failureReason ?? "Contract expired",
    };
  }

  return {
    ...contract,
    progress,
    failureReason,
  };
}

export function contractProgressPct(contract: GlobalContractState) {
  return Math.min(100, Math.round((contract.progress / contract.target) * 100));
}

export function contractDaysLeft(contract: GlobalContractState, day: number) {
  return Math.max(0, contract.endDay - day + 1);
}

export function contractProgressLabel(contract: GlobalContractState) {
  const current = Math.floor(contract.progress).toLocaleString();
  const target = Math.floor(contract.target).toLocaleString();

  if (contract.kind === "earn_net") return `$${current} / $${target}`;
  if (contract.kind === "stable_hubs") return `${current} / ${target} days`;
  if (contract.kind === "clear_slots") return `${current} / ${target} slots`;
  return `${current} / ${target} pax`;
}
