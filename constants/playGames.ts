/**
 * constants/playGames.ts
 * Google Play Games Services IDs
 * Auto-generated from games-ids.xml
 */

export const PLAY_GAMES_APP_ID = "482109260344";
export const PLAY_GAMES_CLIENT_ID =
  "942162913163-8j6acvehrvochrjlr3ccqn9f3c9cahtq.apps.googleusercontent.com";

// ── Leaderboard ──────────────────────────────────────────────────
export const LEADERBOARD_NET_WORTH = "CgkIuITO_4MOEAIQFQ";

// ── Achievements ─────────────────────────────────────────────────
export const ACHIEVEMENTS = {
  // Milestones
  first_takeoff: "CgkIuITO_4MOEAIQAQ",
  first_passengers: "CgkIuITO_4MOEAIQAg",
  first_hub: "CgkIuITO_4MOEAIQAw",
  first_plane: "CgkIuITO_4MOEAIQBA",
  three_routes: "CgkIuITO_4MOEAIQBQ",
  second_hub: "CgkIuITO_4MOEAIQBg",
  // Daily pax
  pax_100_day: "CgkIuITO_4MOEAIQBw",
  pax_500_day: "CgkIuITO_4MOEAIQCA",
  pax_1000_day: "CgkIuITO_4MOEAIQCQ",
  pax_2500_day: "CgkIuITO_4MOEAIQCg",
  pax_5000_day: "CgkIuITO_4MOEAIQCw",
  // All-time pax
  pax_10k_all_time: "CgkIuITO_4MOEAIQDA",
  pax_100k_all_time: "CgkIuITO_4MOEAIQDQ",
  // Routes
  routes_5: "CgkIuITO_4MOEAIQDg",
  routes_10: "CgkIuITO_4MOEAIQDw",
  routes_20: "CgkIuITO_4MOEAIQEA",
  routes_35: "CgkIuITO_4MOEAIQEQ",
  // Hubs
  hubs_5: "CgkIuITO_4MOEAIQEg",
  hubs_10: "CgkIuITO_4MOEAIQEw",
  // Countries
  countries_5: "CgkIuITO_4MOEAIQFA",
  countries_15: "CgkIuITO_4MOEAIQFg",
  // Geography
  two_continents: "CgkIuITO_4MOEAIQFw",
  five_continents: "CgkIuITO_4MOEAIQGA",
  connecting_route: "CgkIuITO_4MOEAIQGQ",
  long_haul: "CgkIuITO_4MOEAIQGg",
  ultra_long: "CgkIuITO_4MOEAIQGw",
  trans_atlantic: "CgkIuITO_4MOEAIQHA",
  trans_pacific: "CgkIuITO_4MOEAIQHQ",
  // Fleet
  planes_3: "CgkIuITO_4MOEAIQHg",
  planes_10: "CgkIuITO_4MOEAIQHw",
  planes_25: "CgkIuITO_4MOEAIQIA",
  mixed_fleet: "CgkIuITO_4MOEAIQIQ",
  all_families: "CgkIuITO_4MOEAIQIg",
  // Trust
  trust_80: "CgkIuITO_4MOEAIQIw",
  trust_100: "CgkIuITO_4MOEAIQJA",
  no_crowding_day: "CgkIuITO_4MOEAIQJQ",
  all_hubs_full: "CgkIuITO_4MOEAIQJg",
  // Streaks
  route_streak_5: "CgkIuITO_4MOEAIQJw",
  route_streak_15: "CgkIuITO_4MOEAIQKA",
  speed_mode: "CgkIuITO_4MOEAIQKQ",
  // Cash
  cash_100k: "CgkIuITO_4MOEAIQKg",
  first_million: "CgkIuITO_4MOEAIQKw",
  ten_million: "CgkIuITO_4MOEAIQLA",
  debt_free: "CgkIuITO_4MOEAIQLQ",
  net_worth_10m: "CgkIuITO_4MOEAIQLg",
  tycoon: "CgkIuITO_4MOEAIQLw",
  // Missions
  first_mission: "CgkIuITO_4MOEAIQMA",
  missions_10: "CgkIuITO_4MOEAIQMQ",
  missions_30: "CgkIuITO_4MOEAIQMg",
  perfect_day: "CgkIuITO_4MOEAIQMw",
  mission_sweep: "CgkIuITO_4MOEAIQNA",
  // Days
  day_30: "CgkIuITO_4MOEAIQNQ",
  day_100: "CgkIuITO_4MOEAIQNg",
  day_365: "CgkIuITO_4MOEAIQNw",
  speed_builder: "CgkIuITO_4MOEAIQOA",
} as const;

export type AchievementId = keyof typeof ACHIEVEMENTS;

// Incremental achievements with their step counts
export const INCREMENTAL_STEPS: Partial<Record<AchievementId, number>> = {
  pax_10k_all_time: 10000,
  pax_100k_all_time: 10000,
  routes_5: 5,
  routes_10: 10,
  routes_20: 20,
  routes_35: 35,
  hubs_5: 5,
  hubs_10: 10,
  countries_5: 5,
  countries_15: 15,
  planes_3: 3,
  planes_10: 10,
  planes_25: 25,
  route_streak_5: 5,
  route_streak_15: 15,
  missions_10: 10,
  missions_30: 30,
};
