/**
 * lib/choiceEvents.ts
 *
 * Choice events — situations that pause the game and ask the
 * player to pick between two options with real tradeoffs.
 *
 * Design rules:
 *   - Both options must feel viable (no obvious correct answer)
 *   - At least one option should have a delayed/lingering effect
 *   - Consequences reference real game state (hubs, planes, cash)
 *   - Flavor text should feel like a real airline CEO moment
 *
 * Fires every CHOICE_EVENT_INTERVAL days alongside the normal
 * daily event, seeded deterministically so replays are consistent.
 */

import { seedHash } from "@/lib/seed";

// ─────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────

export interface ChoiceConsequence {
  cashDelta?: number; // immediate cash change
  trustDelta?: number; // applied to ALL owned hubs
  revenueMultiplierDays?: {
    // revenue multiplier for N days
    multiplier: number;
    days: number;
  };
  conditionHitAllPlanes?: number; // subtract from every plane's condition
  cashBonusChance?: {
    // gambling mechanic: % chance of cashBonus
    chance: number; // 0-1
    bonus: number;
    failPenalty: number;
  };
  demandBoostHubs?: number; // +N base_pax_day to all hub demands
}

export interface ChoiceOption {
  id: "a" | "b";
  label: string; // button label, short
  desc: string; // one sentence explaining the trade
  effectSummary: string; // shown in result card, e.g. "+Trust · -$40K"
  consequence: ChoiceConsequence;
}

export interface ChoiceEvent {
  id: string;
  icon: string; // Ionicon name
  category: "operations" | "finance" | "weather" | "competitor" | "opportunity";
  title: string;
  situation: string; // 2-3 sentence setup
  options: [ChoiceOption, ChoiceOption];
  // minimum day before this can fire
  minDay?: number;
  // requires at least N hubs
  minHubs?: number;
}

export interface ResolvedChoice {
  eventId: string;
  chosenOptionId: "a" | "b";
  day: number;
  consequence: ChoiceConsequence;
  // lingering revenue multiplier tracked separately
  revenueMultiplierEndsDay?: number;
  revenueMultiplier?: number;
}

// ─────────────────────────────────────────────────────────────────
// INTERVAL — fires every N days
// ─────────────────────────────────────────────────────────────────

export const CHOICE_EVENT_INTERVAL = 5;

export function isChoiceEventDay(day: number): boolean {
  return day >= 3 && day % CHOICE_EVENT_INTERVAL === 0;
}

// ─────────────────────────────────────────────────────────────────
// EVENT LIBRARY
// ─────────────────────────────────────────────────────────────────

