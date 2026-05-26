/**
 * hooks/useDailyEvents.ts
 *
 * WorldWide Rush-style daily events + demand waves + choice events.
 *
 * Fixes applied:
 *   FIX 1 — Gambling salt changed from `day` (deterministic/replayable)
 *            to `Date.now()` (per-session random). Same day no longer
 *            always produces the same gamble outcome.
 *
 *   FIX 2 — `store.updatePlaneCondition` replaced with `store.updateOwnedPlane`
 *            (the actual action in the store). Was throwing at runtime on any
 *            event with a conditionHitAllPlanes consequence.
 */

import {
  isChoiceEventDay,
  pickChoiceEvent,
  type ChoiceEvent,
  type ResolvedChoice,
} from "@/lib/choiceEvents";
import {
  applyDemandWave,
  generateDemandWave,
  isDemandWaveDay,
  type DemandWaveKind,
} from "@/lib/demandWaves";
import { seedHash } from "@/lib/seed";
import { useGameStore } from "@/store";
import { useEffect, useRef } from "react";

export interface DailyEvent {
  id: string;
  type: "positive" | "negative" | "neutral";
  icon: string;
  title: string;
  desc: string;
  effect: string;
  revenueMultiplier?: number;
  cashBonus?: number;

  // Demand-wave metadata
  waveKind?: DemandWaveKind;
  waveAddedPax?: number;
  waveAffectedSlots?: number;
  waveAffectedHubs?: string[];
}

// ─────────────────────────────────────────────────────────────────
// EVENT POOLS
// ─────────────────────────────────────────────────────────────────

const POSITIVE_EVENTS: Omit<DailyEvent, "id">[] = [
  {
    type: "positive",
    icon: "flash-outline",
    title: "Passenger Rush",
    desc: "More passengers are trying to move today. Clear slots fast.",
    effect: "+25% revenue today",
    revenueMultiplier: 1.25,
  },
  {
    type: "positive",
    icon: "people-circle-outline",
    title: "Full Terminals",
    desc: "Demand is high across your hubs. Every route matters.",
    effect: "+20% revenue today",
    revenueMultiplier: 1.2,
  },
  {
    type: "positive",
    icon: "sunny-outline",
    title: "Smooth Skies",
    desc: "Clear weather keeps planes moving cleanly.",
    effect: "+15% revenue today",
    revenueMultiplier: 1.15,
  },
  {
    type: "positive",
    icon: "cash-outline",
    title: "Rush Bonus",
    desc: "Airports are paying extra for fast passenger movement.",
    effect: "+$25,000 bonus",
    cashBonus: 25_000,
  },
  {
    type: "positive",
    icon: "rocket-outline",
    title: "Fast Flow",
    desc: "Ground crews move quickly today. Passengers board faster.",
    effect: "+30% revenue today",
    revenueMultiplier: 1.3,
  },
  {
    type: "positive",
    icon: "heart-outline",
    title: "Trust Spike",
    desc: "Passengers like your recent service. Bookings rise.",
    effect: "+18% revenue today",
    revenueMultiplier: 1.18,
  },
];

const NEGATIVE_EVENTS: Omit<DailyEvent, "id">[] = [
  {
    type: "negative",
    icon: "alert-circle-outline",
    title: "Airport Jam",
    desc: "Passenger queues are building. Unserved demand hurts more today.",
    effect: "-15% revenue today",
    revenueMultiplier: 0.85,
  },
  {
    type: "negative",
    icon: "thunderstorm-outline",
    title: "Bad Weather",
    desc: "Storms slow the network. Keep the busiest routes moving.",
    effect: "-20% revenue today",
    revenueMultiplier: 0.8,
  },
  {
    type: "negative",
    icon: "construct-outline",
    title: "Gate Delays",
    desc: "Boarding is slower today. Short routes feel the pressure.",
    effect: "-12% revenue today",
    revenueMultiplier: 0.88,
  },
  {
    type: "negative",
    icon: "flame-outline",
    title: "Fuel Spike",
    desc: "Flying costs more today. Clear high-value demand first.",
    effect: "-18% revenue today",
    revenueMultiplier: 0.82,
  },
  {
    type: "negative",
    icon: "warning-outline",
    title: "Crowded Hub",
    desc: "One busy airport is slowing the whole board.",
    effect: "-$15,000 disruption cost",
    cashBonus: -15_000,
  },
];

