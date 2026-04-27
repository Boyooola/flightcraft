/**
 * lib/achievements.ts
 *
 * 75 achievements across 8 categories.
 * Stored as { id: dayEarned } in DB (airlines.achievements jsonb column).
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
  // legacy fields — kept for type compat, always false
  phHub: boolean;
  phMidEastRoute: boolean;
  phEuropeRoute: boolean;
  phAmericaRoute: boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  // ── PIONEER ─────────────────────────────────────────────────────
  {
    id: "wheels_up",
    title: "Wheels Up",
    desc: "Create your very first route.",
    flavor: "Every airline starts with a single flight.",
    category: "pioneer",
    icon: "airplane-outline",
    points: 10,
    check: (s) => s.activeRoutes >= 1,
  },
  {
    id: "hub_owner",
    title: "Hub Owner",
    desc: "Purchase your first airport hub.",
    flavor: "Location, location, location.",
    category: "pioneer",
    icon: "location-outline",
    points: 10,
    check: (s) => s.hubs >= 1,
  },
  {
    id: "first_fleet",
    title: "The Right Stuff",
    desc: "Buy your first aircraft.",
    flavor: "A plane without a route is just an expensive garage.",
    category: "pioneer",
    icon: "construct-outline",
    points: 10,
    check: (s) => s.ownedPlanes >= 1,
  },
  {
    id: "borrowed_time",
    title: "Borrowed Time",
    desc: "Take your first bank loan.",
    flavor: "Other people's money — the fuel of ambition.",
    category: "pioneer",
    icon: "card-outline",
    points: 15,
    check: (s) => s.loan > 0,
  },
  {
    id: "connecting_dots",
    title: "Connecting the Dots",
    desc: "Create your first connecting route.",
    flavor: "Two legs, one destination. The art of the layover.",
    category: "pioneer",
    icon: "git-branch-outline",
    points: 20,
    check: (s) => s.hasConnecting,
  },
  {
    id: "second_hub",
    title: "Second Base",
    desc: "Open a second airport hub.",
    flavor: "One hub is a start. Two is a network.",
    category: "pioneer",
    icon: "add-circle-outline",
    points: 20,
    check: (s) => s.hubs >= 2,
  },

  // ── NETWORK — DOMESTIC & REGIONAL ───────────────────────────────
  {
    id: "routes_5",
    title: "Growing Network",
    desc: "Have 5 active routes.",
    flavor: "The schedule board is filling up.",
    category: "network",
    icon: "git-network-outline",
    points: 20,
    check: (s) => s.activeRoutes >= 5,
  },
  {
    id: "routes_10",
    title: "Established Carrier",
    desc: "Have 10 active routes.",
    flavor: "10 routes. You're a real airline now.",
    category: "network",
    icon: "map-outline",
    points: 35,
    check: (s) => s.activeRoutes >= 10,
  },
  {
    id: "routes_20",
    title: "Route Empire",
    desc: "Have 20 active routes.",
    flavor: "The slot coordinator knows your name.",
    category: "network",
    icon: "apps-outline",
    points: 60,
    check: (s) => s.activeRoutes >= 20,
  },
  {
    id: "routes_35",
    title: "Mega Network",
    desc: "Have 35 active routes.",
    flavor: "Your route map looks like a spider's web.",
    category: "network",
    icon: "planet-outline",
    points: 100,
    check: (s) => s.activeRoutes >= 35,
    hidden: true,
  },
  {
    id: "routes_50",
    title: "Network Titan",
    desc: "Have 50 active routes.",
    flavor: "50 routes. Your ops team needs a bigger whiteboard.",
    category: "network",
    icon: "infinite-outline",
    points: 150,
    check: (s) => s.activeRoutes >= 50,
    hidden: true,
  },
  {
    id: "five_countries",
    title: "Borderless",
    desc: "Operate routes to 5 different countries.",
    flavor: "Borders on maps. Not on your schedule.",
    category: "network",
    icon: "flag-outline",
    points: 25,
    check: (s) => s.countries.size >= 5,
  },
  {
    id: "ten_countries",
    title: "Globe Trotter",
    desc: "Operate routes to 10 different countries.",
    flavor: "Ten nations served.",
    category: "network",
    icon: "earth-outline",
    points: 50,
    check: (s) => s.countries.size >= 10,
  },
  {
    id: "twenty_countries",
    title: "World Citizen",
    desc: "Operate routes to 20 different countries.",
    flavor: "Your airline is mentioned in geography textbooks.",
    category: "network",
    icon: "earth",
    points: 90,
    check: (s) => s.countries.size >= 20,
    hidden: true,
  },
  {
    id: "thirty_countries",
    title: "Passport Collector",
    desc: "Operate routes to 30 different countries.",
    flavor: "30 flags on your route map.",
    category: "network",
    icon: "earth",
    points: 120,
    check: (s) => s.countries.size >= 30,
    hidden: true,
  },
  {
    id: "hubs_on_diff_continents",
    title: "Two Worlds",
    desc: "Own hubs on 2 different continents.",
    flavor: "Your empire spans oceans.",
    category: "network",
    icon: "git-compare-outline",
    points: 45,
    check: (s) => s.hubsOnDiffCont,
  },
  {
    id: "hub_empire",
    title: "Hub Empire",
    desc: "Own 5 hubs.",
    flavor: "Five bases of operation. Formidable.",
    category: "network",
    icon: "business-outline",
    points: 50,
    check: (s) => s.hubs >= 5,
  },
  {
    id: "hub_mogul",
    title: "Hub Mogul",
    desc: "Own 10 hubs.",
    flavor: "Ten airports. Your logo is on every terminal sign.",
    category: "network",
    icon: "business",
    points: 90,
    check: (s) => s.hubs >= 10,
    hidden: true,
  },
  {
    id: "all_hauls",
    title: "Full Spectrum",
    desc: "Have active short, medium, AND long haul routes simultaneously.",
    flavor: "From commuter hops to continent-crossing slogs.",
    category: "network",
    icon: "resize-outline",
    points: 40,
    check: (s) => s.hasLongHaul && s.activeRoutes >= 3,
  },
  {
    id: "connecting_master",
    title: "Connecting Master",
    desc: "Have 5 active connecting routes simultaneously.",
    flavor: "Five layovers. The airport lounge loves you.",
    category: "network",
    icon: "git-branch-outline",
    points: 55,
    check: (s) => s.hasConnecting && s.activeRoutes >= 5,
  },

  // ── NETWORK — INTERCONTINENTAL ───────────────────────────────────
  {
    id: "long_haul_club",
    title: "Long Haul Pioneer",
    desc: "Operate a route longer than 3,500nm.",
    flavor: "Sleep is for domestic carriers.",
    category: "network",
    icon: "navigate-outline",
    points: 30,
    check: (s) => s.hasLongHaul,
  },
  {
    id: "two_continents",
    title: "Intercontinental",
    desc: "Have active routes on 2 different continents.",
    flavor: "Your airline crosses a continental boundary.",
    category: "network",
    icon: "globe-outline",
    points: 30,
    check: (s) => s.continents.size >= 2,
  },
  {
    id: "three_continents",
    title: "Three Continents",
    desc: "Have active routes on 3 different continents.",
    flavor: "Asia, Europe, and beyond. You're global.",
    category: "network",
    icon: "globe-outline",
    points: 55,
    check: (s) => s.continents.size >= 3,
  },
  {
    id: "four_continents",
    title: "Four Corners",
    desc: "Have active routes on 4 different continents.",
    flavor: "Four continents. Your operations manual is a novel.",
    category: "network",
    icon: "earth-outline",
    points: 80,
    check: (s) => s.continents.size >= 4,
  },
  {
    id: "five_continents",
    title: "Around the World",
    desc: "Have active routes on 5 different continents.",
    flavor: "Phileas Fogg would be humbled.",
    category: "network",
    icon: "planet-outline",
    points: 120,
    check: (s) => s.continents.size >= 5,
    hidden: true,
  },
  {
    id: "six_continents",
    title: "Global Domination",
    desc: "Have active routes on 6 different continents.",
    flavor: "Only Antarctica remains. And they don't have an airport.",
    category: "network",
    icon: "star",
    points: 200,
    check: (s) => s.continents.size >= 6,
    hidden: true,
  },
  {
    id: "intra_asia",
    title: "Asian Gateway",
    desc: "Operate a route where both airports are in Asia.",
    flavor: "Asia is the world's busiest aviation market.",
    category: "network",
    icon: "radio-outline",
    points: 20,
    check: (s) => s.intraAsiaRoute,
  },
  {
    id: "intra_europe",
    title: "European Operator",
    desc: "Operate an intra-European route.",
    flavor: "Short runways, long history.",
    category: "network",
    icon: "wifi-outline",
    points: 20,
    check: (s) => s.intraEuropeRoute,
  },
  {
    id: "trans_atlantic",
    title: "Transatlantic",
    desc: "Operate a route between North America and Europe.",
    flavor: "The world's most competitive aviation corridor.",
    category: "network",
    icon: "swap-horizontal-outline",
    points: 50,
    check: (s) => s.transAtlantic,
  },
  {
    id: "trans_pacific",
    title: "Transpacific",
    desc: "Operate a route between the Americas and Asia/Oceania.",
    flavor: "12 hours of ocean. Worth every nautical mile.",
    category: "network",
    icon: "swap-horizontal",
    points: 60,
    check: (s) => s.transPacific,
  },
  {
    id: "ultra_long",
    title: "Ultra Long Haul",
    desc: "Operate a route longer than 6,000nm.",
    flavor: "17 hours of legroom negotiation.",
    category: "network",
    icon: "infinite-outline",
    points: 70,
    check: (s) => s.hasUltraLong,
    hidden: true,
  },
  {
    id: "ultra_ultra_long",
    title: "The Distance",
    desc: "Operate a route longer than 9,000nm.",
    flavor: "You're operating the impossible.",
    category: "network",
    icon: "rocket-outline",
    points: 150,
    check: (s) => s.hasUltraUltra,
    hidden: true,
  },
  {
    id: "home_to_world",
    title: "Home to the World",
    desc: "Operate a route from your home continent to another.",
    flavor: "Every great airline starts by connecting home to the world.",
    category: "prestige",
    icon: "home-outline",
    points: 50,
    check: (s) => s.homeToWorld,
  },
  {
    id: "labour_corridor",
    title: "Labour Corridor",
    desc: "Operate a long intra-Asian route over 2,500nm.",
    flavor: "Millions travel these routes for opportunity.",
    category: "prestige",
    icon: "people-circle-outline",
    points: 60,
    check: (s) => s.labourCorridor,
  },
  {
    id: "diaspora_route",
    title: "Diaspora Route",
    desc: "Operate a long-haul route over 4,000nm.",
    flavor: "People go where opportunity calls. You bring them home.",
    category: "prestige",
    icon: "heart-circle-outline",
    points: 55,
    check: (s) => s.diasporaRoute,
  },

  // ── FLEET ───────────────────────────────────────────────────────
  {
    id: "mixed_fleet",
    title: "Mixed Fleet",
    desc: "Own planes from 2 different manufacturers.",
    flavor: "Diversity is operational resilience.",
    category: "fleet",
    icon: "layers-outline",
    points: 25,
    check: (s) => s.planesFamilies.size >= 2,
  },
  {
    id: "three_families",
    title: "Three Brands",
    desc: "Own planes from 3 different manufacturers.",
    flavor: "Embraer, Boeing, Airbus. The big three.",
    category: "fleet",
    icon: "layers",
    points: 50,
    check: (s) => s.planesFamilies.size >= 3,
  },
  {
    id: "all_families",
    title: "Fleet Commander",
    desc: "Own at least one aircraft from all 4 manufacturer families.",
    flavor: "Embraer, Bombardier, Boeing, Airbus. Collect them all.",
    category: "fleet",
    icon: "apps-outline",
    points: 80,
    check: (s) => s.planesFamilies.size >= 4,
    hidden: true,
  },
  {
    id: "widebody_era",
    title: "Widebody Era",
    desc: "Operate a Boeing or Airbus widebody.",
    flavor: "Welcome to the big leagues.",
    category: "fleet",
    icon: "airplane",
    points: 40,
    check: (s) =>
      s.planesFamilies.has("boeing") || s.planesFamilies.has("airbus"),
  },
  {
    id: "planes_10",
    title: "Growing Fleet",
    desc: "Own 10 aircraft.",
    flavor: "Ten planes. The hangar is starting to feel small.",
    category: "fleet",
    icon: "albums-outline",
    points: 40,
    check: (s) => s.ownedPlanes >= 10,
  },
  {
    id: "twenty_planes",
    title: "Full Fleet",
    desc: "Own 20 aircraft.",
    flavor: "Twenty planes. Time to build another hangar.",
    category: "fleet",
    icon: "albums",
    points: 70,
    check: (s) => s.ownedPlanes >= 20,
  },
  {
    id: "thirty_planes",
    title: "Air Force",
    desc: "Own 30 aircraft.",
    flavor: "30 planes. You have a scheduling department now.",
    category: "fleet",
    icon: "albums",
    points: 100,
    check: (s) => s.ownedPlanes >= 30,
    hidden: true,
  },

  // ── FINANCIAL ───────────────────────────────────────────────────
  {
    id: "first_million",
    title: "First Million",
    desc: "Accumulate $1M in cash.",
    flavor: "The first million is always the hardest.",
    category: "financial",
    icon: "cash-outline",
    points: 30,
    check: (s) => s.cash >= 1_000_000,
  },
  {
    id: "ten_million",
    title: "Airline of the Year",
    desc: "Hold $10M in cash.",
    flavor: "$10M. The auditors stop asking questions.",
    category: "financial",
    icon: "bar-chart-outline",
    points: 55,
    check: (s) => s.cash >= 10_000_000,
  },
  {
    id: "fifty_million_cash",
    title: "War Chest",
    desc: "Hold $50M in cash.",
    flavor: "You could buy a small country's airline.",
    category: "financial",
    icon: "diamond-outline",
    points: 90,
    check: (s) => s.cash >= 50_000_000,
    hidden: true,
  },
  {
    id: "debt_free",
    title: "Debt Free",
    desc: "Pay off your loan completely.",
    flavor: "No more interest. The sky is truly yours.",
    category: "financial",
    icon: "shield-checkmark-outline",
    points: 40,
    check: (s) => s.debtFree && s.day > 1,
  },
  {
    id: "net_worth_10m",
    title: "In the Black",
    desc: "Achieve a net worth of $10M.",
    flavor: "The only number that matters.",
    category: "financial",
    icon: "trending-up-outline",
    points: 50,
    check: (s) => s.netWorth >= 10_000_000,
  },
  {
    id: "net_worth_50m",
    title: "Empire Builder",
    desc: "Reach $50M net worth.",
    flavor: "Fifty million. And still hungry for more.",
    category: "financial",
    icon: "business-outline",
    points: 100,
    check: (s) => s.netWorth >= 50_000_000,
    hidden: true,
  },
  {
    id: "tycoon",
    title: "Aviation Tycoon",
    desc: "Reach $100M net worth.",
    flavor: "They used to call it a hobby.",
    category: "financial",
    icon: "diamond-outline",
    points: 150,
    check: (s) => s.netWorth >= 100_000_000,
    hidden: true,
  },
  {
    id: "bootstrap",
    title: "Bootstrap",
    desc: "Reach 5 active routes without ever taking a loan.",
    flavor: "Who needs a bank when you have hustle?",
    category: "financial",
    icon: "trending-up-outline",
    points: 60,
    check: (s) => s.activeRoutes >= 5 && s.loan === 0,
    hidden: true,
  },
  {
    id: "quick_repay",
    title: "Fast Repayer",
    desc: "Pay off a loan within 30 days of taking it.",
    flavor: "Borrow fast, repay faster.",
    category: "financial",
    icon: "return-up-back-outline",
    points: 45,
    check: (s) => s.debtFree && s.day <= 30,
  },

  // ── PASSENGER ───────────────────────────────────────────────────
  {
    id: "first_boarding",
    title: "First Boarding",
    desc: "Carry your first passengers.",
    flavor: "Behind every flight is someone going somewhere important.",
    category: "passenger",
    icon: "people-outline",
    points: 10,
    check: (s) => s.totalPaxToday > 0,
  },
  {
    id: "pax_500_day",
    title: "Busy Day",
    desc: "Carry 500 passengers in a single day.",
    flavor: "500 journeys. 500 stories.",
    category: "passenger",
    icon: "people",
    points: 30,
    check: (s) => s.totalPaxToday >= 500,
  },
  {
    id: "pax_2000_day",
    title: "High Traffic",
    desc: "Carry 2,000 passengers in a single day.",
    flavor: "The departure board is never empty.",
    category: "passenger",
    icon: "people",
    points: 60,
    check: (s) => s.totalPaxToday >= 2000,
  },
  {
    id: "pax_5000_day",
    title: "Mega Carrier",
    desc: "Carry 5,000 passengers in a single day.",
    flavor: "5,000 people. That's a small town in the sky.",
    category: "passenger",
    icon: "people-circle-outline",
    points: 100,
    check: (s) => s.totalPaxToday >= 5000,
    hidden: true,
  },
  {
    id: "pax_10k_day",
    title: "City in the Sky",
    desc: "Carry 10,000 passengers in a single day.",
    flavor: "10,000 people trusted you with their journey.",
    category: "passenger",
    icon: "people-circle",
    points: 150,
    check: (s) => s.totalPaxToday >= 10_000,
    hidden: true,
  },

  // ── OPERATIONS ──────────────────────────────────────────────────
  {
    id: "trusted",
    title: "Trusted",
    desc: "Reach 100% trust at any hub.",
    flavor: "They don't check the schedule. They just show up.",
    category: "operations",
    icon: "heart-outline",
    points: 50,
    check: (s) => s.maxTrust >= 100,
  },
  {
    id: "trust_50_all",
    title: "Reliable",
    desc: "Have all hubs above 50% trust (minimum 3 hubs).",
    flavor: "Passengers choose you first. Every time.",
    category: "operations",
    icon: "star-half-outline",
    points: 35,
    check: (s) => s.hubs >= 3 && s.avgTrust >= 50,
  },
  {
    id: "all_trusted",
    title: "Perfect Operations",
    desc: "Reach 80%+ trust at all hubs (minimum 3 hubs).",
    flavor: "Every hub, every passenger, every time.",
    category: "operations",
    icon: "heart",
    points: 80,
    check: (s) => s.hubs >= 3 && s.avgTrust >= 80,
  },
  {
    id: "no_waiting",
    title: "No Waiting",
    desc: "Operate with no overcrowded hubs on day 30+.",
    flavor: "Efficient. On time. Always.",
    category: "operations",
    icon: "checkmark-done-outline",
    points: 60,
    check: (s) => s.maxCrowding === "normal" && s.day >= 30,
  },
  {
    id: "speed_demon",
    title: "Speed Demon",
    desc: "Play at 3× speed with 10+ active routes.",
    flavor: "Full throttle. No looking back.",
    category: "operations",
    icon: "flash-outline",
    points: 20,
    check: (s) => s.speed3Active && s.activeRoutes >= 10,
  },

  // ── MISSIONS ────────────────────────────────────────────────────
  {
    id: "first_mission",
    title: "Mission Accepted",
    desc: "Complete your first daily mission.",
    flavor: "Every great airline runs on objectives.",
    category: "missions",
    icon: "checkmark-circle-outline",
    points: 15,
    check: (s) => s.missionsCompleted >= 1,
  },
  {
    id: "missions_10",
    title: "On Target",
    desc: "Complete 10 daily missions.",
    flavor: "Consistent. Reliable. Profitable.",
    category: "missions",
    icon: "checkbox-outline",
    points: 30,
    check: (s) => s.missionsCompleted >= 10,
  },
  {
    id: "missions_30",
    title: "Mission Master",
    desc: "Complete 30 daily missions.",
    flavor: "30 missions. The ops center runs itself.",
    category: "missions",
    icon: "trophy-outline",
    points: 60,
    check: (s) => s.missionsCompleted >= 30,
    hidden: true,
  },
  {
    id: "missions_50",
    title: "Mission Veteran",
    desc: "Complete 50 daily missions.",
    flavor: "50 missions. The ops board runs on autopilot.",
    category: "missions",
    icon: "checkbox",
    points: 80,
    check: (s) => s.missionsCompleted >= 50,
    hidden: true,
  },
  {
    id: "all_missions_today",
    title: "Perfect Day",
    desc: "Complete all 3 daily missions in a single day.",
    flavor: "Three for three. A perfect operational day.",
    category: "missions",
    icon: "ribbon-outline",
    points: 40,
    check: (s) => s.allMissionsToday,
  },
  {
    id: "perfect_week",
    title: "Perfect Week",
    desc: "Complete 21+ missions across 7+ days of play.",
    flavor: "Seven days. Twenty-one missions. Zero excuses.",
    category: "missions",
    icon: "calendar-outline",
    points: 90,
    check: (s) => s.missionsCompleted >= 21 && s.day >= 7,
    hidden: true,
  },

  // ── PRESTIGE ────────────────────────────────────────────────────
  {
    id: "century",
    title: "Century",
    desc: "Reach day 100.",
    flavor: "One hundred days. Still flying.",
    category: "prestige",
    icon: "trophy-outline",
    points: 80,
    check: (s) => s.day >= 100,
  },
  {
    id: "veteran",
    title: "Veteran Operator",
    desc: "Reach day 200.",
    flavor: "200 days of decisions, disasters, and triumphs.",
    category: "prestige",
    icon: "medal-outline",
    points: 120,
    check: (s) => s.day >= 200,
    hidden: true,
  },
  {
    id: "day_365",
    title: "One Year Strong",
    desc: "Reach day 365.",
    flavor: "365 days. Most airlines don't make it this far.",
    category: "prestige",
    icon: "star-outline",
    points: 200,
    check: (s) => s.day >= 365,
    hidden: true,
  },
  {
    id: "speed_runner",
    title: "Speed Runner",
    desc: "Reach day 50 with 15+ active routes.",
    flavor: "Built an airline in record time.",
    category: "prestige",
    icon: "rocket-outline",
    points: 70,
    check: (s) => s.day <= 50 && s.activeRoutes >= 15,
    hidden: true,
  },
];

export const ACHIEVEMENT_IDS = ACHIEVEMENTS.map((a) => a.id);
export const TOTAL_POINTS = ACHIEVEMENTS.reduce((s, a) => s + a.points, 0);
