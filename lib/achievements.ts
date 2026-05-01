/**
 * lib/achievements.ts
 *
 * WorldWide Rush-style achievements.
 *
 * Focus:
 *   - Fast wins
 *   - Passenger flow
 *   - Demand slot clearing
 *   - Network expansion
 *   - Smooth operations
 *   - Simple, satisfying milestones
 */

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
  id: string;
  title: string;
  desc: string;
  flavor: string;
  category: AchievementCategory;
  icon: string;
  hidden?: boolean;
  points: number;
  check: (s: AchievementState) => boolean;
}

export interface AchievementState {
  day: number;
  cash: number;
  loan: number;
  netWorth: number;
  activeRoutes: number;
  totalRoutes: number;
  hubs: number;
  ownedPlanes: number;
  reputation: number;
  totalPaxToday: number;
  totalPaxAllTime: number;
  maxTrust: number;
  avgTrust: number;
  continents: Set<string>;
  countries: Set<string>;
  regions: Set<string>;
  hasConnecting: boolean;
  hasLongHaul: boolean;
  hasUltraLong: boolean;
  hasUltraUltra: boolean;
  debtFree: boolean;
  allHubsFull: boolean;
  maxCrowding: string;
  homeToWorld: boolean;
  labourCorridor: boolean;
  diasporaRoute: boolean;
  intraAsiaRoute: boolean;
  intraEuropeRoute: boolean;
  transAtlantic: boolean;
  transPacific: boolean;
  planesFamilies: Set<string>;
  speed3Active: boolean;
  missionsCompleted: number;
  missionsToday: number;
  allMissionsToday: boolean;
  routeStreak: number;
  hubsOnDiffCont: boolean;
  longestRoute: number;
  mostTrustedHub: number;
  hasRouteToEvery: boolean;

