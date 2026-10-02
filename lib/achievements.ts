/**
 * FlightCraft achievement catalog.
 *
 * IDs are permanent because they are stored in saved games and mapped to
 * Google Play Games. Titles and goals may be clarified, but IDs must not be
 * renamed or reused for an unrelated accomplishment.
 */

import {
  ACHIEVEMENTS as PLAY_GAMES_ACHIEVEMENTS,
  type AchievementId as PlayGamesAchievementId,
} from "@/constants/playGames";

export type CatalogAchievementId =
  PlayGamesAchievementId | "all_hubs_50" | "all_hubs_80";

export type AchievementCategory =
  | "pioneer"
  | "network"
  | "fleet"
  | "financial"
  | "passenger"
  | "operations"
  | "missions"
  | "prestige";

export interface Achievement {
  id: CatalogAchievementId;
  title: string;
  desc: string;
  flavor: string;
  category: AchievementCategory;
  icon: string;
  hidden?: boolean;
  points: number;
  check: (s: AchievementState) => boolean;
}

export function isPlayGamesAchievementId(
  id: CatalogAchievementId,
): id is PlayGamesAchievementId {
  return Object.prototype.hasOwnProperty.call(PLAY_GAMES_ACHIEVEMENTS, id);
}

export interface AchievementState {
  day: number;
  cash: number;
  netWorth: number;
  activeRoutes: number;
  totalRoutes: number;
  hubs: number;
  ownedPlanes: number;
  totalPaxToday: number;
  totalPaxAllTime: number;
  maxTrust: number;
  avgTrust: number;
  continents: Set<string>;
  countries: Set<string>;
  hasConnecting: boolean;
  hasLongHaul: boolean;
  hasUltraLong: boolean;
  debtFree: boolean;
  allHubsFull: boolean;
  maxCrowding: "normal" | "busy" | "overcrowded" | "crisis";
  transAtlantic: boolean;
  transPacific: boolean;
  planesFamilies: Set<string>;
  speed3Active: boolean;
  missionsCompleted: number;
  missionsToday: number;
}

