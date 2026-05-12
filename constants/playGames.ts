/**
 * constants/playGames.ts
 * Google Play Games Services IDs
 * Auto-generated from games-ids.xml
 */

export const PLAY_GAMES_APP_ID = "364325398732";
export const PLAY_GAMES_CLIENT_ID =
  "364325398732-smb7fk719t96vai07k8qub1vpmrm4jtt.apps.googleusercontent.com";

// ── Leaderboard ──────────────────────────────────────────────────
export const LEADERBOARD_NET_WORTH = "CgkIzNHxm80KEAIQAQ";

// ── Achievements ─────────────────────────────────────────────────
export const ACHIEVEMENTS = {
  // Milestones
  first_takeoff: "CgkIzNHxm80KEAIQBw",
  first_passengers: "CgkIzNHxm80KEAIQLA",
  first_hub: "CgkIzNHxm80KEAIQAg",
  first_plane: "CgkIzNHxm80KEAIQNQ",
  three_routes: "CgkIzNHxm80KEAIQLQ",
  second_hub: "CgkIzNHxm80KEAIQGg",
  // Daily pax
  pax_100_day: "CgkIzNHxm80KEAIQGA",
  pax_500_day: "CgkIzNHxm80KEAIQKQ",
  pax_1000_day: "CgkIzNHxm80KEAIQEg",
  pax_2500_day: "CgkIzNHxm80KEAIQKA",
  pax_5000_day: "CgkIzNHxm80KEAIQKg",
  // All-time pax
  pax_10k_all_time: "CgkIzNHxm80KEAIQDw",
  pax_100k_all_time: "CgkIzNHxm80KEAIQDg",
  // Routes
  routes_5: "CgkIzNHxm80KEAIQJA",
  routes_10: "CgkIzNHxm80KEAIQKw",
  routes_20: "CgkIzNHxm80KEAIQNA",
  routes_35: "CgkIzNHxm80KEAIQNg",
  // Hubs
  hubs_5: "CgkIzNHxm80KEAIQJg",
  hubs_10: "CgkIzNHxm80KEAIQAw",
  // Countries
  countries_5: "CgkIzNHxm80KEAIQHQ",
  countries_15: "CgkIzNHxm80KEAIQMA",
  // Geography
  two_continents: "CgkIzNHxm80KEAIQMQ",
  five_continents: "CgkIzNHxm80KEAIQEw",
  connecting_route: "CgkIzNHxm80KEAIQIA",
  long_haul: "CgkIzNHxm80KEAIQNw",
  ultra_long: "CgkIzNHxm80KEAIQCg",
  trans_atlantic: "CgkIzNHxm80KEAIQBA",
  trans_pacific: "CgkIzNHxm80KEAIQEQ",
  // Fleet
  planes_3: "CgkIzNHxm80KEAIQDQ",
  planes_10: "CgkIzNHxm80KEAIQIQ",
  planes_25: "CgkIzNHxm80KEAIQGw",
  mixed_fleet: "CgkIzNHxm80KEAIQIg",
  all_families: "CgkIzNHxm80KEAIQBg",
  // Trust
  trust_80: "CgkIzNHxm80KEAIQHg",
  trust_100: "CgkIzNHxm80KEAIQLg",
  no_crowding_day: "CgkIzNHxm80KEAIQJQ",
  all_hubs_full: "CgkIzNHxm80KEAIQGQ",
  // Streaks
  route_streak_5: "CgkIzNHxm80KEAIQMg",
  route_streak_15: "CgkIzNHxm80KEAIQCw",
  speed_mode: "CgkIzNHxm80KEAIQHA",
  // Cash
  cash_100k: "CgkIzNHxm80KEAIQFw",
  first_million: "CgkIzNHxm80KEAIQBQ",
  ten_million: "CgkIzNHxm80KEAIQIw",
  debt_free: "CgkIzNHxm80KEAIQFg",
  net_worth_10m: "CgkIzNHxm80KEAIQLw",
  tycoon: "CgkIzNHxm80KEAIQFA",
  // Missions
  first_mission: "CgkIzNHxm80KEAIQJw",
  missions_10: "CgkIzNHxm80KEAIQEA",
  missions_30: "CgkIzNHxm80KEAIQFQ",
  perfect_day: "CgkIzNHxm80KEAIQDA",
  mission_sweep: "CgkIzNHxm80KEAIQHw",
  // Days
  day_30: "CgkIzNHxm80KEAIQMw",
  day_100: "CgkIzNHxm80KEAIQCA",
  day_365: "CgkIzNHxm80KEAIQOA",
  speed_builder: "CgkIzNHxm80KEAIQCQ",
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