  // legacy fields — kept for type compat
  phHub: boolean;
  phMidEastRoute: boolean;
  phEuropeRoute: boolean;
  phAmericaRoute: boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  // ── PIONEER ─────────────────────────────────────────────────────
  {
    id: "first_takeoff",
    title: "First Takeoff",
    desc: "Create your first active route.",
    flavor: "The map just came alive.",
    category: "pioneer",
    icon: "airplane-outline",
    points: 10,
    check: (s) => s.activeRoutes >= 1,
  },
  {
    id: "first_passengers",
    title: "First Passengers",
    desc: "Carry passengers for the first time.",
    flavor: "A full seat is better than an empty promise.",
    category: "pioneer",
    icon: "people-outline",
    points: 10,
    check: (s) => s.totalPaxToday > 0 || s.totalPaxAllTime > 0,
  },
  {
    id: "first_hub",
    title: "First Hub",
    desc: "Purchase your first airport hub.",
    flavor: "One airport. Endless routes.",
    category: "pioneer",
    icon: "location-outline",
    points: 10,
    check: (s) => s.hubs >= 1,
  },
  {
    id: "first_plane",
    title: "First Plane",
    desc: "Buy your first aircraft.",
    flavor: "Now you can actually move people.",
    category: "pioneer",
    icon: "construct-outline",
    points: 10,
    check: (s) => s.ownedPlanes >= 1,
  },
  {
    id: "three_routes",
    title: "Route Starter",
    desc: "Have 3 active routes.",
    flavor: "Three lines on the map. Now it feels like a network.",
    category: "pioneer",
    icon: "git-network-outline",
    points: 15,
    check: (s) => s.activeRoutes >= 3,
  },
  {
    id: "second_hub",
    title: "Second Hub",
    desc: "Own 2 airport hubs.",
    flavor: "One hub starts the game. Two hubs start the network.",
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
    flavor: "The flow begins.",
    category: "passenger",
    icon: "people-outline",
    points: 20,
    check: (s) => s.totalPaxToday >= 100,
  },
  {
    id: "pax_500_day",
    title: "Busy Board",
    desc: "Carry 500 passengers in one day.",
    flavor: "The departure board is working hard.",
    category: "passenger",
    icon: "people",
    points: 35,
    check: (s) => s.totalPaxToday >= 500,
  },
  {
    id: "pax_1000_day",
    title: "Passenger Rush",
    desc: "Carry 1,000 passengers in one day.",
    flavor: "Now that is a rush.",
    category: "passenger",
    icon: "walk-outline",
    points: 50,
    check: (s) => s.totalPaxToday >= 1_000,
  },
  {
    id: "pax_2500_day",
    title: "Terminal Surge",
    desc: "Carry 2,500 passengers in one day.",
    flavor: "Every gate is moving.",
    category: "passenger",
    icon: "people-circle-outline",
    points: 80,
    check: (s) => s.totalPaxToday >= 2_500,
    hidden: true,
  },
  {
    id: "pax_5000_day",
    title: "Sky River",
    desc: "Carry 5,000 passengers in one day.",
    flavor: "Passengers are flowing like water.",
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
    flavor: "Ten thousand little victories.",
    category: "passenger",
    icon: "accessibility-outline",
    points: 60,
    check: (s) => s.totalPaxAllTime >= 10_000,
  },
  {
    id: "pax_100k_all_time",
    title: "People Mover",
    desc: "Carry 100,000 passengers total.",
    flavor: "Your network is part of their lives now.",
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
    flavor: "The map is starting to glow.",
    category: "network",
    icon: "map-outline",
    points: 25,
    check: (s) => s.activeRoutes >= 5,
  },
  {
    id: "routes_10",
    title: "Route Web",
    desc: "Have 10 active routes.",
    flavor: "Passengers have choices now.",
    category: "network",
    icon: "git-network-outline",
    points: 45,
    check: (s) => s.activeRoutes >= 10,
  },
  {
    id: "routes_20",
    title: "Flight Grid",
    desc: "Have 20 active routes.",
    flavor: "This is no longer a few flights. This is a system.",
    category: "network",
    icon: "apps-outline",
    points: 80,
    check: (s) => s.activeRoutes >= 20,
  },
  {
    id: "routes_35",
    title: "Global Mesh",
    desc: "Have 35 active routes.",
    flavor: "Your route map looks alive.",
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
    flavor: "Five anchors for your growing airline.",
    category: "network",
    icon: "business-outline",
    points: 60,
    check: (s) => s.hubs >= 5,
  },
  {
    id: "hubs_10",
    title: "Airport Empire",
    desc: "Own 10 hubs.",
    flavor: "Your logo belongs on the terminal wall.",
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
    flavor: "The world is opening up.",
    category: "network",
    icon: "flag-outline",
    points: 35,
    check: (s) => s.countries.size >= 5,
  },
  {
    id: "countries_15",
    title: "Many Flags",
    desc: "Serve 15 countries.",
    flavor: "Every new flag means a new market.",
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
    flavor: "The network crossed the water.",
    category: "network",
    icon: "globe-outline",
    points: 40,
    check: (s) => s.continents.size >= 2,
  },
  {
    id: "five_continents",
    title: "World Map",
    desc: "Operate routes across 5 continents.",
    flavor: "The whole map is yours to solve.",
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
    flavor: "Sometimes the best path bends.",
    category: "network",
    icon: "git-branch-outline",
    points: 25,
    check: (s) => s.hasConnecting,
  },
  {
    id: "long_haul",
    title: "Long Line",
    desc: "Operate a long-haul route.",
    flavor: "That line stretches far.",
    category: "network",
    icon: "navigate-outline",
    points: 35,
    check: (s) => s.hasLongHaul,
  },
  {
    id: "ultra_long",
    title: "Ocean Runner",
    desc: "Operate a route longer than 6,000nm.",
    flavor: "A long blue line across the world.",
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
    flavor: "Classic corridor. Big money.",
    category: "network",
    icon: "swap-horizontal-outline",
    points: 60,
    check: (s) => s.transAtlantic,
  },
  {
    id: "trans_pacific",
    title: "Pacific Jump",
    desc: "Operate a route between the Americas and Asia/Oceania.",
    flavor: "That is a serious flight.",
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
    flavor: "Now you can serve more than one rush.",
    category: "fleet",
    icon: "albums-outline",
    points: 25,
    check: (s) => s.ownedPlanes >= 3,
  },
  {
    id: "planes_10",
    title: "Fleet Flow",
    desc: "Own 10 aircraft.",
    flavor: "Enough planes to keep the board moving.",
    category: "fleet",
    icon: "albums",
    points: 60,
    check: (s) => s.ownedPlanes >= 10,
  },
  {
    id: "planes_25",
    title: "Sky Conveyor",
    desc: "Own 25 aircraft.",
    flavor: "The skies are becoming your conveyor belt.",
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
    flavor: "Different planes for different jobs.",
    category: "fleet",
    icon: "layers-outline",
    points: 30,
    check: (s) => s.planesFamilies.size >= 2,
  },
  {
    id: "all_families",
    title: "Collector Fleet",
    desc: "Own planes from 4 manufacturer families.",
    flavor: "You did not choose a favorite. You bought them all.",
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
    flavor: "Passengers know your planes will come.",
    category: "operations",
    icon: "heart-outline",
    points: 35,
    check: (s) => s.maxTrust >= 80,
  },
  {
    id: "trust_100",
    title: "Perfect Hub",
    desc: "Reach 100% trust at any hub.",
    flavor: "No hesitation. They fly with you.",
    category: "operations",
    icon: "heart",
    points: 60,
    check: (s) => s.maxTrust >= 100,
  },
  {
    id: "all_hubs_50",
    title: "Stable Network",
    desc: "Have all hubs average 50%+ trust.",
    flavor: "Not perfect, but dependable.",
    category: "operations",
    icon: "star-half-outline",
    points: 45,
    check: (s) => s.hubs >= 3 && s.avgTrust >= 50,
  },
  {
    id: "all_hubs_80",
    title: "Smooth Network",
    desc: "Have all hubs average 80%+ trust.",
    flavor: "The whole system is humming.",
    category: "operations",
    icon: "star-outline",
    points: 90,
    check: (s) => s.hubs >= 3 && s.avgTrust >= 80,
    hidden: true,
  },
  {
    id: "no_crowding_day",
    title: "No Backlog",
    desc: "Keep crowding normal after day 10.",
    flavor: "No angry queues. Beautiful.",
    category: "operations",
    icon: "checkmark-done-outline",
    points: 45,
    check: (s) => s.day >= 10 && s.maxCrowding === "normal",
  },
  {
    id: "all_hubs_full",
    title: "Full Board",
    desc: "Have all hubs filled with active demand slots.",
    flavor: "Every airport wants something from you.",
    category: "operations",
    icon: "grid-outline",
    points: 55,
    check: (s) => s.allHubsFull,
  },
  {
    id: "route_streak_5",
    title: "Combo x5",
    desc: "Reach a route streak of 5.",
    flavor: "One after another. That is the rush.",
    category: "operations",
    icon: "flash-outline",
    points: 40,
    check: (s) => s.routeStreak >= 5,
  },
  {
    id: "route_streak_15",
    title: "Combo x15",
    desc: "Reach a route streak of 15.",
    flavor: "You are not stopping. You are chaining.",
    category: "operations",
    icon: "flash",
    points: 100,
    check: (s) => s.routeStreak >= 15,
    hidden: true,
  },
  {
    id: "speed_mode",
    title: "Fast Forward",
    desc: "Run 3× speed with 10+ active routes.",
    flavor: "The map is moving fast now.",
    category: "operations",
    icon: "play-forward-outline",
    points: 35,
    check: (s) => s.speed3Active && s.activeRoutes >= 10,
  },

