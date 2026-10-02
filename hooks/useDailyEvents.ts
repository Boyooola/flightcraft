/**
 * Daily operating conditions, demand waves, and player decisions.
 *
 * A daily event is deterministic for a given airline seed and day. A small
 * device receipt prevents cash awards and demand waves from being applied
 * again when the game screen remounts or the app is reopened on the same day.
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
  type AppliedDemandWave,
  type DemandWaveKind,
} from "@/lib/demandWaves";
import { seedHash } from "@/lib/seed";
import { useGameStore } from "@/store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef } from "react";

export interface DailyEvent {
  id: string;
  day: number;
  type: "positive" | "negative" | "neutral";
  icon: string;
  title: string;
  desc: string;
  effect: string;
  revenueMultiplier?: number;
  cashBonus?: number;
  waveKind?: DemandWaveKind;
  waveAddedPax?: number;
  waveAffectedSlots?: number;
  waveAffectedHubs?: string[];
}

interface DailyEventReceipt {
  version: 1;
  day: number;
  event: DailyEvent;
  activeDemandWave: AppliedDemandWave | null;
}

interface ChoiceEventReceipt {
  version: 1;
  day: number;
  eventId: string;
}

interface BuiltDailyEvent {
  event: DailyEvent;
  activeDemandWave: AppliedDemandWave | null;
}

const DAILY_EVENT_KEY = "@flightcraft/daily-event";
const CHOICE_EVENT_KEY = "@flightcraft/choice-event";

const POSITIVE_EVENTS: Omit<DailyEvent, "id" | "day">[] = [
  {
    type: "positive",
    icon: "flash-outline",
    title: "Passenger rush",
    desc: "More travelers are booking flights across the network today.",
    effect: "Revenue up 25% today",
    revenueMultiplier: 1.25,
  },
  {
    type: "positive",
    icon: "people-circle-outline",
    title: "Full terminals",
    desc: "Strong bookings are lifting revenue on every active route.",
    effect: "Revenue up 20% today",
    revenueMultiplier: 1.2,
  },
  {
    type: "positive",
    icon: "sunny-outline",
    title: "Smooth operations",
    desc: "Clear conditions are keeping flights on schedule today.",
    effect: "Revenue up 15% today",
    revenueMultiplier: 1.15,
  },
  {
    type: "positive",
    icon: "cash-outline",
    title: "Airport incentive",
    desc: "Partner airports have issued a one-time service incentive.",
    effect: "$25,000 received",
    cashBonus: 25_000,
  },
  {
    type: "positive",
    icon: "speedometer-outline",
    title: "Efficient turnaround",
    desc: "Ground crews are completing turnarounds ahead of schedule.",
    effect: "Revenue up 30% today",
    revenueMultiplier: 1.3,
  },
  {
    type: "positive",
    icon: "heart-outline",
    title: "Strong bookings",
    desc: "Recent service quality is translating into better sales today.",
    effect: "Revenue up 18% today",
    revenueMultiplier: 1.18,
  },
];

const NEGATIVE_EVENTS: Omit<DailyEvent, "id" | "day">[] = [
  {
    type: "negative",
    icon: "alert-circle-outline",
    title: "Airport congestion",
    desc: "Long queues are reducing revenue across active routes today.",
    effect: "Revenue down 15% today",
    revenueMultiplier: 0.85,
  },
  {
    type: "negative",
    icon: "thunderstorm-outline",
    title: "Severe weather",
    desc: "Storms are disrupting operations across the network.",
    effect: "Revenue down 20% today",
    revenueMultiplier: 0.8,
  },
  {
    type: "negative",
    icon: "construct-outline",
    title: "Gate delays",
    desc: "Equipment issues are slowing departures at several airports.",
    effect: "Revenue down 12% today",
    revenueMultiplier: 0.88,
  },
  {
    type: "negative",
    icon: "flame-outline",
    title: "Fuel price increase",
    desc: "Higher fuel prices are cutting into today's route earnings.",
    effect: "Revenue down 18% today",
    revenueMultiplier: 0.82,
  },
  {
    type: "negative",
    icon: "warning-outline",
    title: "Terminal disruption",
    desc: "An unplanned terminal closure has triggered additional costs.",
    effect: "$15,000 operating cost",
    cashBonus: -15_000,
  },
];

const NEUTRAL_EVENTS: Omit<DailyEvent, "id" | "day">[] = [
  {
    type: "neutral",
    icon: "map-outline",
    title: "Travel patterns shifting",
    desc: "Passenger interest is moving between destinations today.",
    effect: "No immediate impact",
  },
  {
    type: "neutral",
    icon: "business-outline",
    title: "Airport expansion",
    desc: "A regional airport has announced plans to add more gates.",
    effect: "No immediate impact",
  },
  {
    type: "neutral",
    icon: "swap-horizontal-outline",
    title: "Market update",
    desc: "Passenger preferences are changing across the network.",
    effect: "No immediate impact",
  },
];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function receiptKey(prefix: string, airlineId: string): string {
  return `${prefix}/${airlineId}`;
}

function parseDailyReceipt(raw: string | null): DailyEventReceipt | null {
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as Partial<DailyEventReceipt>;
    if (
      value.version !== 1 ||
      !Number.isInteger(value.day) ||
      !value.event ||
      value.event.day !== value.day ||
      typeof value.event.id !== "string"
    ) {
      return null;
    }

    return value as DailyEventReceipt;
  } catch {
    return null;
  }
}

function parseChoiceReceipt(raw: string | null): ChoiceEventReceipt | null {
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as Partial<ChoiceEventReceipt>;
    if (
      value.version !== 1 ||
      !Number.isInteger(value.day) ||
      typeof value.eventId !== "string"
    ) {
      return null;
    }

    return value as ChoiceEventReceipt;
  } catch {
    return null;
  }
}

export function generateDailyEvent(
  day: number,
  gameSeed: string = "DEFAULT",
): DailyEvent {
  const roll = seedHash(gameSeed, "daily-event-roll", day) % 100;
  const pick = (events: Omit<DailyEvent, "id" | "day">[]) =>
    events[seedHash(gameSeed, "daily-event-pick", day) % events.length];

  let base: Omit<DailyEvent, "id" | "day">;
  if (roll < 55) base = pick(POSITIVE_EVENTS);
  else if (roll < 85) base = pick(NEGATIVE_EVENTS);
  else base = pick(NEUTRAL_EVENTS);

  return { ...base, id: `event-day-${day}`, day };
}

function buildDemandWaveEvent(day: number): BuiltDailyEvent | null {
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
      event: {
        id: `wave-empty-${day}`,
        day,
        type: "neutral",
        icon: wave.icon,
        title: wave.title,
        desc: "Today's demand wave found no open route opportunities.",
        effect: "No open opportunities affected",
        waveKind: wave.kind,
        waveAddedPax: 0,
        waveAffectedSlots: 0,
        waveAffectedHubs: [],
      },
      activeDemandWave: null,
    };
  }

  applied.updates.forEach((update) => {
    store.updateDemand(update.demandId, {
      base_pax_day: update.newPaxDay,
      pax_ceiling: update.newPaxDay,
    });
  });

  const hubLabel =
    applied.affectedHubs.length > 0
      ? ` Affected hubs: ${applied.affectedHubs.join(", ")}.`
      : "";

  return {
    event: {
      id: applied.wave.id,
      day,
      type: "positive",
      icon: applied.wave.icon,
      title: applied.wave.title,
      desc: `${applied.wave.desc}${hubLabel}`,
      effect: `${applied.totalAddedPax.toLocaleString()} additional passengers across ${applied.updates.length} ${applied.updates.length === 1 ? "opportunity" : "opportunities"}`,
      waveKind: applied.wave.kind,
      waveAddedPax: applied.totalAddedPax,
      waveAffectedSlots: applied.updates.length,
      waveAffectedHubs: applied.affectedHubs,
    },
    activeDemandWave: applied,
  };
}

function resolvedChoiceWithoutEffects(
  event: ChoiceEvent,
  optionId: "a" | "b",
  day: number,
): ResolvedChoice {
  const option = event.options.find((candidate) => candidate.id === optionId);
  if (!option) throw new Error(`Choice option ${optionId} is unavailable.`);

  const resolved: ResolvedChoice = {
    eventId: event.id,
    chosenOptionId: optionId,
    day,
    consequence: option.consequence,
  };

  if (option.consequence.revenueMultiplierDays) {
    resolved.revenueMultiplierEndsDay =
      day + option.consequence.revenueMultiplierDays.days;
    resolved.revenueMultiplier =
      option.consequence.revenueMultiplierDays.multiplier;
  }

  return resolved;
}

export function resolveChoiceEvent(
  event: ChoiceEvent,
  optionId: "a" | "b",
): ResolvedChoice {
  const store = useGameStore.getState();
  const day = store.airline?.day ?? 1;
  const resolved = resolvedChoiceWithoutEffects(event, optionId, day);
  const ledgerId = `choice-${event.id}-${day}`;

  // A fast double tap can invoke the handler twice before React rerenders.
  // Return the first result without applying money, trust, or demand twice.
  if (
    store.ledger.some((entry) => entry.id === ledgerId) ||
    (store.activeChoiceConsequence?.eventId === event.id &&
      store.activeChoiceConsequence.day === day)
  ) {
    return store.activeChoiceConsequence?.eventId === event.id
      ? store.activeChoiceConsequence
      : resolved;
  }

  if (store.pendingChoiceEvent?.id !== event.id) return resolved;

  const consequence = resolved.consequence;
  const option = event.options.find((candidate) => candidate.id === optionId)!;

  if (consequence.cashDelta) store.earnCash(consequence.cashDelta);

  if (consequence.trustDelta) {
    store.hubs.forEach((hub) => {
      store.updateHub(hub.id, {
        trust: clamp(hub.trust + consequence.trustDelta!, 0, 100),
      });
    });
  }

  if (consequence.planeConditionDelta) {
    store.ownedPlanes.forEach((plane) => {
      store.updateOwnedPlane(plane.id, {
        condition: clamp(
          (plane.condition ?? 100) + consequence.planeConditionDelta!,
          0,
          100,
        ),
      });
    });
  }

  // Demand changes affect today's open opportunities only. Tomorrow's daily
  // market generation restores each route to its stable OD baseline.
  if (consequence.demandDeltaToday) {
    store.demands
      .filter((demand) => demand.status === "pending")
      .forEach((demand) => {
        const nextDemand = Math.max(
          0,
          Math.round(demand.base_pax_day + consequence.demandDeltaToday!),
        );
        store.updateDemand(demand.id, {
          base_pax_day: nextDemand,
          pax_ceiling: nextDemand,
        });
      });
  }

  store.addLedgerEntries([
    {
      id: ledgerId,
      day,
      type: "event",
      label: `${event.title}: ${option.label}`,
      amount: consequence.cashDelta ?? 0,
      route_id: null,
    },
  ]);

  const airlineId = store.airline?.id;
  if (airlineId) {
    const receipt: ChoiceEventReceipt = {
      version: 1,
      day,
      eventId: event.id,
    };
    void AsyncStorage.setItem(
      receiptKey(CHOICE_EVENT_KEY, airlineId),
      JSON.stringify(receipt),
    ).catch((error) => {
      console.warn("[daily-events] failed to save choice receipt", error);
    });
  }

  store.setActiveChoiceConsequence(resolved);
  store.setResolvedChoiceEventIds([
    ...store.resolvedChoiceEventIds.filter((id) => id !== event.id),
    event.id,
  ]);

  return resolved;
}

async function wasChoiceResolvedToday(
  airlineId: string,
  day: number,
): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(
      receiptKey(CHOICE_EVENT_KEY, airlineId),
    );
    return parseChoiceReceipt(raw)?.day === day;
  } catch (error) {
    console.warn("[daily-events] failed to read choice receipt", error);
    return false;
  }
}

export function useDailyEvents() {
  const lastDay = useRef(-1);
  const airlineId = useGameStore((state) => state.airline?.id);
  const day = useGameStore((state) => state.airline?.day);
  const phase = useGameStore((state) => state.phase);
  const loadComplete = useGameStore((state) => state.loadComplete);

  useEffect(() => {
    if (!airlineId || !day || !loadComplete || phase !== "playing") return;
    if (day === lastDay.current) return;

    const initialStore = useGameStore.getState();
    if (initialStore.dailyEvent?.day === day) {
      lastDay.current = day;
      return;
    }

    lastDay.current = day;
    let cancelled = false;

    const startDay = async () => {
      const key = receiptKey(DAILY_EVENT_KEY, airlineId);
      let previousReceipt: DailyEventReceipt | null = null;

      try {
        previousReceipt = parseDailyReceipt(await AsyncStorage.getItem(key));
      } catch (error) {
        console.warn("[daily-events] failed to read daily receipt", error);
      }

      if (cancelled) return;

      const store = useGameStore.getState();
      if (store.airline?.id !== airlineId || store.airline.day !== day) return;

      store.setDailyEvent(null);
      store.setActiveDemandWave(null);

      if (previousReceipt?.day === day) {
        store.setDailyEvent(previousReceipt.event);
        store.setActiveDemandWave(previousReceipt.activeDemandWave);
      } else {
        const gameSeed = store.airline.seed || "DEFAULT";
        const built = buildDemandWaveEvent(day) ?? {
          event: generateDailyEvent(day, gameSeed),
          activeDemandWave: null,
        };

        if (built.event.cashBonus) store.earnCash(built.event.cashBonus);

        store.addLedgerEntries([
          {
            id: built.event.id,
            day,
            type: "event",
            label: built.event.title,
            amount: built.event.cashBonus ?? 0,
            route_id: null,
          },
        ]);
        store.setActiveDemandWave(built.activeDemandWave);
        store.setDailyEvent(built.event);

        const receipt: DailyEventReceipt = {
          version: 1,
          day,
          event: built.event,
          activeDemandWave: built.activeDemandWave,
        };
        try {
          await AsyncStorage.setItem(key, JSON.stringify(receipt));
        } catch (error) {
          console.warn("[daily-events] failed to save daily receipt", error);
        }
      }

      if (cancelled) return;

      const current = useGameStore.getState();
      const active = current.activeChoiceConsequence;
      if (
        active?.revenueMultiplierEndsDay !== undefined &&
        day >= active.revenueMultiplierEndsDay
      ) {
        current.setActiveChoiceConsequence(null);
      }

      if (!isChoiceEventDay(day) || current.pendingChoiceEvent) return;
      if (await wasChoiceResolvedToday(airlineId, day)) return;
      if (cancelled) return;

      const latest = useGameStore.getState();
      if (latest.airline?.id !== airlineId || latest.airline.day !== day)
        return;

      const choiceEvent = pickChoiceEvent({
        day,
        gameSeed: latest.airline.seed || "DEFAULT",
        hubCount: latest.hubs.length,
        previousEventIds: latest.resolvedChoiceEventIds,
      });

      if (choiceEvent) {
        latest.pauseForChoice();
        latest.setPendingChoiceEvent(choiceEvent);
      }
    };

    void startDay();
    return () => {
      cancelled = true;
    };
  }, [airlineId, day, loadComplete, phase]);
}
