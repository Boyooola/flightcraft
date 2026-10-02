/**
 * lib/seasons.ts
 *
 * Seasonal demand calendar.
 *
 * Maps day-of-year (0–364) to regional demand multipliers.
 * Based on real-world aviation seasonality patterns.
 *
 * Regions map to airport.country or continent groups.
 * Multiplier applies on top of existing crowdMultiplier in RouteLayer.
 *
 * No DB columns needed — derived purely from game day.
 */

export type SeasonRegion =
  | "north_europe"
  | "mediterranean"
  | "north_america"
  | "latin_america"
  | "east_asia"
  | "southeast_asia"
  | "south_asia"
  | "middle_east"
  | "africa"
  | "oceania"
  | "global";

export interface SeasonEffect {
  region: SeasonRegion;
  multiplier: number; // 0.7 = -30%, 1.3 = +30%
  label: string; // shown in UI
  icon: string; // Ionicons name
}

export interface SeasonalDay {
  name: string; // "Summer Peak", "Lunar New Year", etc.
  effects: SeasonEffect[];
}

// ── Day-of-year helpers ───────────────────────────────────────────
export function getDayOfYear(gameDay: number): number {
  return (((gameDay - 1) % 365) + 365) % 365; // 0–364
}

export function getMonth(dayOfYear: number): number {
  // Approximate month from day of year (0=Jan, 11=Dec)
  return Math.floor(dayOfYear / 30.4) % 12;
}

