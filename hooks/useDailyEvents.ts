/**
 * hooks/useDailyEvents.ts
 *
 * Generates a random event each game-day that affects the airline.
 * Events are shown as a card on the map at day advance.
 * Seeded by day number — same day always produces same event type.
 *
 * Event categories:
 *   POSITIVE  — passenger boom, tailwind, government contract, tourism surge
 *   NEGATIVE  — fuel surge, fog delay, storm, maintenance issue
 *   NEUTRAL   — regulatory change, new competitor, airport expansion
 */

import { useGameStore } from "@/store";
import { useEffect, useRef } from "react";

export interface DailyEvent {
  id: string;
  type: "positive" | "negative" | "neutral";
  icon: string;
  title: string;
  desc: string;
  effect: string; // human-readable effect
  revenueMultiplier?: number; // applied to all routes this day
  cashBonus?: number; // one-time cash
}

// ─────────────────────────────────────────────────────────────────
// EVENT POOL
// ─────────────────────────────────────────────────────────────────

const POSITIVE_EVENTS: Omit<DailyEvent, "id">[] = [
  {
    type: "positive",
    icon: "people-circle-outline",
    title: "Passenger Boom",
    desc: "A major holiday weekend drives record bookings across your network.",
    effect: "+20% revenue today",
    revenueMultiplier: 1.2,
  },
  {
    type: "positive",
    icon: "sunny-outline",
    title: "Perfect Flying Conditions",
    desc: "Clear skies and tailwinds across all your routes today.",
    effect: "+15% revenue today",
    revenueMultiplier: 1.15,
  },
  {
    type: "positive",
    icon: "ribbon-outline",
    title: "Government Travel Contract",
    desc: "A government agency books seats on your routes for official travel.",
    effect: "+$50,000 bonus",
    cashBonus: 50_000,
  },
  {
    type: "positive",
    icon: "globe-outline",
    title: "Tourism Surge",
    desc: "A viral travel article sends tourists flooding to your destinations.",
    effect: "+25% revenue today",
    revenueMultiplier: 1.25,
  },
  {
    type: "positive",
    icon: "trophy-outline",
    title: "Best Regional Airline Award",
    desc: "FlightCraft wins a regional aviation award. Bookings spike.",
    effect: "+$30,000 bonus",
    cashBonus: 30_000,
  },
  {
    type: "positive",
    icon: "card-outline",
    title: "Corporate Deal Signed",
    desc: "A major corporation signs a deal for regular business travel.",
    effect: "+18% revenue today",
    revenueMultiplier: 1.18,
  },
  {
    type: "positive",
    icon: "airplane-outline",
    title: "Competitor Grounded",
    desc: "A rival airline is temporarily suspended. Passengers flock to you.",
    effect: "+30% revenue today",
    revenueMultiplier: 1.3,
  },
  {
    type: "positive",
    icon: "star-outline",
    title: "5-Star Review Viral Moment",
    desc: "A passenger's viral post about your service drives bookings.",
    effect: "+$20,000 bonus",
    cashBonus: 20_000,
  },
  {
    type: "positive",
    icon: "flash-outline",
    title: "Holiday Season Rush",
    desc: "Peak travel season sends bookings surging across all routes.",
    effect: "+35% revenue today",
    revenueMultiplier: 1.35,
  },
  {
    type: "positive",
    icon: "airplane-outline",
    title: "New Airport Terminal Opens",
    desc: "A gleaming new terminal at your hub boosts passenger confidence.",
    effect: "+$40,000 bonus",
    cashBonus: 40_000,
  },
  {
    type: "positive",
    icon: "heart-outline",
    title: "Passenger Loyalty Spike",
    desc: "Your frequent flyer members book extra trips this week.",
    effect: "+22% revenue today",
    revenueMultiplier: 1.22,
  },
  {
    type: "positive",
    icon: "cash-outline",
    title: "Fuel Subsidy Program",
    desc: "Government fuel subsidies slash your operating costs today.",
    effect: "+$35,000 bonus",
    cashBonus: 35_000,
  },
  {
    type: "positive",
    icon: "earth-outline",
    title: "International Sports Event",
    desc: "A major international event brings thousands of visitors to your destinations.",
    effect: "+28% revenue today",
    revenueMultiplier: 1.28,
  },
];