const CHOICE_EVENTS: ChoiceEvent[] = [
  // ── OPERATIONS ───────────────────────────────────────────────

  {
    id: "pilot_overtime",
    icon: "people-outline",
    category: "operations",
    title: "Pilot Overtime Request",
    situation:
      "Your flight crews are requesting overtime pay after a busy stretch of days. Approving costs money upfront but keeps morale high. Refusing risks slower boarding and passenger complaints.",
    options: [
      {
        id: "a",
        label: "Approve overtime",
        desc: "Pay the crews. Passengers board faster, trust improves.",
        effectSummary: "-$30K · Trust +4 all hubs",
        consequence: {
          cashDelta: -30_000,
          trustDelta: 4,
        },
      },
      {
        id: "b",
        label: "Deny for now",
        desc: "Hold the line on costs. Crews will slow down for 3 days.",
        effectSummary: "-12% revenue · 3 days",
        consequence: {
          revenueMultiplierDays: { multiplier: 0.88, days: 3 },
        },
      },
    ],
  },

  {
    id: "gate_maintenance",
    icon: "construct-outline",
    category: "operations",
    title: "Gate Equipment Failure",
    situation:
      "Boarding equipment at your busiest hub has failed. You can pay for emergency repairs now, or reroute passengers manually — slower but cheaper.",
    options: [
      {
        id: "a",
        label: "Emergency repair",
        desc: "Back to normal by tomorrow. Expensive but clean.",
        effectSummary: "-$45K · No disruption",
        consequence: { cashDelta: -45_000 },
      },
      {
        id: "b",
        label: "Manual boarding",
        desc: "Save the cash, absorb slower throughput for 2 days.",
        effectSummary: "-10% revenue · 2 days · Trust -2",
        consequence: {
          revenueMultiplierDays: { multiplier: 0.9, days: 2 },
          trustDelta: -2,
        },
      },
    ],
    minHubs: 1,
  },

  {
    id: "plane_inspection",
    icon: "shield-checkmark-outline",
    category: "operations",
    title: "Unscheduled Fleet Inspection",
    situation:
      "Aviation authorities have requested an unscheduled inspection of your fleet. You can ground all planes for one day to comply fully, or submit paperwork and keep flying with a small fine.",
    options: [
      {
        id: "a",
        label: "Ground for inspection",
        desc: "Full compliance. No revenue today but planes come back in perfect shape.",
        effectSummary: "-100% revenue today · Condition +15 all planes",
        consequence: {
          revenueMultiplierDays: { multiplier: 0.0, days: 1 },
          conditionHitAllPlanes: -15, // negative = restore
        },
      },
      {
        id: "b",
        label: "Pay the fine",
        desc: "Keep flying, take the paperwork hit.",
        effectSummary: "-$25K · No disruption",
        consequence: { cashDelta: -25_000 },
      },
    ],
    minDay: 5,
  },

  // ── FINANCE ──────────────────────────────────────────────────

  {
    id: "airport_rebate",
    icon: "cash-outline",
    category: "finance",
    title: "Airport Rebate Offer",
    situation:
      "An airport authority is offering a cash rebate to airlines that commit to serving their hub for the next 30 days. The commitment comes with reputational strings if you pull out early.",
    options: [
      {
        id: "a",
        label: "Accept the rebate",
        desc: "Take the cash now. You're committed to this hub.",
        effectSummary: "+$60K now",
        consequence: { cashDelta: 60_000 },
      },
      {
        id: "b",
        label: "Stay flexible",
        desc: "No cash, but no strings. Freedom to change strategy.",
        effectSummary: "No effect · Full flexibility",
        consequence: {},
      },
    ],
    minDay: 7,
  },

  {
    id: "fuel_hedge",
    icon: "flame-outline",
    category: "finance",
    title: "Fuel Hedging Opportunity",
    situation:
      "Your fuel broker is offering a hedging contract — pay a fixed premium now and lock in current fuel prices for the next week, protecting against spikes.",
    options: [
      {
        id: "a",
        label: "Hedge fuel costs",
        desc: "Pay upfront, guaranteed stable costs for 7 days.",
        effectSummary: "-$20K · +15% revenue · 7 days",
        consequence: {
          cashDelta: -20_000,
          revenueMultiplierDays: { multiplier: 1.15, days: 7 },
        },
      },
      {
        id: "b",
        label: "Take the risk",
        desc: "Gamble on fuel staying stable. Could go either way.",
        effectSummary: "70% chance +$0 · 30% chance -$35K",
        consequence: {
          cashBonusChance: {
            chance: 0.3,
            bonus: 0,
            failPenalty: -35_000,
          },
        },
      },
    ],
    minDay: 5,
  },

  {
    id: "investor_offer",
    icon: "trending-up-outline",
    category: "finance",
    title: "Angel Investor Interest",
    situation:
      "A private investor has reached out. They'll inject cash into your airline in exchange for a share of future revenue for 5 days. Fast cash, slow burn.",
    options: [
      {
        id: "a",
        label: "Take the investment",
        desc: "Immediate cash, but revenue share for the next 5 days.",
        effectSummary: "+$80K now · -20% revenue · 5 days",
        consequence: {
          cashDelta: 80_000,
          revenueMultiplierDays: { multiplier: 0.8, days: 5 },
        },
      },
      {
        id: "b",
        label: "Pass",
        desc: "Keep full revenue. Build it yourself.",
        effectSummary: "No effect",
        consequence: {},
      },
    ],
    minDay: 10,
  },

  // ── WEATHER ──────────────────────────────────────────────────

  {
    id: "storm_decision",
    icon: "thunderstorm-outline",
    category: "weather",
    title: "Storm Warning",
    situation:
      "A significant storm system is moving toward your hub region. You can proactively cancel flights and issue refunds — costly but preserves trust. Or keep flying and hope it passes.",
    options: [
      {
        id: "a",
        label: "Cancel proactively",
        desc: "Issue refunds. Passengers appreciate the transparency.",
        effectSummary: "-$50K · Trust +6 all hubs",
        consequence: {
          cashDelta: -50_000,
          trustDelta: 6,
        },
      },
      {
        id: "b",
        label: "Keep flying",
        desc: "Risk it. 50% chance the storm misses, 50% chance it doesn't.",
        effectSummary: "50% no impact · 50% -25% revenue · 2 days + Trust -5",
        consequence: {
          cashBonusChance: {
            chance: 0.5,
            bonus: 0,
            failPenalty: 0,
          },
          revenueMultiplierDays: { multiplier: 0.75, days: 2 },
          trustDelta: -5,
        },
      },
    ],
    minDay: 3,
  },

  {
    id: "volcanic_ash",
    icon: "warning-outline",
    category: "weather",
    title: "Volcanic Ash Cloud",
    situation:
      "An ash cloud from a distant volcano is drifting across one of your busiest corridors. You can reroute all affected flights through a longer path, or suspend that corridor temporarily.",
    options: [
      {
        id: "a",
        label: "Reroute flights",
        desc: "Longer paths mean higher fuel costs for 3 days.",
        effectSummary: "-18% revenue · 3 days",
        consequence: {
          revenueMultiplierDays: { multiplier: 0.82, days: 3 },
        },
      },
      {
        id: "b",
        label: "Suspend corridor",
        desc: "Ground affected routes entirely. Passengers wait but planes are safe.",
        effectSummary: "-$40K · Trust -3",
        consequence: {
          cashDelta: -40_000,
          trustDelta: -3,
        },
      },
    ],
    minDay: 4,
  },

  // ── COMPETITOR ───────────────────────────────────────────────

  {
    id: "rival_price_war",
    icon: "git-compare-outline",
    category: "competitor",
    title: "Rival Price War",
    situation:
      "A competitor airline has slashed fares on three of your most profitable routes. You can match their pricing to defend market share, or hold your premium and accept lower load factors.",
    options: [
      {
        id: "a",
        label: "Match their fares",
        desc: "Protect passenger volume. Revenue per seat drops.",
        effectSummary: "-15% revenue · 4 days · Demand +20%",
        consequence: {
          revenueMultiplierDays: { multiplier: 0.85, days: 4 },
          demandBoostHubs: 30,
        },
      },
      {
        id: "b",
        label: "Hold premium",
        desc: "Keep your fares. Lose some passengers, keep your margin.",
        effectSummary: "No revenue change · Some demand loss",
        consequence: {
          demandBoostHubs: -20,
        },
      },
    ],
    minDay: 6,
    minHubs: 2,
  },

  {
    id: "rival_hub_sale",
    icon: "business-outline",
    category: "competitor",
    title: "Rival Airline in Trouble",
    situation:
      "A struggling competitor is selling off one of their hubs at a discount. You can acquire their route rights for a one-time fee, instantly inheriting passenger demand.",
    options: [
      {
        id: "a",
        label: "Acquire the routes",
        desc: "Pay up and instantly gain new demand across your network.",
        effectSummary: "-$70K · Demand +50 all hubs",
        consequence: {
          cashDelta: -70_000,
          demandBoostHubs: 50,
        },
      },
      {
        id: "b",
        label: "Let it go",
        desc: "A competitor might grab it instead. You save the cash.",
        effectSummary: "No effect",
        consequence: {},
      },
    ],
    minDay: 10,
    minHubs: 1,
  },

  // ── OPPORTUNITY ──────────────────────────────────────────────

  {
    id: "charter_contract",
    icon: "document-text-outline",
    category: "opportunity",
    title: "Charter Flight Contract",
    situation:
      "A corporate client wants to charter your aircraft for a week of exclusive flights. The pay is excellent but your planes won't be available for regular routes during that time.",
    options: [
      {
        id: "a",
        label: "Accept contract",
        desc: "Great money, but regular passengers wait.",
        effectSummary: "+$90K now · -25% revenue · 7 days",
        consequence: {
          cashDelta: 90_000,
          revenueMultiplierDays: { multiplier: 0.75, days: 7 },
        },
      },
      {
        id: "b",
        label: "Decline",
        desc: "Keep serving regular routes. Steady and reliable.",
        effectSummary: "No effect",
        consequence: {},
      },
    ],
    minDay: 7,
  },

  {
    id: "tourism_partnership",
    icon: "earth-outline",
    category: "opportunity",
    title: "Tourism Board Partnership",
    situation:
      "A regional tourism authority wants to partner with your airline to boost travel to their destinations. They'll subsidize marketing in exchange for a revenue share.",
    options: [
      {
        id: "a",
        label: "Partner up",
        desc: "More passengers come your way, but you share the upside.",
        effectSummary: "Demand +40 all hubs · -10% revenue · 5 days",
        consequence: {
          demandBoostHubs: 40,
          revenueMultiplierDays: { multiplier: 0.9, days: 5 },
        },
      },
      {
        id: "b",
        label: "Go independent",
        desc: "Full margin, no marketing boost.",
        effectSummary: "No effect",
        consequence: {},
      },
    ],
    minDay: 5,
    minHubs: 1,
  },

  {
    id: "loyalty_campaign",
    icon: "heart-outline",
    category: "opportunity",
    title: "Loyalty Campaign",
    situation:
      "Your marketing team wants to run a 'fly more, earn more' campaign. It costs money to set up but converts casual passengers into repeat flyers.",
    options: [
      {
        id: "a",
        label: "Run the campaign",
        desc: "Invest now, reap rewards later. Trust and demand both rise.",
        effectSummary: "-$35K · Trust +8 all hubs · Demand +25",
        consequence: {
          cashDelta: -35_000,
          trustDelta: 8,
          demandBoostHubs: 25,
        },
      },
      {
        id: "b",
        label: "Not right now",
        desc: "Save the budget. Organic growth only.",
        effectSummary: "No effect",
        consequence: {},
      },
    ],
    minDay: 8,
    minHubs: 1,
  },
];

// ─────────────────────────────────────────────────────────────────
// SELECTOR — picks an appropriate event for today
// ─────────────────────────────────────────────────────────────────

export function pickChoiceEvent(params: {
  day: number;
  gameSeed: string;
  hubCount: number;
  previousEventIds: string[];
}): ChoiceEvent | null {
  const { day, gameSeed, hubCount, previousEventIds } = params;

  if (!isChoiceEventDay(day)) return null;

  // Filter to events valid for current game state
  const eligible = CHOICE_EVENTS.filter((e) => {
    if (e.minDay && day < e.minDay) return false;
    if (e.minHubs && hubCount < e.minHubs) return false;
    // Don't repeat recent events (last 3)
    const recentIds = previousEventIds.slice(-3);
    if (recentIds.includes(e.id)) return false;
    return true;
  });

  if (eligible.length === 0) return CHOICE_EVENTS[0]; // fallback

  const idx = seedHash(gameSeed, "choice-event-pick", day) % eligible.length;
  return eligible[idx];
}