// ── Seasonal multiplier table ─────────────────────────────────────
// Month 0=Jan, 1=Feb, ..., 11=Dec
const SEASONAL_EFFECTS: Record<number, SeasonEffect[]> = {
  // January
  0: [
    {
      region: "north_europe",
      multiplier: 0.82,
      label: "Winter weather keeps travelers home",
      icon: "snow-outline",
    },
    {
      region: "north_america",
      multiplier: 0.85,
      label: "Post-holiday travel demand cools",
      icon: "trending-down-outline",
    },
    {
      region: "east_asia",
      multiplier: 1.18,
      label: "Lunar New Year travel surges",
      icon: "star-outline",
    },
    {
      region: "southeast_asia",
      multiplier: 1.12,
      label: "Holiday crowds flood regional airports",
      icon: "star-outline",
    },
    {
      region: "oceania",
      multiplier: 1.15,
      label: "Summer vacation traffic climbs",
      icon: "sunny-outline",
    },
    {
      region: "middle_east",
      multiplier: 0.9,
      label: "Tourism demand remains soft",
      icon: "remove-outline",
    },
  ],

  // February
  1: [
    {
      region: "east_asia",
      multiplier: 1.28,
      label: "Lunar New Year triggers massive travel wave",
      icon: "star-outline",
    },
    {
      region: "southeast_asia",
      multiplier: 1.22,
      label: "Regional holiday travel hits peak levels",
      icon: "star-outline",
    },
    {
      region: "north_america",
      multiplier: 0.88,
      label: "Winter slowdown weakens demand",
      icon: "snow-outline",
    },
    {
      region: "north_europe",
      multiplier: 0.8,
      label: "Cold season suppresses tourism",
      icon: "snow-outline",
    },
    {
      region: "oceania",
      multiplier: 1.1,
      label: "Late-summer tourism stays strong",
      icon: "sunny-outline",
    },
  ],

  // March
  2: [
    {
      region: "north_america",
      multiplier: 1.12,
      label: "Spring break crowds pack airports",
      icon: "airplane-outline",
    },
    {
      region: "mediterranean",
      multiplier: 1.08,
      label: "Tourists return as warmer weather arrives",
      icon: "partly-sunny-outline",
    },
    {
      region: "north_europe",
      multiplier: 0.9,
      label: "Travel demand remains below seasonal norms",
      icon: "partly-sunny-outline",
    },
    {
      region: "middle_east",
      multiplier: 0.88,
      label: "Ramadan slows regional travel activity",
      icon: "moon-outline",
    },
  ],

  // April
  3: [
    {
      region: "north_europe",
      multiplier: 1.1,
      label: "Easter holiday traffic lifts demand",
      icon: "airplane-outline",
    },
    {
      region: "mediterranean",
      multiplier: 1.15,
      label: "Beach destinations begin filling up",
      icon: "sunny-outline",
    },
    {
      region: "north_america",
      multiplier: 1.08,
      label: "Spring travelers return to the skies",
      icon: "partly-sunny-outline",
    },
    {
      region: "middle_east",
      multiplier: 0.85,
      label: "Ramadan continues to reduce travel volume",
      icon: "moon-outline",
    },
  ],

  // May
  4: [
    {
      region: "north_europe",
      multiplier: 1.12,
      label: "European leisure travel accelerates",
      icon: "sunny-outline",
    },
    {
      region: "mediterranean",
      multiplier: 1.18,
      label: "Resort destinations see heavy bookings",
      icon: "sunny-outline",
    },
    {
      region: "north_america",
      multiplier: 1.1,
      label: "Holiday weekend drives passenger growth",
      icon: "airplane-outline",
    },
    {
      region: "east_asia",
      multiplier: 1.08,
      label: "Golden Week crowds overwhelm airports",
      icon: "star-outline",
    },
    {
      region: "south_asia",
      multiplier: 0.85,
      label: "Early monsoon weather disrupts travel",
      icon: "rainy-outline",
    },
  ],

  // June
  5: [
    {
      region: "north_europe",
      multiplier: 1.22,
      label: "Summer tourists flood European cities",
      icon: "sunny-outline",
    },
    {
      region: "mediterranean",
      multiplier: 1.3,
      label: "Mediterranean beaches enter peak season",
      icon: "sunny-outline",
    },
    {
      region: "north_america",
      multiplier: 1.18,
      label: "Families begin summer vacation travel",
      icon: "sunny-outline",
    },
    {
      region: "oceania",
      multiplier: 0.88,
      label: "Winter season slows domestic tourism",
      icon: "snow-outline",
    },
    {
      region: "south_asia",
      multiplier: 0.8,
      label: "Monsoon rains heavily impact flights",
      icon: "rainy-outline",
    },
  ],

  // July
  6: [
    {
      region: "north_europe",
      multiplier: 1.28,
      label: "Summer travel demand reaches yearly highs",
      icon: "sunny-outline",
    },
    {
      region: "mediterranean",
      multiplier: 1.35,
      label: "Tourists pack Mediterranean resorts",
      icon: "sunny-outline",
    },
    {
      region: "north_america",
      multiplier: 1.25,
      label: "Airports struggle with summer crowds",
      icon: "sunny-outline",
    },
    {
      region: "east_asia",
      multiplier: 1.12,
      label: "School holidays boost regional tourism",
      icon: "sunny-outline",
    },
    {
      region: "oceania",
      multiplier: 0.85,
      label: "Winter travel demand remains weak",
      icon: "snow-outline",
    },
    {
      region: "south_asia",
      multiplier: 0.78,
      label: "Severe monsoons disrupt regional travel",
      icon: "rainy-outline",
    },
    {
      region: "middle_east",
      multiplier: 0.82,
      label: "Extreme heat reduces tourism demand",
      icon: "thermometer-outline",
    },
  ],

  // August
  7: [
    {
      region: "north_europe",
      multiplier: 1.25,
      label: "Late-summer tourism remains strong",
      icon: "sunny-outline",
    },
    {
      region: "mediterranean",
      multiplier: 1.32,
      label: "Beach destinations remain fully booked",
      icon: "sunny-outline",
    },
    {
      region: "north_america",
      multiplier: 1.2,
      label: "Vacation season continues at full speed",
      icon: "sunny-outline",
    },
    {
      region: "east_asia",
      multiplier: 1.08,
      label: "Holidaymakers keep regional flights busy",
      icon: "sunny-outline",
    },
    {
      region: "oceania",
      multiplier: 0.88,
      label: "Winter conditions limit tourism activity",
      icon: "snow-outline",
    },
  ],

  // September
  8: [
    {
      region: "north_europe",
      multiplier: 0.95,
      label: "Summer tourism rapidly fades",
      icon: "partly-sunny-outline",
    },
    {
      region: "mediterranean",
      multiplier: 1.08,
      label: "Shoulder-season travel remains steady",
      icon: "partly-sunny-outline",
    },
    {
      region: "north_america",
      multiplier: 0.92,
      label: "Post-vacation travel demand weakens",
      icon: "trending-down-outline",
    },
    {
      region: "oceania",
      multiplier: 1.05,
      label: "Spring weather boosts tourism activity",
      icon: "partly-sunny-outline",
    },
    {
      region: "east_asia",
      multiplier: 1.02,
      label: "Business travelers return to the skies",
      icon: "briefcase-outline",
    },
  ],

  // October
  9: [
    {
      region: "east_asia",
      multiplier: 1.2,
      label: "Golden Week sparks massive travel demand",
      icon: "star-outline",
    },
    {
      region: "north_america",
      multiplier: 1.05,
      label: "Autumn travel demand picks up",
      icon: "leaf-outline",
    },
    {
      region: "mediterranean",
      multiplier: 0.95,
      label: "Tourist season begins winding down",
      icon: "partly-sunny-outline",
    },
    {
      region: "oceania",
      multiplier: 1.1,
      label: "Spring tourism gains momentum",
      icon: "sunny-outline",
    },
    {
      region: "south_asia",
      multiplier: 1.15,
      label: "Festival travel crowds regional airports",
      icon: "star-outline",
    },
  ],

  // November
  10: [
    {
      region: "north_america",
      multiplier: 1.18,
      label: "Thanksgiving travel fills airports nationwide",
      icon: "airplane-outline",
    },
    {
      region: "south_asia",
      multiplier: 1.12,
      label: "Festival season drives strong passenger growth",
      icon: "star-outline",
    },
    {
      region: "north_europe",
      multiplier: 0.88,
      label: "Cold weather slows tourism demand",
      icon: "cloudy-outline",
    },
    {
      region: "middle_east",
      multiplier: 1.08,
      label: "Cooler temperatures revive tourism",
      icon: "partly-sunny-outline",
    },
    {
      region: "oceania",
      multiplier: 1.12,
      label: "Summer travel bookings rise sharply",
      icon: "sunny-outline",
    },
  ],

  // December
  11: [
    {
      region: "north_europe",
      multiplier: 1.22,
      label: "Christmas markets attract huge crowds",
      icon: "snow-outline",
    },
    {
      region: "north_america",
      multiplier: 1.28,
      label: "Holiday travel frenzy overwhelms airports",
      icon: "snow-outline",
    },
    {
      region: "oceania",
      multiplier: 1.2,
      label: "Summer holidays drive record travel demand",
      icon: "sunny-outline",
    },
    {
      region: "latin_america",
      multiplier: 1.15,
      label: "Holidaymakers fuel tourism surge",
      icon: "airplane-outline",
    },
    {
      region: "southeast_asia",
      multiplier: 1.1,
      label: "Year-end travel crowds regional hubs",
      icon: "airplane-outline",
    },
    {
      region: "middle_east",
      multiplier: 1.05,
      label: "International holiday traffic increases",
      icon: "airplane-outline",
    },
    {
      region: "east_asia",
      multiplier: 0.92,
      label: "Travel demand softens after autumn peak",
      icon: "remove-outline",
    },
  ],
};