const NEGATIVE_EVENTS: Omit<DailyEvent, "id">[] = [
  {
    type: "negative",
    icon: "flame-outline",
    title: "Fuel Price Surge",
    desc: "Global oil markets spike. Operating costs rise sharply today.",
    effect: "-20% revenue today",
    revenueMultiplier: 0.8,
  },
  {
    type: "negative",
    icon: "cloudy-outline",
    title: "Fog Delays",
    desc: "Dense fog grounds flights across multiple hubs. Passengers reroute.",
    effect: "-15% revenue today",
    revenueMultiplier: 0.85,
  },
  {
    type: "negative",
    icon: "thunderstorm-outline",
    title: "Storm System",
    desc: "A severe weather system disrupts schedules across your network.",
    effect: "-25% revenue today",
    revenueMultiplier: 0.75,
  },
  {
    type: "negative",
    icon: "construct-outline",
    title: "Unexpected Maintenance",
    desc: "A fleet-wide inspection is required. Reduced capacity today.",
    effect: "-$25,000 emergency cost",
    cashBonus: -25_000,
  },
  {
    type: "negative",
    icon: "alert-circle-outline",
    title: "Air Traffic Control Strike",
    desc: "ATC workers strike at key airports. Delays ripple across the network.",
    effect: "-18% revenue today",
    revenueMultiplier: 0.82,
  },
  {
    type: "negative",
    icon: "trending-down-outline",
    title: "Passenger Confidence Dip",
    desc: "Industry-wide safety concerns reduce travel demand temporarily.",
    effect: "-12% revenue today",
    revenueMultiplier: 0.88,
  },
  {
    type: "negative",
    icon: "bug-outline",
    title: "IT System Outage",
    desc: "A software glitch disrupts check-in systems for hours.",
    effect: "-$15,000 emergency cost",
    cashBonus: -15_000,
  },
  {
    type: "negative",
    icon: "snow-outline",
    title: "Winter Storm Warning",
    desc: "Severe winter weather grounds flights across northern routes.",
    effect: "-20% revenue today",
    revenueMultiplier: 0.8,
  },
  {
    type: "negative",
    icon: "warning-outline",
    title: "Runway Closure",
    desc: "Emergency runway maintenance at your main hub causes cascading delays.",
    effect: "-30% revenue today",
    revenueMultiplier: 0.7,
  },
  {
    type: "negative",
    icon: "medical-outline",
    title: "Health Advisory Issued",
    desc: "A travel health advisory dampens demand on international routes.",
    effect: "-15% revenue today",
    revenueMultiplier: 0.85,
  },
];

const NEUTRAL_EVENTS: Omit<DailyEvent, "id">[] = [
  {
    type: "neutral",
    icon: "document-text-outline",
    title: "New Slot Regulations",
    desc: "Aviation authorities update slot allocation rules at major hubs.",
    effect: "No immediate impact",
  },
  {
    type: "neutral",
    icon: "business-outline",
    title: "New Competitor Launches",
    desc: "A budget carrier announces new routes overlapping your network.",
    effect: "Watch your load factors",
  },
  {
    type: "neutral",
    icon: "hammer-outline",
    title: "Airport Expansion",
    desc: "One of your hub airports begins a terminal expansion project.",
    effect: "Temporary minor delays",
    revenueMultiplier: 0.95,
  },
  {
    type: "neutral",
    icon: "swap-horizontal-outline",
    title: "Currency Fluctuation",
    desc: "Exchange rates shift on international routes. Yields affected.",
    effect: "Mixed impact across routes",
  },
  {
    type: "neutral",
    icon: "newspaper-outline",
    title: "Aviation Industry Report",
    desc: "A major report highlights growth opportunities in your region.",
    effect: "No immediate financial impact",
  },
  {
    type: "neutral",
    icon: "people-outline",
    title: "Labour Negotiations",
    desc: "Pilots and ground crew begin routine contract discussions.",
    effect: "Slight delay risk this week",
    revenueMultiplier: 0.97,
  },
  {
    type: "neutral",
    icon: "wifi-outline",
    title: "In-Flight WiFi Upgrade",
    desc: "Your planes are being upgraded with faster internet service.",
    effect: "Minor disruption today only",
    revenueMultiplier: 0.98,
  },
  {
    type: "neutral",
    icon: "shield-outline",
    title: "New Security Protocols",
    desc: "Updated security screening procedures slow boarding slightly.",
    effect: "Minor delay impact",
    revenueMultiplier: 0.96,
  },
];

// ─────────────────────────────────────────────────────────────────
// SEEDED EVENT PICKER
// ─────────────────────────────────────────────────────────────────

function seededPick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

export function generateDailyEvent(day: number): DailyEvent {
  // Seed from day — same day always gives same event
  // Spread events: ~50% positive, ~35% negative, ~15% neutral
  const roll = (day * 7919 + 13) % 100;

  let base: Omit<DailyEvent, "id">;
  if (roll < 50) {
    base = seededPick(POSITIVE_EVENTS, day);
  } else if (roll < 85) {
    base = seededPick(NEGATIVE_EVENTS, Math.floor(day / 2));
  } else {
    base = seededPick(NEUTRAL_EVENTS, Math.floor(day / 3));
  }

  return { ...base, id: `event-day-${day}` };
}

// ─────────────────────────────────────────────────────────────────
// HOOK — fires at each day tick, applies effect + stores for display
// ─────────────────────────────────────────────────────────────────

export function useDailyEvents() {
  const lastDay = useRef<number>(-1);

  useEffect(() => {
    const unsub = useGameStore.subscribe(
      (s) => s.airline?.day,
      (day) => {
        if (!day || day === lastDay.current) return;
        lastDay.current = day;

        const event = generateDailyEvent(day);
        const store = useGameStore.getState();

        // Always add a ledger entry so Finance shows event history
        const ledgerEntry: any = {
          id: `event-day-${day}`,
          day,
          type: "event",
          label: `${event.type === "positive" ? "📈" : event.type === "negative" ? "📉" : "📋"} ${event.title}`,
          amount: event.cashBonus ?? 0,
          route_id: null,
        };

        if (event.cashBonus) {
          store.earnCash(event.cashBonus);
          ledgerEntry.amount = event.cashBonus;
        }

        store.addLedgerEntries([ledgerEntry]);
        // Store event for display — save to store
        store.setDailyEvent(event);
      },
    );
    return () => unsub();
  }, []);
}
