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
  | "north_europe" // UK, Germany, Scandinavia, France
  | "mediterranean" // Spain, Italy, Greece, Turkey
  | "north_america" // USA, Canada
  | "east_asia" // China, Japan, Korea, Taiwan
  | "southeast_asia" // Philippines, Thailand, Singapore, Indonesia
  | "south_asia" // India, Pakistan, Bangladesh
  | "middle_east" // UAE, Saudi, Qatar
  | "australia" // Australia, New Zealand
  | "latin_america" // Brazil, Mexico, Colombia
  | "africa" // General Africa
  | "global"; // Catch-all

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
  // January — post-holiday slump in West, Lunar New Year prep in Asia
  0: [
    {
      region: "north_europe",
      multiplier: 0.82,
      label: "Winter lull",
      icon: "snow-outline",
    },
    {
      region: "north_america",
      multiplier: 0.85,
      label: "Post-holiday dip",
      icon: "trending-down-outline",
    },
    {
      region: "east_asia",
      multiplier: 1.18,
      label: "Lunar New Year",
      icon: "star-outline",
    },
    {
      region: "southeast_asia",
      multiplier: 1.12,
      label: "Lunar New Year",
      icon: "star-outline",
    },
    {
      region: "australia",
      multiplier: 1.15,
      label: "Summer peak",
      icon: "sunny-outline",
    },
    {
      region: "middle_east",
      multiplier: 0.9,
      label: "Quiet season",
      icon: "remove-outline",
    },
  ],
  // February — Lunar New Year peak, Valentine's travel
  1: [
    {
      region: "east_asia",
      multiplier: 1.28,
      label: "Lunar New Year peak",
      icon: "star-outline",
    },
    {
      region: "southeast_asia",
      multiplier: 1.22,
      label: "Lunar New Year peak",
      icon: "star-outline",
    },
    {
      region: "north_america",
      multiplier: 0.88,
      label: "Winter dip",
      icon: "snow-outline",
    },
    {
      region: "north_europe",
      multiplier: 0.8,
      label: "Winter lull",
      icon: "snow-outline",
    },
    {
      region: "australia",
      multiplier: 1.1,
      label: "Late summer",
      icon: "sunny-outline",
    },
  ],
  // March — Spring break, school holidays begin
  2: [
    {
      region: "north_america",
      multiplier: 1.12,
      label: "Spring break",
      icon: "airplane-outline",
    },
    {
      region: "mediterranean",
      multiplier: 1.08,
      label: "Early season",
      icon: "partly-sunny-outline",
    },
    {
      region: "north_europe",
      multiplier: 0.9,
      label: "Pre-season",
      icon: "partly-sunny-outline",
    },
    {
      region: "middle_east",
      multiplier: 0.88,
      label: "Ramadan quiet",
      icon: "moon-outline",
    },
  ],
  // April — Easter travel, spring peak begins
  3: [
    {
      region: "north_europe",
      multiplier: 1.1,
      label: "Easter travel",
      icon: "airplane-outline",
    },
    {
      region: "mediterranean",
      multiplier: 1.15,
      label: "Spring surge",
      icon: "sunny-outline",
    },
    {
      region: "north_america",
      multiplier: 1.08,
      label: "Spring travel",
      icon: "partly-sunny-outline",
    },
    {
      region: "middle_east",
      multiplier: 0.85,
      label: "Ramadan dip",
      icon: "moon-outline",
    },
  ],
  // May — Strong leisure demand building worldwide
  4: [
    {
      region: "north_europe",
      multiplier: 1.12,
      label: "Spring peak",
      icon: "sunny-outline",
    },
    {
      region: "mediterranean",
      multiplier: 1.18,
      label: "Pre-summer surge",
      icon: "sunny-outline",
    },
    {
      region: "north_america",
      multiplier: 1.1,
      label: "Memorial Day",
      icon: "airplane-outline",
    },
    {
      region: "east_asia",
      multiplier: 1.08,
      label: "Golden Week",
      icon: "star-outline",
    },
    {
      region: "south_asia",
      multiplier: 0.85,
      label: "Monsoon slowdown",
      icon: "rainy-outline",
    },
  ],
  // June — Summer peak in Northern Hemisphere
  5: [
    {
      region: "north_europe",
      multiplier: 1.22,
      label: "Summer peak",
      icon: "sunny-outline",
    },
    {
      region: "mediterranean",
      multiplier: 1.3,
      label: "Peak summer",
      icon: "sunny-outline",
    },
    {
      region: "north_america",
      multiplier: 1.18,
      label: "Summer peak",
      icon: "sunny-outline",
    },
    {
      region: "australia",
      multiplier: 0.88,
      label: "Winter dip",
      icon: "snow-outline",
    },
    {
      region: "south_asia",
      multiplier: 0.8,
      label: "Monsoon season",
      icon: "rainy-outline",
    },
  ],
  // July — Peak summer globally
  6: [
    {
      region: "north_europe",
      multiplier: 1.28,
      label: "Peak summer",
      icon: "sunny-outline",
    },
    {
      region: "mediterranean",
      multiplier: 1.35,
      label: "Peak summer",
      icon: "sunny-outline",
    },
    {
      region: "north_america",
      multiplier: 1.25,
      label: "Peak summer",
      icon: "sunny-outline",
    },
    {
      region: "east_asia",
      multiplier: 1.12,
      label: "Summer holidays",
      icon: "sunny-outline",
    },
    {
      region: "australia",
      multiplier: 0.85,
      label: "Winter dip",
      icon: "snow-outline",
    },
    {
      region: "south_asia",
      multiplier: 0.78,
      label: "Monsoon peak",
      icon: "rainy-outline",
    },
    {
      region: "middle_east",
      multiplier: 0.82,
      label: "Heat season",
      icon: "thermometer-outline",
    },
  ],
  // August — Peak continues, back-to-school late month
  7: [
    {
      region: "north_europe",
      multiplier: 1.25,
      label: "Late summer peak",
      icon: "sunny-outline",
    },
    {
      region: "mediterranean",
      multiplier: 1.32,
      label: "Late summer peak",
      icon: "sunny-outline",
    },
    {
      region: "north_america",
      multiplier: 1.2,
      label: "Late summer",
      icon: "sunny-outline",
    },
    {
      region: "east_asia",
      multiplier: 1.08,
      label: "Summer holidays",
      icon: "sunny-outline",
    },
    {
      region: "australia",
      multiplier: 0.88,
      label: "Late winter",
      icon: "snow-outline",
    },
  ],
  // September — Post-summer drop, business travel rises
  8: [
    {
      region: "north_europe",
      multiplier: 0.95,
      label: "Post-summer",
      icon: "partly-sunny-outline",
    },
    {
      region: "mediterranean",
      multiplier: 1.08,
      label: "Shoulder season",
      icon: "partly-sunny-outline",
    },
    {
      region: "north_america",
      multiplier: 0.92,
      label: "Post-summer dip",
      icon: "trending-down-outline",
    },
    {
      region: "australia",
      multiplier: 1.05,
      label: "Spring warming",
      icon: "partly-sunny-outline",
    },
    {
      region: "east_asia",
      multiplier: 1.1,
      label: "Golden Week",
      icon: "star-outline",
    },
  ],
  // October — Autumn travel, Golden Week Japan, festivals
  9: [
    {
      region: "east_asia",
      multiplier: 1.2,
      label: "Golden Week",
      icon: "star-outline",
    },
    {
      region: "north_america",
      multiplier: 1.05,
      label: "Fall travel",
      icon: "leaf-outline",
    },
    {
      region: "mediterranean",
      multiplier: 0.95,
      label: "Off-season begins",
      icon: "partly-sunny-outline",
    },
    {
      region: "australia",
      multiplier: 1.1,
      label: "Spring surge",
      icon: "sunny-outline",
    },
    {
      region: "south_asia",
      multiplier: 1.15,
      label: "Diwali travel",
      icon: "star-outline",
    },
  ],
  // November — Pre-holiday building, Diwali
  10: [
    {
      region: "north_america",
      multiplier: 1.18,
      label: "Thanksgiving",
      icon: "airplane-outline",
    },
    {
      region: "south_asia",
      multiplier: 1.12,
      label: "Festival season",
      icon: "star-outline",
    },
    {
      region: "north_europe",
      multiplier: 0.88,
      label: "Autumn lull",
      icon: "cloudy-outline",
    },
    {
      region: "middle_east",
      multiplier: 1.08,
      label: "Cooler season",
      icon: "partly-sunny-outline",
    },
    {
      region: "australia",
      multiplier: 1.12,
      label: "Summer approaching",
      icon: "sunny-outline",
    },
  ],
  // December — Christmas/holiday peak everywhere
  11: [
    {
      region: "north_europe",
      multiplier: 1.22,
      label: "Christmas peak",
      icon: "snow-outline",
    },
    {
      region: "north_america",
      multiplier: 1.28,
      label: "Holiday peak",
      icon: "snow-outline",
    },
    {
      region: "australia",
      multiplier: 1.2,
      label: "Summer + Christmas",
      icon: "sunny-outline",
    },
    {
      region: "latin_america",
      multiplier: 1.15,
      label: "Holiday season",
      icon: "airplane-outline",
    },
    {
      region: "southeast_asia",
      multiplier: 1.1,
      label: "Holiday rush",
      icon: "airplane-outline",
    },
    {
      region: "middle_east",
      multiplier: 1.05,
      label: "Holiday travel",
      icon: "airplane-outline",
    },
    {
      region: "east_asia",
      multiplier: 0.92,
      label: "Quiet season",
      icon: "remove-outline",
    },
  ],
};

