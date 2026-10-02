/**
 * Airline decisions presented every five game days.
 *
 * Every line of player-facing copy maps to a consequence the simulation
 * actually supports. Choices may change cash, hub trust, today's passenger
 * demand, fleet condition, or network revenue for a fixed number of days.
 */

import { seedHash } from "@/lib/seed";

export interface ChoiceConsequence {
  /** Immediate change to airline cash. */
  cashDelta?: number;
  /** Immediate change to every owned hub's trust rating. */
  trustDelta?: number;
  /** Temporary multiplier applied to network revenue. */
  revenueMultiplierDays?: {
    multiplier: number;
    days: number;
  };
  /** Immediate condition change for every owned aircraft. */
  planeConditionDelta?: number;
  /** Passenger change on today's open route opportunities only. */
  demandDeltaToday?: number;
}

export interface ChoiceOption {
  id: "a" | "b";
  label: string;
  desc: string;
  effectSummary: string;
  consequence: ChoiceConsequence;
}

export interface ChoiceEvent {
  id: string;
  icon: string;
  category: "operations" | "finance" | "weather" | "competitor" | "opportunity";
  title: string;
  situation: string;
  options: [ChoiceOption, ChoiceOption];
  minDay?: number;
  minHubs?: number;
}

export interface ResolvedChoice {
  eventId: string;
  chosenOptionId: "a" | "b";
  day: number;
  consequence: ChoiceConsequence;
  revenueMultiplierEndsDay?: number;
  revenueMultiplier?: number;
}

export const CHOICE_EVENT_INTERVAL = 5;
const RECENT_EVENT_LIMIT = 3;

export function isChoiceEventDay(day: number): boolean {
  const safeDay = Math.floor(day);
  return (
    Number.isFinite(safeDay) &&
    safeDay >= CHOICE_EVENT_INTERVAL &&
    safeDay % CHOICE_EVENT_INTERVAL === 0
  );
}