// ── Continent → base region ───────────────────────────────────────
// Primary lookup — every airport has a continent code (AF/AS/EU/NA/OC/SA).
export const CONTINENT_REGION: Record<string, SeasonRegion> = {
  // Europe defaults to northern/central Europe.
  // Southern countries overridden below.
  EU: "north_europe",

  // USA + Canada style travel demand.
  // Mexico overridden separately.
  NA: "north_america",

  // South America + tourism-heavy Caribbean behavior.
  SA: "latin_america",

  // Asia is too diverse to map cleanly.
  // Use a neutral fallback and rely on country overrides heavily.
  AS: "middle_east",

  // Mostly neutral for now unless specifically overridden.
  AF: "africa",

  // Australia + NZ + Pacific islands.
  OC: "oceania",
};

// ── Country overrides ─────────────────────────────────────────────
// ── Country overrides ─────────────────────────────────────────────
// Used where continent-level seasonality is inaccurate.
export const COUNTRY_OVERRIDE: Record<string, SeasonRegion> = {
  // ── Mediterranean Europe ───────────────────────────────────────
  ES: "mediterranean",
  IT: "mediterranean",
  GR: "mediterranean",
  TR: "mediterranean",
  HR: "mediterranean",
  MT: "mediterranean",
  CY: "mediterranean",
  AL: "mediterranean",
  ME: "mediterranean",

  // ── Mediterranean North Africa ────────────────────────────────
  MA: "mediterranean",
  TN: "mediterranean",
  DZ: "mediterranean",
  LY: "mediterranean",

  // ── East Asia ─────────────────────────────────────────────────
  JP: "east_asia",
  KR: "east_asia",
  CN: "east_asia",
  TW: "east_asia",
  HK: "east_asia",
  MO: "east_asia",
  MN: "east_asia",

  // ── Southeast Asia ────────────────────────────────────────────
  PH: "southeast_asia",
  TH: "southeast_asia",
  SG: "southeast_asia",
  ID: "southeast_asia",
  MY: "southeast_asia",
  VN: "southeast_asia",
  MM: "southeast_asia",
  KH: "southeast_asia",
  LA: "southeast_asia",
  BN: "southeast_asia",
  TL: "southeast_asia",

  // ── South Asia ────────────────────────────────────────────────
  IN: "south_asia",
  PK: "south_asia",
  BD: "south_asia",
  LK: "south_asia",
  NP: "south_asia",
  MV: "south_asia",
  BT: "south_asia",

  // ── Middle East ───────────────────────────────────────────────
  AE: "middle_east",
  SA: "middle_east",
  QA: "middle_east",
  KW: "middle_east",
  BH: "middle_east",
  OM: "middle_east",
  YE: "middle_east",
  JO: "middle_east",
  IQ: "middle_east",
  IR: "middle_east",
  IL: "middle_east",
  LB: "middle_east",
  SY: "middle_east",
  EG: "middle_east",

  // ── Central Asia ──────────────────────────────────────────────
  KZ: "middle_east",
  UZ: "middle_east",
  KG: "middle_east",
  TM: "middle_east",
  TJ: "middle_east",

  // ── Latin America Overrides ──────────────────────────────────
  MX: "latin_america",

  // ── Caribbean Tourism Markets ────────────────────────────────
  CU: "latin_america",
  DO: "latin_america",
  JM: "latin_america",
  BS: "latin_america",
  TT: "latin_america",
  BB: "latin_america",
  PR: "latin_america",
};