// ── Continent → base region ───────────────────────────────────────
// Primary lookup — every airport has a continent code (AF/AS/EU/NA/OC/SA).
const CONTINENT_REGION: Record<string, SeasonRegion> = {
  EU: "north_europe", // refined by country override below
  NA: "north_america",
  SA: "latin_america",
  AS: "east_asia", // refined by country override below
  AF: "africa",
  OC: "australia",
};

// ── Country overrides ─────────────────────────────────────────────
// Only where continent is too broad.
// EU → splits into north_europe vs mediterranean.
// AS → splits into east_asia / southeast_asia / south_asia / middle_east.
const COUNTRY_OVERRIDE: Record<string, SeasonRegion> = {
  // Mediterranean (EU continent, different seasonality)
  ES: "mediterranean",
  IT: "mediterranean",
  GR: "mediterranean",
  TR: "mediterranean",
  HR: "mediterranean",
  MT: "mediterranean",
  CY: "mediterranean",
  MK: "mediterranean",
  AL: "mediterranean",
  BA: "mediterranean",
  ME: "mediterranean",
  RS: "mediterranean",
  // Southeast Asia (AS continent)
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
  // South Asia (AS continent)
  IN: "south_asia",
  PK: "south_asia",
  BD: "south_asia",
  LK: "south_asia",
  NP: "south_asia",
  MV: "south_asia",
  BT: "south_asia",
  // Middle East (AS continent)
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
  // Mexico — latin_america seasonality despite NA continent
  MX: "latin_america",
};

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
 * Used in TopHUD or DailyEventCard.
 */
export function getSeasonLabel(gameDay: number): string | null {
  const { effects } = getActiveSeason(gameDay);
  if (effects.length === 0) return null;

  const top = effects[0];
  if (Math.abs(top.multiplier - 1.0) < 0.05) return null; // too small to mention

  return top.label;
}