const CHOICE_EVENTS: readonly ChoiceEvent[] = [
  {
    id: "crew_overtime",
    icon: "people-outline",
    category: "operations",
    title: "Crew overtime request",
    situation:
      "Flight crews have worked several busy rotations. You can approve overtime pay or keep the current staffing plan.",
    options: [
      {
        id: "a",
        label: "Approve overtime",
        desc: "Pay the crews now and improve confidence in your operation.",
        effectSummary: "Cash -$30K | Trust +3",
        consequence: {
          cashDelta: -30_000,
          trustDelta: 3,
        },
      },
      {
        id: "b",
        label: "Keep current staffing",
        desc: "Protect your cash, but slower operations reduce revenue briefly.",
        effectSummary: "Revenue -10% for 2 days",
        consequence: {
          revenueMultiplierDays: { multiplier: 0.9, days: 2 },
        },
      },
    ],
  },
  {
    id: "gate_equipment",
    icon: "construct-outline",
    category: "operations",
    title: "Gate equipment failure",
    situation:
      "Boarding equipment has failed at a busy gate. Emergency repairs are available, or crews can board passengers manually.",
    options: [
      {
        id: "a",
        label: "Repair the equipment",
        desc: "Pay for immediate repairs and keep the normal schedule.",
        effectSummary: "Cash -$40K",
        consequence: { cashDelta: -40_000 },
      },
      {
        id: "b",
        label: "Use manual boarding",
        desc: "Save the repair cost, but accept short delays and complaints.",
        effectSummary: "Revenue -8% for 2 days | Trust -1",
        consequence: {
          revenueMultiplierDays: { multiplier: 0.92, days: 2 },
          trustDelta: -1,
        },
      },
    ],
    minHubs: 1,
  },
  {
    id: "fleet_inspection",
    icon: "shield-checkmark-outline",
    category: "operations",
    title: "Fleet inspection",
    situation:
      "Aviation inspectors have requested additional aircraft checks. A thorough inspection takes longer, while an expedited inspection costs cash.",
    options: [
      {
        id: "a",
        label: "Run full inspections",
        desc: "Reduce today's flying and restore aircraft condition.",
        effectSummary: "Revenue -30% today | Condition +12",
        consequence: {
          revenueMultiplierDays: { multiplier: 0.7, days: 1 },
          planeConditionDelta: 12,
        },
      },
      {
        id: "b",
        label: "Pay for expedited checks",
        desc: "Keep the schedule moving with priority inspection teams.",
        effectSummary: "Cash -$25K | Condition +4",
        consequence: {
          cashDelta: -25_000,
          planeConditionDelta: 4,
        },
      },
    ],
    minDay: 5,
  },
  {
    id: "airport_promotion",
    icon: "megaphone-outline",
    category: "finance",
    title: "Airport promotion",
    situation:
      "An airport authority will fund a one-day fare promotion. The grant brings in cash and passengers, but discounted tickets reduce today's revenue per traveler.",
    options: [
      {
        id: "a",
        label: "Join the promotion",
        desc: "Accept the grant and carry more passengers at lower fares today.",
        effectSummary: "Cash +$45K | Demand +15 | Revenue -10% today",
        consequence: {
          cashDelta: 45_000,
          demandDeltaToday: 15,
          revenueMultiplierDays: { multiplier: 0.9, days: 1 },
        },
      },
      {
        id: "b",
        label: "Keep current fares",
        desc: "Decline the grant and continue with the current plan.",
        effectSummary: "No change",
        consequence: {},
      },
    ],
    minDay: 5,
    minHubs: 1,
  },
  {
    id: "fuel_contract",
    icon: "flame-outline",
    category: "finance",
    title: "Fuel supply contract",
    situation:
      "A supplier is offering a short fixed-price fuel contract. The upfront fee lowers operating pressure for the next five days.",
    options: [
      {
        id: "a",
        label: "Sign the contract",
        desc: "Pay the fee now and improve network earnings for five days.",
        effectSummary: "Cash -$20K | Revenue +10% for 5 days",
        consequence: {
          cashDelta: -20_000,
          revenueMultiplierDays: { multiplier: 1.1, days: 5 },
        },
      },
      {
        id: "b",
        label: "Buy fuel as needed",
        desc: "Keep your cash available and continue at normal revenue.",
        effectSummary: "No change",
        consequence: {},
      },
    ],
    minDay: 10,
  },
  {
    id: "investor_funding",
    icon: "trending-up-outline",
    category: "finance",
    title: "Investor funding",
    situation:
      "An investor is offering immediate funding in exchange for a temporary share of network revenue.",
    options: [
      {
        id: "a",
        label: "Accept the funding",
        desc: "Receive cash now and share revenue for five days.",
        effectSummary: "Cash +$80K | Revenue -15% for 5 days",
        consequence: {
          cashDelta: 80_000,
          revenueMultiplierDays: { multiplier: 0.85, days: 5 },
        },
      },
      {
        id: "b",
        label: "Decline the offer",
        desc: "Keep full revenue and grow without outside funding.",
        effectSummary: "No change",
        consequence: {},
      },
    ],
    minDay: 10,
  },
  {
    id: "storm_warning",
    icon: "thunderstorm-outline",
    category: "weather",
    title: "Storm warning",
    situation:
      "Severe weather is approaching your network. You can fund passenger support now or operate a reduced schedule during the disruption.",
    options: [
      {
        id: "a",
        label: "Fund passenger support",
        desc: "Cover rebooking and accommodation costs to protect trust.",
        effectSummary: "Cash -$35K | Trust +3",
        consequence: {
          cashDelta: -35_000,
          trustDelta: 3,
        },
      },
      {
        id: "b",
        label: "Reduce the schedule",
        desc: "Limit spending, but accept lower revenue and passenger frustration.",
        effectSummary: "Revenue -20% for 2 days | Trust -2",
        consequence: {
          revenueMultiplierDays: { multiplier: 0.8, days: 2 },
          trustDelta: -2,
        },
      },
    ],
    minDay: 5,
  },
  {
    id: "ash_cloud",
    icon: "warning-outline",
    category: "weather",
    title: "Ash cloud disruption",
    situation:
      "An ash cloud is affecting a busy corridor. Flights can take longer routes, or passengers can be refunded while service is reduced.",
    options: [
      {
        id: "a",
        label: "Reroute flights",
        desc: "Keep passengers moving with higher operating costs.",
        effectSummary: "Revenue -15% for 3 days",
        consequence: {
          revenueMultiplierDays: { multiplier: 0.85, days: 3 },
        },
      },
      {
        id: "b",
        label: "Refund passengers",
        desc: "Reduce service and cover refunds, but avoid prolonged rerouting.",
        effectSummary: "Cash -$25K | Trust -3",
        consequence: {
          cashDelta: -25_000,
          trustDelta: -3,
        },
      },
    ],
    minDay: 10,
  },
  {
    id: "rival_fare_sale",
    icon: "git-compare-outline",
    category: "competitor",
    title: "Rival fare sale",
    situation:
      "A rival has discounted tickets in your markets. You can match the sale for one day or keep your current fares and lose some bookings.",
    options: [
      {
        id: "a",
        label: "Match the sale",
        desc: "Protect passenger volume at a lower fare today.",
        effectSummary: "Demand +20 | Revenue -10% today",
        consequence: {
          demandDeltaToday: 20,
          revenueMultiplierDays: { multiplier: 0.9, days: 1 },
        },
      },
      {
        id: "b",
        label: "Keep current fares",
        desc: "Protect revenue per traveler, but lose some bookings today.",
        effectSummary: "Demand -15 today",
        consequence: {
          demandDeltaToday: -15,
        },
      },
    ],
    minDay: 10,
    minHubs: 1,
  },
  {
    id: "charter_contract",
    icon: "document-text-outline",
    category: "opportunity",
    title: "Charter contract",
    situation:
      "A corporate client wants reserved aircraft capacity for four days. The contract pays immediately, but less capacity remains for regular passengers.",
    options: [
      {
        id: "a",
        label: "Accept the contract",
        desc: "Receive the contract payment and reduce regular network earnings.",
        effectSummary: "Cash +$75K | Revenue -20% for 4 days",
        consequence: {
          cashDelta: 75_000,
          revenueMultiplierDays: { multiplier: 0.8, days: 4 },
        },
      },
      {
        id: "b",
        label: "Keep regular service",
        desc: "Decline the contract and preserve your current operation.",
        effectSummary: "No change",
        consequence: {},
      },
    ],
    minDay: 10,
  },
  {
    id: "tourism_campaign",
    icon: "earth-outline",
    category: "opportunity",
    title: "Tourism campaign",
    situation:
      "A tourism board wants discounted seats for a one-day campaign. The promotion adds travelers but lowers revenue per passenger today.",
    options: [
      {
        id: "a",
        label: "Join the campaign",
        desc: "Add promotional bookings at a reduced fare today.",
        effectSummary: "Demand +25 | Revenue -8% today",
        consequence: {
          demandDeltaToday: 25,
          revenueMultiplierDays: { multiplier: 0.92, days: 1 },
        },
      },
      {
        id: "b",
        label: "Skip the campaign",
        desc: "Keep normal fares and the current passenger forecast.",
        effectSummary: "No change",
        consequence: {},
      },
    ],
    minDay: 10,
    minHubs: 1,
  },
  {
    id: "service_training",
    icon: "heart-outline",
    category: "opportunity",
    title: "Service training",
    situation:
      "Your operations team is proposing additional passenger-service training. It requires an immediate investment but improves trust across your hubs.",
    options: [
      {
        id: "a",
        label: "Fund the training",
        desc: "Invest in staff and improve passenger trust.",
        effectSummary: "Cash -$35K | Trust +6",
        consequence: {
          cashDelta: -35_000,
          trustDelta: 6,
        },
      },
      {
        id: "b",
        label: "Keep current training",
        desc: "Preserve the budget and make no operational changes.",
        effectSummary: "No change",
        consequence: {},
      },
    ],
    minDay: 10,
    minHubs: 1,
  },
];

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

export function pickChoiceEvent(params: {
  day: number;
  gameSeed: string;
  hubCount: number;
  previousEventIds: readonly string[];
}): ChoiceEvent | null {
  const day = Math.floor(params.day);
  if (!isChoiceEventDay(day)) return null;

  const hubCount = Math.max(0, Math.floor(params.hubCount));
  const eligible = CHOICE_EVENTS.filter((event) => {
    if (event.minDay !== undefined && day < event.minDay) return false;
    if (event.minHubs !== undefined && hubCount < event.minHubs) return false;
    return true;
  });
  if (eligible.length === 0) return null;

  const history = uniqueIds(params.previousEventIds);
  const seen = new Set(history);
  const unseen = eligible.filter((event) => !seen.has(event.id));
  const recent = new Set(history.slice(-RECENT_EVENT_LIMIT));
  const nonRecent = eligible.filter((event) => !recent.has(event.id));
  const pool =
    unseen.length > 0 ? unseen : nonRecent.length > 0 ? nonRecent : eligible;
  const gameSeed = params.gameSeed.trim() || "DEFAULT";
  const index = seedHash(gameSeed, "choice-event", day) % pool.length;

  return pool[index];
}