export function getSeasonRegion(
  continent: string,
  country: string,
): SeasonRegion {
  return (
    COUNTRY_OVERRIDE[country] ?? CONTINENT_REGION[continent] ?? "north_america"
  );
}

export function getRegionForAirport(params: {
  country?: string | null;
  continent?: string | null;
}): SeasonRegion {
  const country = params.country?.toUpperCase();
  const continent = params.continent?.toUpperCase();

  // Country override — most specific
  if (country && COUNTRY_OVERRIDE[country]) return COUNTRY_OVERRIDE[country];

  // Continent fallback — always available
  if (continent && CONTINENT_REGION[continent])
    return CONTINENT_REGION[continent];

  return "global";
}

// ── Legacy helper for country-only callers ────────────────────────
export function getRegionForCountry(countryCode: string): SeasonRegion {
  return getRegionForAirport({ country: countryCode });
}

/**
 * Get seasonal multiplier for a route on a given game day.
 * Uses the DESTINATION country — passengers travel TO destinations.
 */
export function getSeasonalMultiplier(
  gameDay: number,
  destCountry?: string | null,
  destContinent?: string | null,
): number {
  const doy = getDayOfYear(gameDay);
  const month = getMonth(doy);
  const region = getRegionForAirport({
    country: destCountry,
    continent: destContinent,
  });
  const effects = SEASONAL_EFFECTS[month] ?? [];

  const match = effects.find((e) => e.region === region);
  return match?.multiplier ?? 1.0;
}

/**
 * Get the active seasonal effects for a game day.
 * Returns top effects sorted by impact for display in UI.
 */
export function getActiveSeason(gameDay: number): {
  month: number;
  effects: SeasonEffect[];
} {
  const doy = getDayOfYear(gameDay);
  const month = getMonth(doy);
  const effects = SEASONAL_EFFECTS[month] ?? [];

  return {
    month,
    effects: [...effects].sort(
      (a, b) => Math.abs(b.multiplier - 1) - Math.abs(a.multiplier - 1),
    ),
  };
}

/**
 * Get a display label for the current season.
 * Used in the TopHUD dispatch line.
 */
export function getSeasonLabel(gameDay: number): string | null {
  const { effects } = getActiveSeason(gameDay);
  if (effects.length === 0) return null;

  const top = effects[0];
  if (Math.abs(top.multiplier - 1.0) < 0.05) return null; // too small to mention

  return top.label;
}

/**
 * Get seasonal badge data for a route card.
 * Returns null if effect is too small to show (<5%).
 */
export function getSeasonForRoute(
  gameDay: number,
  destCountry?: string | null,
  destContinent?: string | null,
): { label: string; icon: string; color: string; pctLabel: string } | null {
  const doy = getDayOfYear(gameDay);
  const month = getMonth(doy);
  const region = getRegionForAirport({
    country: destCountry,
    continent: destContinent,
  });
  const effects = SEASONAL_EFFECTS[month] ?? [];
  const match = effects.find((e) => e.region === region);

  if (!match) return null;
  const diff = match.multiplier - 1.0;
  if (Math.abs(diff) < 0.05) return null; // too small to show

  const pct = Math.round(Math.abs(diff) * 100);
  const positive = diff > 0;

  return {
    label: match.label,
    icon: match.icon,
    color: positive ? "#22c55e" : "#f59e0b",
    pctLabel: positive ? `+${pct}%` : `-${pct}%`,
  };
}