const NEUTRAL_EVENTS: Omit<DailyEvent, "id">[] = [
  {
    type: "neutral",
    icon: "map-outline",
    title: "New Demand Patterns",
    desc: "Passenger routes are shifting. Watch your open slots.",
    effect: "No immediate impact",
  },
  {
    type: "neutral",
    icon: "business-outline",
    title: "Airport Expansion",
    desc: "A hub is preparing for more passengers soon.",
    effect: "No immediate impact",
  },
  {
    type: "neutral",
    icon: "swap-horizontal-outline",
    title: "Travel Mix Changed",
    desc: "Some passengers prefer different destinations today.",
    effect: "No immediate impact",
  },
];

export function generateDailyEvent(
  day: number,
  gameSeed: string = "DEFAULT",
): DailyEvent {
  const roll = seedHash(gameSeed, "rush-event-roll", day) % 100;
  const pick = (arr: Omit<DailyEvent, "id">[]) =>
    arr[seedHash(gameSeed, "rush-event-pick", day) % arr.length];

  let base: Omit<DailyEvent, "id">;
  if (roll < 55) base = pick(POSITIVE_EVENTS);
  else if (roll < 85) base = pick(NEGATIVE_EVENTS);
  else base = pick(NEUTRAL_EVENTS);

  return { ...base, id: `event-day-${day}` };
}

// ─────────────────────────────────────────────────────────────────
// DEMAND WAVE
// ─────────────────────────────────────────────────────────────────

function buildDemandWaveEvent(day: number): DailyEvent | null {
  const store = useGameStore.getState();
  const gameSeed = store.airline?.seed ?? "DEFAULT";

  if (!isDemandWaveDay(day)) return null;

  const applied = applyDemandWave({
    day,
    gameSeed,
    demands: store.demands,
    hubs: store.hubs,
  });

  if (!applied) {
    const wave = generateDemandWave(day, gameSeed);
    return {
      id: `wave-empty-${day}`,
      type: "neutral",
      icon: wave.icon,
      title: wave.title,
      desc: "A demand wave passed through, but there were no open demand slots to boost.",
      effect: "No open slots affected",
      revenueMultiplier: wave.revenueMultiplier,
      waveKind: wave.kind,
      waveAddedPax: 0,
      waveAffectedSlots: 0,
      waveAffectedHubs: [],
    };
  }

  applied.updates.forEach((update) => {
    store.updateDemand(update.demandId, { base_pax_day: update.newPaxDay });
  });

  const hubLabel =
    applied.affectedHubs.length > 0
      ? ` · ${applied.affectedHubs.join(", ")}`
      : "";

  return {
    id: applied.wave.id,
    type: "positive",
    icon: applied.wave.icon,
    title: applied.wave.title,
    desc: `${applied.wave.desc}${hubLabel}`,
    effect: `+${applied.totalAddedPax.toLocaleString()} pax across ${applied.updates.length} slot${applied.updates.length === 1 ? "" : "s"}`,
    revenueMultiplier: applied.wave.revenueMultiplier,
    waveKind: applied.wave.kind,
    waveAddedPax: applied.totalAddedPax,
    waveAffectedSlots: applied.updates.length,
    waveAffectedHubs: applied.affectedHubs,
  };
}

// ─────────────────────────────────────────────────────────────────
// CHOICE EVENT RESOLUTION
// ─────────────────────────────────────────────────────────────────