export const ACHIEVEMENTS: Achievement[] = [
  // ── PIONEER ─────────────────────────────────────────────────────
  {
    id: "first_takeoff",
    title: "First Takeoff",
    desc: "Create your first active route.",
    flavor: "Your first route is now operating.",
    category: "pioneer",
    icon: "airplane-outline",
    points: 10,
    check: (s) => s.activeRoutes >= 1,
  },
  {
    id: "first_passengers",
    title: "First Passengers",
    desc: "Carry passengers for the first time.",
    flavor: "Your airline carried its first passengers.",
    category: "pioneer",
    icon: "people-outline",
    points: 10,
    check: (s) => s.totalPaxToday > 0 || s.totalPaxAllTime > 0,
  },
  {
    id: "first_hub",
    title: "First Hub",
    desc: "Purchase your first airport hub.",
    flavor: "Your first hub is open.",
    category: "pioneer",
    icon: "location-outline",
    points: 10,
    check: (s) => s.hubs >= 1,
  },
  {
    id: "first_plane",
    title: "First Plane",
    desc: "Buy your first aircraft.",
    flavor: "Your first aircraft joined the fleet.",
    category: "pioneer",
    icon: "construct-outline",
    points: 10,
    check: (s) => s.ownedPlanes >= 1,
  },
  {
    id: "three_routes",
    title: "Route Starter",
    desc: "Have 3 active routes.",
    flavor: "Your airline now operates 3 routes.",
    category: "pioneer",
    icon: "git-network-outline",
    points: 15,
    check: (s) => s.activeRoutes >= 3,
  },
  {
    id: "second_hub",
    title: "Second Hub",
    desc: "Own 2 airport hubs.",
    flavor: "Your second hub is open.",
    category: "pioneer",
    icon: "add-circle-outline",
    points: 20,
    check: (s) => s.hubs >= 2,
  },

  // ── PASSENGER FLOW ──────────────────────────────────────────────
  {
    id: "pax_100_day",
    title: "Moving People",
    desc: "Carry 100 passengers in one day.",
    flavor: "You carried 100 passengers in one day.",
    category: "passenger",
    icon: "people-outline",
    points: 20,
    check: (s) => s.totalPaxToday >= 100,
  },
  {
    id: "pax_500_day",
    title: "Busy Board",
    desc: "Carry 500 passengers in one day.",
    flavor: "You carried 500 passengers in one day.",
    category: "passenger",
    icon: "people",
    points: 35,
    check: (s) => s.totalPaxToday >= 500,
  },
  {
    id: "pax_1000_day",
    title: "1,000 Passengers",
    desc: "Carry 1,000 passengers in one day.",
    flavor: "You carried 1,000 passengers in one day.",
    category: "passenger",
    icon: "walk-outline",
    points: 50,
    check: (s) => s.totalPaxToday >= 1_000,
  },
  {
    id: "pax_2500_day",
    title: "Terminal Surge",
    desc: "Carry 2,500 passengers in one day.",
    flavor: "You carried 2,500 passengers in one day.",
    category: "passenger",
    icon: "people-circle-outline",
    points: 80,
    check: (s) => s.totalPaxToday >= 2_500,
    hidden: true,
  },
  {
    id: "pax_5000_day",
    title: "5,000 Passengers",
    desc: "Carry 5,000 passengers in one day.",
    flavor: "You carried 5,000 passengers in one day.",
    category: "passenger",
    icon: "people-circle",
    points: 120,
    check: (s) => s.totalPaxToday >= 5_000,
    hidden: true,
  },
  {
    id: "pax_10k_all_time",
    title: "10K Journeys",
    desc: "Carry 10,000 passengers total.",
    flavor: "Your airline has carried 10,000 passengers.",
    category: "passenger",
    icon: "accessibility-outline",
    points: 60,
    check: (s) => s.totalPaxAllTime >= 10_000,
  },
  {
    id: "pax_100k_all_time",
    title: "People Mover",
    desc: "Carry 100,000 passengers total.",
    flavor: "Your airline has carried 100,000 passengers.",
    category: "passenger",
    icon: "accessibility",
    points: 140,
    check: (s) => s.totalPaxAllTime >= 100_000,
    hidden: true,
  },

  // ── NETWORK ─────────────────────────────────────────────────────
  {
    id: "routes_5",
    title: "Five Lines",
    desc: "Have 5 active routes.",
    flavor: "Your airline now operates 5 routes.",
    category: "network",
    icon: "map-outline",
    points: 25,
    check: (s) => s.activeRoutes >= 5,
  },
  {
    id: "routes_10",
    title: "Route Web",
    desc: "Have 10 active routes.",
    flavor: "Your airline now operates 10 routes.",
    category: "network",
    icon: "git-network-outline",
    points: 45,
    check: (s) => s.activeRoutes >= 10,
  },
  {
    id: "routes_20",
    title: "Flight Grid",
    desc: "Have 20 active routes.",
    flavor: "Your airline now operates 20 routes.",
    category: "network",
    icon: "apps-outline",
    points: 80,
    check: (s) => s.activeRoutes >= 20,
  },
  {
    id: "routes_35",
    title: "Global Mesh",
    desc: "Have 35 active routes.",
    flavor: "Your airline now operates 35 routes.",
    category: "network",
    icon: "planet-outline",
    points: 125,
    check: (s) => s.activeRoutes >= 35,
    hidden: true,
  },
  {
    id: "hubs_5",
    title: "Hub Chain",
    desc: "Own 5 hubs.",
    flavor: "Your network now includes 5 hubs.",
    category: "network",
    icon: "business-outline",
    points: 60,
    check: (s) => s.hubs >= 5,
  },
  {
    id: "hubs_10",
    title: "Airport Empire",
    desc: "Own 10 hubs.",
    flavor: "Your network now includes 10 hubs.",
    category: "network",
    icon: "business",
    points: 110,
    check: (s) => s.hubs >= 10,
    hidden: true,
  },
  {
    id: "countries_5",
    title: "Across Borders",
    desc: "Serve 5 countries.",
    flavor: "Your routes now serve 5 countries.",
    category: "network",
    icon: "flag-outline",
    points: 35,
    check: (s) => s.countries.size >= 5,
  },
  {
    id: "countries_15",
    title: "Many Flags",
    desc: "Serve 15 countries.",
    flavor: "Your routes now serve 15 countries.",
    category: "network",
    icon: "earth-outline",
    points: 80,
    check: (s) => s.countries.size >= 15,
    hidden: true,
  },
  {
    id: "two_continents",
    title: "Two Continents",
    desc: "Operate routes across 2 continents.",
    flavor: "Your routes now operate across 2 continents.",
    category: "network",
    icon: "globe-outline",
    points: 40,
    check: (s) => s.continents.size >= 2,
  },
  {
    id: "five_continents",
    title: "World Map",
    desc: "Operate routes across 5 continents.",
    flavor: "Your routes now operate across 5 continents.",
    category: "network",
    icon: "planet-outline",
    points: 130,
    check: (s) => s.continents.size >= 5,
    hidden: true,
  },

  // ── ROUTE TYPES ─────────────────────────────────────────────────
  {
    id: "connecting_route",
    title: "One Stop Wonder",
    desc: "Create a connecting route.",
    flavor: "Your first one-stop route is operating.",
    category: "network",
    icon: "git-branch-outline",
    points: 25,
    check: (s) => s.hasConnecting,
  },
  {
    id: "long_haul",
    title: "Long Line",
    desc: "Operate a long-haul route.",
    flavor: "Your first long-haul route is operating.",
    category: "network",
    icon: "navigate-outline",
    points: 35,
    check: (s) => s.hasLongHaul,
  },
  {
    id: "ultra_long",
    title: "Ocean Runner",
    desc: "Operate a route longer than 6,000nm.",
    flavor: "You opened a route longer than 6,000 nautical miles.",
    category: "network",
    icon: "infinite-outline",
    points: 90,
    check: (s) => s.hasUltraLong,
    hidden: true,
  },
  {
    id: "trans_atlantic",
    title: "Atlantic Link",
    desc: "Operate a route between North America and Europe.",
    flavor: "Your network now crosses the Atlantic.",
    category: "network",
    icon: "swap-horizontal-outline",
    points: 60,
    check: (s) => s.transAtlantic,
  },
  {
    id: "trans_pacific",
    title: "Pacific Jump",
    desc: "Operate a route between the Americas and Asia/Oceania.",
    flavor: "Your network now crosses the Pacific.",
    category: "network",
    icon: "swap-horizontal",
    points: 70,
    check: (s) => s.transPacific,
  },

  // ── FLEET ───────────────────────────────────────────────────────
  {
    id: "planes_3",
    title: "Small Fleet",
    desc: "Own 3 aircraft.",
    flavor: "Your fleet now contains 3 aircraft.",
    category: "fleet",
    icon: "albums-outline",
    points: 25,
    check: (s) => s.ownedPlanes >= 3,
  },
  {
    id: "planes_10",
    title: "Fleet Flow",
    desc: "Own 10 aircraft.",
    flavor: "Your fleet now contains 10 aircraft.",
    category: "fleet",
    icon: "albums",
    points: 60,
    check: (s) => s.ownedPlanes >= 10,
  },
  {
    id: "planes_25",
    title: "Sky Conveyor",
    desc: "Own 25 aircraft.",
    flavor: "Your fleet now contains 25 aircraft.",
    category: "fleet",
    icon: "layers",
    points: 110,
    check: (s) => s.ownedPlanes >= 25,
    hidden: true,
  },
  {
    id: "mixed_fleet",
    title: "Mixed Fleet",
    desc: "Own planes from 2 manufacturer families.",
    flavor: "Your fleet includes 2 manufacturer families.",
    category: "fleet",
    icon: "layers-outline",
    points: 30,
    check: (s) => s.planesFamilies.size >= 2,
  },
  {
    id: "all_families",
    title: "Collector Fleet",
    desc: "Own planes from 4 manufacturer families.",
    flavor: "Your fleet includes all 4 manufacturer families.",
    category: "fleet",
    icon: "apps-outline",
    points: 90,
    check: (s) => s.planesFamilies.size >= 4,
    hidden: true,
  },

  // ── OPERATIONS / FLOW ───────────────────────────────────────────
  {
    id: "trust_80",
    title: "Trusted Flow",
    desc: "Reach 80% trust at any hub.",
    flavor: "One of your hubs reached 80% trust.",
    category: "operations",
    icon: "heart-outline",
    points: 35,
    check: (s) => s.maxTrust >= 80,
  },
  {
    id: "trust_100",
    title: "Perfect Hub",
    desc: "Reach 100% trust at any hub.",
    flavor: "One of your hubs reached 100% trust.",
    category: "operations",
    icon: "heart",
    points: 60,
    check: (s) => s.maxTrust >= 100,
  },
  {
    id: "all_hubs_50",
    title: "Stable Network",
    desc: "Reach 50% average trust across at least 3 hubs.",
    flavor: "Average trust across your hubs reached 50%.",
    category: "operations",
    icon: "star-half-outline",
    points: 45,
    check: (s) => s.hubs >= 3 && s.avgTrust >= 50,
  },
  {
    id: "all_hubs_80",
    title: "Trusted Network",
    desc: "Reach 80% average trust across at least 3 hubs.",
    flavor: "Average trust across your hubs reached 80%.",
    category: "operations",
    icon: "star-outline",
    points: 90,
    check: (s) => s.hubs >= 3 && s.avgTrust >= 80,
    hidden: true,
  },
  {
    id: "no_crowding_day",
    title: "No Backlog",
    desc: "Finish a day after day 10 with normal crowding at every hub.",
    flavor: "Every hub finished the day with normal crowding.",
    category: "operations",
    icon: "checkmark-done-outline",
    points: 45,
    check: (s) => s.day >= 10 && s.maxCrowding === "normal",
  },
  {
    id: "all_hubs_full",
    title: "Full Opportunity Board",
    desc: "After day 10, fill every opportunity slot across at least 3 hubs.",
    flavor: "Every hub opportunity slot is available for planning.",
    category: "operations",
    icon: "grid-outline",
    points: 55,
    check: (s) => s.day >= 10 && s.hubs >= 3 && s.allHubsFull,
  },
  {
    id: "route_streak_5",
    title: "Route Builder",
    desc: "Open 5 routes in total.",
    flavor: "You have opened 5 routes.",
    category: "operations",
    icon: "flash-outline",
    points: 40,
    check: (s) => s.totalRoutes >= 5,
  },
  {
    id: "route_streak_15",
    title: "Network Builder",
    desc: "Open 15 routes in total.",
    flavor: "You have opened 15 routes.",
    category: "operations",
    icon: "flash",
    points: 100,
    check: (s) => s.totalRoutes >= 15,
    hidden: true,
  },
  {
    id: "speed_mode",
    title: "Fast Forward",
    desc: "Run 3× speed with 10+ active routes.",
    flavor: "You operated 10 routes at 3x speed.",
    category: "operations",
    icon: "play-forward-outline",
    points: 35,
    check: (s) => s.speed3Active && s.activeRoutes >= 10,
  },

  // ── FINANCIAL ───────────────────────────────────────────────────
  {
    id: "cash_100k",
    title: "Positive Position",
    desc: "Reach a financial position of $100K.",
    flavor: "Cash now exceeds debt by $100K.",
    category: "financial",
    icon: "cash-outline",
    points: 20,
    check: (s) => s.netWorth >= 100_000,
  },
  {
    id: "first_million",
    title: "First Million",
    desc: "Reach a financial position of $1M.",
    flavor: "Cash now exceeds debt by $1M.",
    category: "financial",
    icon: "cash",
    points: 45,
    check: (s) => s.netWorth >= 1_000_000,
  },
  {
    id: "ten_million",
    title: "Money Runway",
    desc: "Hold $10M cash.",
    flavor: "Your cash reserve reached $10M.",
    category: "financial",
    icon: "bar-chart-outline",
    points: 80,
    check: (s) => s.cash >= 10_000_000,
    hidden: true,
  },
  {
    id: "debt_free",
    title: "Debt Free",
    desc: "Pay off all loans.",
    flavor: "Your outstanding loan is fully repaid.",
    category: "financial",
    icon: "shield-checkmark-outline",
    points: 45,
    check: (s) => s.debtFree && s.day > 1,
  },
  {
    id: "net_worth_10m",
    title: "$10M Financial Position",
    desc: "Reach a financial position of $10M.",
    flavor: "Your financial position reached $10M.",
    category: "financial",
    icon: "trending-up-outline",
    points: 70,
    check: (s) => s.netWorth >= 10_000_000,
  },
  {
    id: "tycoon",
    title: "$100M Financial Position",
    desc: "Reach a financial position of $100M.",
    flavor: "Your financial position reached $100M.",
    category: "financial",
    icon: "diamond-outline",
    points: 160,
    check: (s) => s.netWorth >= 100_000_000,
    hidden: true,
  },

  // ── MISSIONS ────────────────────────────────────────────────────
  {
    id: "first_mission",
    title: "Contract Done",
    desc: "Complete your first mission.",
    flavor: "You completed your first mission.",
    category: "missions",
    icon: "checkmark-circle-outline",
    points: 15,
    check: (s) => s.missionsCompleted >= 1,
  },
  {
    id: "missions_10",
    title: "Contract Runner",
    desc: "Complete 10 missions.",
    flavor: "You have completed 10 missions.",
    category: "missions",
    icon: "checkbox-outline",
    points: 40,
    check: (s) => s.missionsCompleted >= 10,
  },
  {
    id: "missions_30",
    title: "Mission Operator",
    desc: "Complete 30 missions.",
    flavor: "You have completed 30 missions.",
    category: "missions",
    icon: "trophy-outline",
    points: 80,
    check: (s) => s.missionsCompleted >= 30,
    hidden: true,
  },
  {
    id: "perfect_day",
    title: "Mission Sweep",
    desc: "Complete all 3 missions in one day.",
    flavor: "You completed all 3 daily missions.",
    category: "missions",
    icon: "ribbon-outline",
    points: 50,
    check: (s) => s.missionsToday >= 3,
  },
  {
    id: "mission_sweep",
    title: "Productive Day",
    desc: "Complete at least 2 missions in one day.",
    flavor: "You completed 2 missions in one day.",
    category: "missions",
    icon: "checkmark-done-circle-outline",
    points: 45,
    check: (s) => s.missionsToday >= 2,
  },

  // ── PRESTIGE ────────────────────────────────────────────────────
  {
    id: "day_30",
    title: "First Month",
    desc: "Reach day 30.",
    flavor: "Your airline has operated for 30 days.",
    category: "prestige",
    icon: "calendar-outline",
    points: 40,
    check: (s) => s.day >= 30,
  },
  {
    id: "day_100",
    title: "Century Operator",
    desc: "Reach day 100.",
    flavor: "Your airline has operated for 100 days.",
    category: "prestige",
    icon: "trophy-outline",
    points: 90,
    check: (s) => s.day >= 100,
  },
  {
    id: "day_365",
    title: "One Year",
    desc: "Reach day 365.",
    flavor: "Your airline has operated for one full year.",
    category: "prestige",
    icon: "star-outline",
    points: 200,
    check: (s) => s.day >= 365,
    hidden: true,
  },
  {
    id: "speed_builder",
    title: "Fast Builder",
    desc: "Reach 15 active routes by day 50.",
    flavor: "You reached 15 active routes by day 50.",
    category: "prestige",
    icon: "rocket-outline",
    points: 100,
    check: (s) => s.day <= 50 && s.activeRoutes >= 15,
    hidden: true,
  },
];

export const ACHIEVEMENT_IDS = ACHIEVEMENTS.map((a) => a.id);

export const TOTAL_POINTS = ACHIEVEMENTS.reduce((sum, achievement) => {
  return sum + achievement.points;
}, 0);