  // ── FINANCIAL ───────────────────────────────────────────────────
  {
    id: "cash_100k",
    title: "First Stack",
    desc: "Hold $100K cash.",
    flavor: "Enough to make the next move.",
    category: "financial",
    icon: "cash-outline",
    points: 20,
    check: (s) => s.cash >= 100_000,
  },
  {
    id: "first_million",
    title: "First Million",
    desc: "Hold $1M cash.",
    flavor: "Now the upgrades feel possible.",
    category: "financial",
    icon: "cash",
    points: 45,
    check: (s) => s.cash >= 1_000_000,
  },
  {
    id: "ten_million",
    title: "Money Runway",
    desc: "Hold $10M cash.",
    flavor: "That is a long runway.",
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
    flavor: "No bank owns your sky.",
    category: "financial",
    icon: "shield-checkmark-outline",
    points: 45,
    check: (s) => s.debtFree && s.day > 1,
  },
  {
    id: "net_worth_10m",
    title: "Airline Value",
    desc: "Reach $10M net worth.",
    flavor: "The company is becoming real.",
    category: "financial",
    icon: "trending-up-outline",
    points: 70,
    check: (s) => s.netWorth >= 10_000_000,
  },
  {
    id: "tycoon",
    title: "Sky Tycoon",
    desc: "Reach $100M net worth.",
    flavor: "The rush became an empire.",
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
    flavor: "Objective cleared.",
    category: "missions",
    icon: "checkmark-circle-outline",
    points: 15,
    check: (s) => s.missionsCompleted >= 1,
  },
  {
    id: "missions_10",
    title: "Contract Runner",
    desc: "Complete 10 missions.",
    flavor: "You are getting good at clearing the board.",
    category: "missions",
    icon: "checkbox-outline",
    points: 40,
    check: (s) => s.missionsCompleted >= 10,
  },
  {
    id: "missions_30",
    title: "Rush Operator",
    desc: "Complete 30 missions.",
    flavor: "The objective board fears you.",
    category: "missions",
    icon: "trophy-outline",
    points: 80,
    check: (s) => s.missionsCompleted >= 30,
    hidden: true,
  },
  {
    id: "perfect_day",
    title: "Perfect Day",
    desc: "Complete all 3 missions in one day.",
    flavor: "Three objectives. Three clears.",
    category: "missions",
    icon: "ribbon-outline",
    points: 50,
    check: (s) => s.allMissionsToday,
  },
  {
    id: "mission_sweep",
    title: "Daily Sweep",
    desc: "Complete 3 missions today.",
    flavor: "Clean board. Clean profit.",
    category: "missions",
    icon: "checkmark-done-circle-outline",
    points: 45,
    check: (s) => s.missionsToday >= 3,
  },

  // ── PRESTIGE ────────────────────────────────────────────────────
  {
    id: "day_30",
    title: "First Month",
    desc: "Reach day 30.",
    flavor: "Thirty days of building the flow.",
    category: "prestige",
    icon: "calendar-outline",
    points: 40,
    check: (s) => s.day >= 30,
  },
  {
    id: "day_100",
    title: "Century Operator",
    desc: "Reach day 100.",
    flavor: "One hundred days. The map remembers you.",
    category: "prestige",
    icon: "trophy-outline",
    points: 90,
    check: (s) => s.day >= 100,
  },
  {
    id: "day_365",
    title: "One Year Rush",
    desc: "Reach day 365.",
    flavor: "A full year of flights, slots, and decisions.",
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
    flavor: "You built fast and never looked back.",
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