export function resolveChoiceEvent(
  event: ChoiceEvent,
  optionId: "a" | "b",
): ResolvedChoice {
  const store = useGameStore.getState();
  const option = event.options.find((o) => o.id === optionId)!;
  const con = option.consequence;
  const day = store.airline?.day ?? 1;

  // ── Immediate cash delta ─────────────────────────────────────
  if (con.cashDelta) {
    store.earnCash(con.cashDelta);
  }

  // ── Gambling mechanic ────────────────────────────────────────
  // FIX 1: Use Date.now() as salt instead of `day`.
  // `day` is deterministic — same day always gives same roll, so loading
  // a save or restarting the day always produces the same outcome.
  // Date.now() makes each resolution genuinely random per session.
  let gamblingOutcome: number = 0;
  if (con.cashBonusChance) {
    const roll = (Date.now() % 10_000) / 10_000; // 0..1 per-session random
    if (roll < con.cashBonusChance.chance) {
      gamblingOutcome = con.cashBonusChance.bonus;
    } else {
      gamblingOutcome = con.cashBonusChance.failPenalty;
    }
    if (gamblingOutcome !== 0) {
      store.earnCash(gamblingOutcome);
    }
  }

  // ── Trust delta — applied to all hubs ───────────────────────
  if (con.trustDelta) {
    store.hubs.forEach((hub) => {
      store.updateHub(hub.id, {
        trust: Math.max(0, Math.min(100, hub.trust + (con.trustDelta ?? 0))),
      });
    });
  }

  // ── Plane condition hit ──────────────────────────────────────
  // FIX 2: Use store.updateOwnedPlane (correct action) instead of
  // store.updatePlaneCondition (didn't exist — would throw at runtime).
  if (con.conditionHitAllPlanes) {
    store.ownedPlanes.forEach((plane) => {
      const newCondition = Math.max(
        0,
        Math.min(100, (plane.condition ?? 100) + con.conditionHitAllPlanes!),
      );
      store.updateOwnedPlane(plane.id, { condition: newCondition });
    });
  }

  // ── Demand boost across all hub demands ─────────────────────
  if (con.demandBoostHubs) {
    store.demands.forEach((demand) => {
      store.updateDemand(demand.id, {
        base_pax_day: Math.max(
          0,
          demand.base_pax_day + (con.demandBoostHubs ?? 0),
        ),
      });
    });
  }

  // ── Ledger entry ─────────────────────────────────────────────
  const totalCash = (con.cashDelta ?? 0) + gamblingOutcome;
  store.addLedgerEntries([
    {
      id: `choice-${event.id}-${day}`,
      day,
      type: "event",
      label: `🎯 ${event.title} — ${option.label}`,
      amount: totalCash,
      route_id: null,
    },
  ]);

  // ── Build resolved record ────────────────────────────────────
  const resolved: ResolvedChoice = {
    eventId: event.id,
    chosenOptionId: optionId,
    day,
    consequence: con,
  };

  if (con.revenueMultiplierDays) {
    resolved.revenueMultiplierEndsDay = day + con.revenueMultiplierDays.days;
    resolved.revenueMultiplier = con.revenueMultiplierDays.multiplier;
  }

  store.setPendingChoiceEvent(null);
  store.setActiveChoiceConsequence(resolved);
  store.resumeAfterChoice();

  return resolved;
}

// ─────────────────────────────────────────────────────────────────
// MAIN HOOK
// ─────────────────────────────────────────────────────────────────

export function useDailyEvents() {
  const lastDay = useRef<number>(-1);

  useEffect(() => {
    const unsub = useGameStore.subscribe(
      (s) => s.airline?.day,
      (day) => {
        if (!day || day === lastDay.current) return;
        lastDay.current = day;

        const store = useGameStore.getState();
        const gameSeed = store.airline?.seed ?? "DEFAULT";

        store.setDailyEvent(null);

        // ── Passive event ──────────────────────────────────────
        let event: DailyEvent | null = buildDemandWaveEvent(day);
        if (!event) {
          event = generateDailyEvent(day, gameSeed);
        }

        const ledgerEntry: any = {
          id: event.id,
          day,
          type: "event",
          label: `${
            event.waveKind
              ? "🌊"
              : event.type === "positive"
                ? "⚡"
                : event.type === "negative"
                  ? "🚧"
                  : "📍"
          } ${event.title}`,
          amount: event.cashBonus ?? 0,
          route_id: null,
        };

        if (event.cashBonus) {
          store.earnCash(event.cashBonus);
        }

        store.addLedgerEntries([ledgerEntry]);
        store.setDailyEvent(event);

        // ── Check lingering consequence expiry ─────────────────
        const active = store.activeChoiceConsequence;
        if (
          active?.revenueMultiplierEndsDay &&
          day >= active.revenueMultiplierEndsDay
        ) {
          store.setActiveChoiceConsequence(null);
        }

        // ── Choice event ───────────────────────────────────────
        if (isChoiceEventDay(day)) {
          const previousIds = store.resolvedChoiceEventIds ?? [];
          const choiceEvent = pickChoiceEvent({
            day,
            gameSeed,
            hubCount: store.hubs.length,
            previousEventIds: previousIds,
          });

          if (choiceEvent) {
            store.pauseForChoice();
            store.setPendingChoiceEvent(choiceEvent);
          }
        }
      },
    );

    return () => unsub();
  }, []);
}
