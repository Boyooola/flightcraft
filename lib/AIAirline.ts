/**
 * Deterministic rival-airline planning and economics.
 *
 * This file is the authority for rival hubs, fleet capability, routes, cash,
 * debt, trust, and expansion. Rivals do not create passenger demand and do not
 * decide market share. Passenger preference remains owned by passengerChoice.
 */

import {
  AIRLINE_LOGO_CATALOG,
  AIRLINE_PALETTES,
  normalizeAirlineCode,
  type AirlineLogoId,
  type AirlinePaletteId,
} from "@/lib/airlineBrand";
import { passengerMixFromDistance } from "@/lib/passengerTypes";
import { calcRouteRevenue, dailyFlights } from "@/lib/revenue";
import { seedHash } from "@/lib/seed";
import type { Airport } from "@/store";

export type AIDifficulty = "passive" | "balanced" | "aggressive";

export function normalizeAIDifficulty(value?: string): AIDifficulty {
  if (value === "passive" || value === "aggressive") return value;
  return "balanced";
}

export interface AIRoutePlan {
  originIata: string;
  destIata: string;
  openedDay: number;
}

export interface AIAirline {
  id: string;
  name: string;
  code: string;
  color: string;
  secondaryColor: string;
  logoId: AirlineLogoId;
  paletteId: AirlinePaletteId;
  difficulty: AIDifficulty;
  seed: string;
  index: number;
  day: number;
  cash: number;
  loan: number;
  netWorth: number;
  score: number;
  demandScore: number;
  reputation: number;
  trust: number;
  hubIatas: string[];
  routes: AIRoutePlan[];
  routeCount: number;
  planeCount: number;
  dailyProfit: number;
}

export interface ResolvedAIRoute extends AIRoutePlan {
  id: string;
  origin: Airport;
  dest: Airport;
  color: string;
}

interface DifficultyParams {
  expansionInterval: number;
  startingCash: number;
  startingLoan: number;
  startingRoutes: number;
  startingHubs: number;
  maxRoutes: number;
  maxHubs: number;
  maxRoutesPerHub: number;
  baseTrust: number;
  baseReputation: number;
  operatingEfficiency: number;
  routeLaunchCost: number;
  hubInvestment: number;
  cashReserve: number;
  fleetLeadDays: number;
}

interface AIFleetProfile {
  id: "regional" | "narrowbody" | "extended" | "widebody";
  availableDay: number;
  rangeNm: number;
  seatCapacity: number;
  speedKts: number;
  costPerSector: number;
  fuelPerNm: number;
  acquisitionCost: number;
}

interface RouteCandidate {
  route: AIRoutePlan;
  score: number;
}

interface SimulatedNetwork {
  hubIatas: string[];
  routes: AIRoutePlan[];
  cash: number;
  loan: number;
  trust: number;
  dailyProfit: number;
}

interface NetworkPerformance {
  dailyProfit: number;
  reliableShare: number;
}

const AI_NAMES = [
  "Meridian Air",
  "Coastline Airways",
  "Altitude Connect",
  "Juniper Airlines",
  "Summit Jet",
  "Bluehaven Air",
  "Skylane Regional",
  "Cedar Pacific",
  "Aurora Transit",
  "Atlas Link",
  "Solstice Airways",
  "Coral Meridian",
] as const;

interface AIIdentityContext {
  reservedLogoId?: AirlineLogoId;
  reservedPaletteId?: AirlinePaletteId;
}

function pickAIIdentity(
  gameSeed: string,
  index: number,
  context: AIIdentityContext = {},
) {
  const logos = AIRLINE_LOGO_CATALOG.filter(
    (logo) => logo.id !== context.reservedLogoId,
  );
  const palettes = AIRLINE_PALETTES.filter(
    (palette) => palette.id !== context.reservedPaletteId,
  );
  const logoOffset = seedHash(gameSeed, "ai-logo-order") % logos.length;
  const paletteOffset =
    seedHash(gameSeed, "ai-palette-order") % palettes.length;
  const logo = logos[(logoOffset + index) % logos.length];
  const palette = palettes[(paletteOffset + index) % palettes.length];

  return {
    logoId: logo.id,
    paletteId: palette.id,
    primaryColor: palette.primary,
    secondaryColor: palette.secondary,
  };
}

const PREFERRED_AI_HUBS = new Set([
  "ATL",
  "LAX",
  "ORD",
  "JFK",
  "DFW",
  "SFO",
  "SEA",
  "YYZ",
  "MEX",
  "GRU",
  "SCL",
  "EZE",
  "LHR",
  "CDG",
  "FRA",
  "AMS",
  "MAD",
  "FCO",
  "IST",
  "DXB",
  "DOH",
  "JED",
  "CAI",
  "JNB",
  "ADD",
  "DEL",
  "BOM",
  "SIN",
  "HKG",
  "HND",
  "NRT",
  "ICN",
  "PEK",
  "PVG",
  "CAN",
  "BKK",
  "KUL",
  "MNL",
  "CGK",
  "SYD",
  "MEL",
  "AKL",
]);

const DIFFICULTY_PARAMS: Record<AIDifficulty, DifficultyParams> = {
  passive: {
    expansionInterval: 8,
    startingCash: 1_200_000,
    startingLoan: 300_000,
    startingRoutes: 2,
    startingHubs: 1,
    maxRoutes: 14,
    maxHubs: 3,
    maxRoutesPerHub: 5,
    baseTrust: 44,
    baseReputation: 42,
    operatingEfficiency: 0.92,
    routeLaunchCost: 45_000,
    hubInvestment: 240_000,
    cashReserve: 180_000,
    fleetLeadDays: 0,
  },
  balanced: {
    expansionInterval: 6,
    startingCash: 1_600_000,
    startingLoan: 400_000,
    startingRoutes: 3,
    startingHubs: 1,
    maxRoutes: 20,
    maxHubs: 4,
    maxRoutesPerHub: 5,
    baseTrust: 50,
    baseReputation: 50,
    operatingEfficiency: 1,
    routeLaunchCost: 55_000,
    hubInvestment: 320_000,
    cashReserve: 250_000,
    fleetLeadDays: 3,
  },
  aggressive: {
    expansionInterval: 4,
    startingCash: 2_100_000,
    startingLoan: 550_000,
    startingRoutes: 3,
    startingHubs: 2,
    maxRoutes: 26,
    maxHubs: 5,
    maxRoutesPerHub: 6,
    baseTrust: 54,
    baseReputation: 58,
    operatingEfficiency: 1.06,
    routeLaunchCost: 70_000,
    hubInvestment: 420_000,
    cashReserve: 340_000,
    fleetLeadDays: 7,
  },
};

const FLEET_PROFILES: readonly AIFleetProfile[] = [
  {
    id: "regional",
    availableDay: 1,
    rangeNm: 1_200,
    seatCapacity: 76,
    speedKts: 330,
    costPerSector: 480,
    fuelPerNm: 1.25,
    acquisitionCost: 180_000,
  },
  {
    id: "narrowbody",
    availableDay: 12,
    rangeNm: 2_800,
    seatCapacity: 156,
    speedKts: 450,
    costPerSector: 760,
    fuelPerNm: 1.85,
    acquisitionCost: 420_000,
  },
  {
    id: "extended",
    availableDay: 30,
    rangeNm: 4_500,
    seatCapacity: 194,
    speedKts: 470,
    costPerSector: 1_050,
    fuelPerNm: 2.45,
    acquisitionCost: 680_000,
  },
  {
    id: "widebody",
    availableDay: 60,
    rangeNm: 7_200,
    seatCapacity: 282,
    speedKts: 490,
    costPerSector: 1_850,
    fuelPerNm: 3.9,
    acquisitionCost: 1_200_000,
  },
] as const;

const TIER_SCORE: Record<Airport["tier"], number> = {
  mega: 100,
  large: 82,
  major: 64,
  regional: 42,
  minor: 25,
  local: 12,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function airportTrafficScore(airport: Airport): number {
  if (airport.pax_annual_m != null) {
    return clamp(airport.pax_annual_m * 1.5, 8, 120);
  }

  return TIER_SCORE[airport.tier] ?? 20;
}

function distanceNm(from: Airport, to: Airport): number {
  const earthRadiusNm = 3_440.065;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(to.lat - from.lat);
  const longitudeDelta = toRadians(to.lng - from.lng);
  const fromLatitude = toRadians(from.lat);
  const toLatitude = toRadians(to.lat);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadiusNm * Math.asin(Math.min(1, Math.sqrt(value)));
}

function corridorKey(originIata: string, destinationIata: string): string {
  return [originIata, destinationIata].sort().join(":");
}

function sameCorridor(
  route: Pick<AIRoutePlan, "originIata" | "destIata">,
  originIata: string,
  destinationIata: string,
): boolean {
  return (
    corridorKey(route.originIata, route.destIata) ===
    corridorKey(originIata, destinationIata)
  );
}

export function aiServesCorridor(
  ai: AIAirline,
  originIata: string,
  destinationIata: string,
): boolean {
  return (ai.routes ?? []).some((route) =>
    sameCorridor(route, originIata, destinationIata),
  );
}

function fleetProfileForDay(
  day: number,
  difficulty: DifficultyParams,
): AIFleetProfile {
  const effectiveDay = Math.max(1, day + difficulty.fleetLeadDays);

  return FLEET_PROFILES.reduce(
    (current, profile) =>
      profile.availableDay <= effectiveDay ? profile : current,
    FLEET_PROFILES[0],
  );
}

function fleetProfileForRoute(
  route: AIRoutePlan,
  difficulty: DifficultyParams,
): AIFleetProfile {
  return fleetProfileForDay(route.openedDay, difficulty);
}

export function pickAIHubs(
  gameSeed: string,
  aiIndex: number,
  count: number,
  airports: Airport[],
): string[] {
  if (count <= 0 || airports.length === 0) return [];

  const candidates = airports
    .filter((airport) => airportTrafficScore(airport) >= 42)
    .map((airport) => ({
      airport,
      baseScore:
        airportTrafficScore(airport) +
        (PREFERRED_AI_HUBS.has(airport.iata) ? 24 : 0) +
        (seedHash(gameSeed, "ai-hub-pool", aiIndex, airport.iata) % 31),
    }))
    .sort((left, right) => right.baseScore - left.baseScore)
    .slice(0, 180)
    .map((candidate) => candidate.airport);

  if (candidates.length === 0) return [];

  const selected: Airport[] = [];

  while (selected.length < Math.min(count, candidates.length)) {
    const slot = selected.length;
    const next = candidates
      .filter(
        (candidate) =>
          !selected.some((airport) => airport.iata === candidate.iata),
      )
      .map((candidate) => {
        const nearestHubDistance =
          selected.length === 0
            ? 0
            : Math.min(
                ...selected.map((airport) => distanceNm(airport, candidate)),
              );
        const geographicSpread = Math.min(46, nearestHubDistance / 100);
        const variation =
          (seedHash(gameSeed, "ai-hub", aiIndex, slot, candidate.iata) % 31) -
          15;

        return {
          airport: candidate,
          score:
            airportTrafficScore(candidate) +
            (PREFERRED_AI_HUBS.has(candidate.iata) ? 18 : 0) +
            geographicSpread +
            variation,
        };
      })
      .sort((left, right) => right.score - left.score)[0]?.airport;

    if (!next) break;
    selected.push(next);
  }

  return selected.map((airport) => airport.iata);
}

function routePlanningPool(params: {
  gameSeed: string;
  aiIndex: number;
  airports: Airport[];
  hubOrder: string[];
}): Airport[] {
  const hubIatas = new Set(params.hubOrder);
  const ranked = params.airports
    .map((airport) => ({
      airport,
      score:
        airportTrafficScore(airport) * 2 +
        (PREFERRED_AI_HUBS.has(airport.iata) ? 18 : 0) +
        (seedHash(
          params.gameSeed,
          "ai-destination-pool",
          params.aiIndex,
          airport.iata,
        ) %
          61),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 800)
    .map((candidate) => candidate.airport);
  const byIata = new Map(ranked.map((airport) => [airport.iata, airport]));

  params.airports.forEach((airport) => {
    if (hubIatas.has(airport.iata)) byIata.set(airport.iata, airport);
  });

  return Array.from(byIata.values());
}

function estimateRouteDailyProfit(params: {
  route: AIRoutePlan;
  airportByIata: Map<string, Airport>;
  trust: number;
  difficulty: DifficultyParams;
  distanceNm?: number;
  trafficPotential?: number;
}): number {
  const origin = params.airportByIata.get(params.route.originIata);
  const destination = params.airportByIata.get(params.route.destIata);
  if (!origin || !destination) return 0;

  const aircraft = fleetProfileForRoute(params.route, params.difficulty);
  const distNm = params.distanceNm ?? distanceNm(origin, destination);
  if (distNm > aircraft.rangeNm) return 0;

  const rotations = dailyFlights(distNm, aircraft.speedKts);
  const trafficPotential =
    params.trafficPotential ??
    Math.sqrt(airportTrafficScore(origin) * airportTrafficScore(destination));
  const dailyMarket =
    (90 + trafficPotential * 3.4) * (0.76 + params.trust / 200);
  const boardedPax = Math.min(
    aircraft.seatCapacity,
    Math.max(0, Math.round(dailyMarket / Math.max(1, rotations))),
  );
  const mix = passengerMixFromDistance(distNm);
  const result = calcRouteRevenue({
    distNm,
    speedKts: aircraft.speedKts,
    trustPct: params.trust,
    boardedPax,
    seatCapacity: aircraft.seatCapacity,
    costPerSector: aircraft.costPerSector,
    fuelPerNm: aircraft.fuelPerNm,
    priceStrategy: "standard",
    priceElasticity: 1,
    crowdMultiplier: 1,
    congestionMultiplier: 1,
    businessPct: mix.businessPct,
    leisurePct: mix.leisurePct,
  });

  return Math.round(
    result.net *
      result.utilization.flightsPerDay *
      params.difficulty.operatingEfficiency,
  );
}

function chooseRouteCandidate(params: {
  gameSeed: string;
  aiIndex: number;
  slot: number;
  day: number;
  originIatas: string[];
  airports: Airport[];
  airportByIata: Map<string, Airport>;
  existing: AIRoutePlan[];
  trust: number;
  difficulty: DifficultyParams;
}): RouteCandidate | null {
  const aircraft = fleetProfileForDay(params.day, params.difficulty);
  const existingCorridors = new Set(
    params.existing.map((route) =>
      corridorKey(route.originIata, route.destIata),
    ),
  );
  const candidates: RouteCandidate[] = [];

  params.originIatas.forEach((originIata) => {
    const origin = params.airportByIata.get(originIata);
    if (!origin) return;

    const shortlist = params.airports
      .flatMap((destination) => {
        if (destination.iata === origin.iata) return [];

        const corridor = corridorKey(origin.iata, destination.iata);
        if (existingCorridors.has(corridor)) return [];

        const distance = distanceNm(origin, destination);
        if (distance < 90 || distance > aircraft.rangeNm) return [];

        const destinationTraffic = airportTrafficScore(destination);
        const trafficPotential = Math.sqrt(
          airportTrafficScore(origin) * destinationTraffic,
        );
        const rangeUse = distance / aircraft.rangeNm;
        const rangeFit = Math.max(0, 32 - Math.abs(rangeUse - 0.58) * 45);
        const regionalFit = origin.continent === destination.continent ? 10 : 0;
        const networkConnection = params.originIatas.includes(destination.iata)
          ? 8
          : 0;
        const variation =
          (seedHash(
            params.gameSeed,
            "ai-route",
            params.aiIndex,
            params.slot,
            origin.iata,
            destination.iata,
          ) %
            35) -
          17;

        return [
          {
            destination,
            distance,
            trafficPotential,
            destinationTraffic,
            rangeFit,
            regionalFit,
            networkConnection,
            variation,
            preliminaryScore:
              destinationTraffic +
              rangeFit +
              regionalFit +
              networkConnection +
              variation,
          },
        ];
      })
      .sort((left, right) => right.preliminaryScore - left.preliminaryScore)
      .slice(0, 140);

    shortlist.forEach((option) => {
      const destination = option.destination;

      const route: AIRoutePlan = {
        originIata: origin.iata,
        destIata: destination.iata,
        openedDay: params.day,
      };
      const dailyProfit = estimateRouteDailyProfit({
        route,
        airportByIata: params.airportByIata,
        trust: params.trust,
        difficulty: params.difficulty,
        distanceNm: option.distance,
        trafficPotential: option.trafficPotential,
      });
      if (dailyProfit <= 0) return;

      candidates.push({
        route,
        score:
          dailyProfit / 450 +
          option.destinationTraffic +
          option.rangeFit +
          option.regionalFit +
          option.networkConnection +
          option.variation,
      });
    });
  });

  return (
    candidates.sort(
      (left, right) =>
        right.score - left.score ||
        corridorKey(left.route.originIata, left.route.destIata).localeCompare(
          corridorKey(right.route.originIata, right.route.destIata),
        ),
    )[0] ?? null
  );
}

function networkPerformance(params: {
  routes: AIRoutePlan[];
  airportByIata: Map<string, Airport>;
  trust: number;
  difficulty: DifficultyParams;
}): NetworkPerformance {
  if (params.routes.length === 0) {
    return { dailyProfit: 0, reliableShare: 0 };
  }

  const profits = params.routes.map((route) =>
    estimateRouteDailyProfit({
      route,
      airportByIata: params.airportByIata,
      trust: params.trust,
      difficulty: params.difficulty,
    }),
  );

  return {
    dailyProfit: profits.reduce((total, profit) => total + profit, 0),
    reliableShare:
      profits.filter((profit) => profit > 0).length / params.routes.length,
  };
}

function updateTrust(params: {
  trust: number;
  routeCount: number;
  reliableShare: number;
  cash: number;
}): number {
  if (params.routeCount === 0) return Math.max(20, params.trust - 0.2);

  const delta =
    params.reliableShare >= 0.8
      ? 0.08
      : params.reliableShare >= 0.55
        ? 0.01
        : -0.12;
  const cashPenalty = params.cash <= 0 ? 0.08 : 0;

  return clamp(params.trust + delta - cashPenalty, 20, 88);
}

function expansionCost(day: number, difficulty: DifficultyParams): number {
  return (
    fleetProfileForDay(day, difficulty).acquisitionCost +
    difficulty.routeLaunchCost
  );
}

function tryExpandNetwork(params: {
  gameSeed: string;
  aiIndex: number;
  day: number;
  airportByIata: Map<string, Airport>;
  airports: Airport[];
  hubOrder: string[];
  network: SimulatedNetwork;
  difficulty: DifficultyParams;
}): boolean {
  const { network, difficulty } = params;
  if (network.routes.length >= difficulty.maxRoutes) return false;

  const routeCost = expansionCost(params.day, difficulty);
  const atHubCapacity =
    network.routes.length >=
    network.hubIatas.length * difficulty.maxRoutesPerHub;
  const canAddHub = network.hubIatas.length < difficulty.maxHubs;
  const shouldAddHub =
    canAddHub &&
    (atHubCapacity || network.routes.length >= network.hubIatas.length * 4);
  const nextHubIata = params.hubOrder[network.hubIatas.length];

  if (shouldAddHub && nextHubIata) {
    const candidate = chooseRouteCandidate({
      gameSeed: params.gameSeed,
      aiIndex: params.aiIndex,
      slot: network.routes.length,
      day: params.day,
      originIatas: [nextHubIata],
      airports: params.airports,
      airportByIata: params.airportByIata,
      existing: network.routes,
      trust: network.trust,
      difficulty,
    });
    const totalCost = difficulty.hubInvestment + routeCost;

    if (candidate && network.cash - totalCost >= difficulty.cashReserve) {
      network.cash -= totalCost;
      network.hubIatas.push(nextHubIata);
      network.routes.push(candidate.route);
      return true;
    }
  }

  if (atHubCapacity) return false;

  const candidate = chooseRouteCandidate({
    gameSeed: params.gameSeed,
    aiIndex: params.aiIndex,
    slot: network.routes.length,
    day: params.day,
    originIatas: network.hubIatas,
    airports: params.airports,
    airportByIata: params.airportByIata,
    existing: network.routes,
    trust: network.trust,
    difficulty,
  });

  if (!candidate || network.cash - routeCost < difficulty.cashReserve) {
    return false;
  }

  network.cash -= routeCost;
  network.routes.push(candidate.route);
  return true;
}

function simulateNetwork(params: {
  gameSeed: string;
  aiIndex: number;
  day: number;
  difficulty: AIDifficulty;
  airports: Airport[];
}): SimulatedNetwork {
  const difficulty = DIFFICULTY_PARAMS[params.difficulty];
  const safeDay = Math.max(1, Math.floor(params.day));
  const airportByIata = new Map(
    params.airports.map((airport) => [airport.iata, airport]),
  );
  const hubOrder = pickAIHubs(
    params.gameSeed,
    params.aiIndex,
    difficulty.maxHubs,
    params.airports,
  );
  const planningAirports = routePlanningPool({
    gameSeed: params.gameSeed,
    aiIndex: params.aiIndex,
    airports: params.airports,
    hubOrder,
  });
  const network: SimulatedNetwork = {
    hubIatas: hubOrder.slice(0, difficulty.startingHubs),
    routes: [],
    cash: difficulty.startingCash,
    loan: difficulty.startingLoan,
    trust: difficulty.baseTrust,
    dailyProfit: 0,
  };

  for (let slot = 0; slot < difficulty.startingRoutes; slot++) {
    const candidate = chooseRouteCandidate({
      gameSeed: params.gameSeed,
      aiIndex: params.aiIndex,
      slot,
      day: 1,
      originIatas: network.hubIatas,
      airports: planningAirports,
      airportByIata,
      existing: network.routes,
      trust: network.trust,
      difficulty,
    });
    if (!candidate) break;

    const cost = expansionCost(1, difficulty);
    if (network.cash - cost < 0) break;
    network.cash -= cost;
    network.routes.push(candidate.route);
  }

  let nextExpansionDay = 1 + difficulty.expansionInterval;

  for (let currentDay = 1; currentDay <= safeDay; currentDay++) {
    const performance = networkPerformance({
      routes: network.routes,
      airportByIata,
      trust: network.trust,
      difficulty,
    });
    network.dailyProfit = performance.dailyProfit;
    network.cash = Math.max(0, network.cash + performance.dailyProfit);

    const dailyInterest = Math.round(network.loan * 0.00025);
    network.loan += dailyInterest;
    if (performance.dailyProfit > 0 && network.loan > 0) {
      const plannedPayment = Math.max(
        600,
        Math.round(performance.dailyProfit * 0.08),
      );
      const availableForDebt = Math.max(
        0,
        network.cash - difficulty.cashReserve,
      );
      const payment = Math.min(network.loan, plannedPayment, availableForDebt);
      network.cash -= payment;
      network.loan -= payment;
    }

    network.trust = updateTrust({
      trust: network.trust,
      routeCount: network.routes.length,
      reliableShare: performance.reliableShare,
      cash: network.cash,
    });

    if (
      currentDay >= nextExpansionDay &&
      network.routes.length < difficulty.maxRoutes
    ) {
      const expanded = tryExpandNetwork({
        gameSeed: params.gameSeed,
        aiIndex: params.aiIndex,
        day: currentDay,
        airportByIata,
        airports: planningAirports,
        hubOrder,
        network,
        difficulty,
      });
      nextExpansionDay = expanded
        ? currentDay + difficulty.expansionInterval
        : currentDay + 1;
    }
  }

  network.dailyProfit = networkPerformance({
    routes: network.routes,
    airportByIata,
    trust: network.trust,
    difficulty,
  }).dailyProfit;

  return network;
}

export function buildAIRoutes(
  ai: AIAirline,
  airports: Airport[],
): ResolvedAIRoute[] {
  const airportByIata = new Map(
    airports.map((airport) => [airport.iata, airport]),
  );

  return (ai.routes ?? []).flatMap((route, index) => {
    const origin = airportByIata.get(route.originIata);
    const dest = airportByIata.get(route.destIata);
    if (!origin || !dest) return [];

    return [
      {
        ...route,
        id: `${ai.id}-route-${index}-${origin.iata}-${dest.iata}`,
        origin,
        dest,
        color: ai.color,
      },
    ];
  });
}

export function computeAIState(
  gameSeed: string,
  index: number,
  day: number,
  difficulty: AIDifficulty,
  airports: Airport[] = [],
  identityContext: AIIdentityContext = {},
): AIAirline {
  const safeDay = Math.max(1, Math.floor(day));
  const difficultyParams = DIFFICULTY_PARAMS[difficulty];
  const network = simulateNetwork({
    gameSeed,
    aiIndex: index,
    day: safeDay,
    difficulty,
    airports,
  });
  const nameOffset = seedHash(gameSeed, "ai-name-order") % AI_NAMES.length;
  const name = AI_NAMES[(nameOffset + index) % AI_NAMES.length];
  const identity = pickAIIdentity(gameSeed, index, identityContext);
  const fleetValue = network.routes.reduce(
    (total, route) =>
      total +
      fleetProfileForRoute(route, difficultyParams).acquisitionCost * 0.7,
    0,
  );
  const hubValue = network.hubIatas.length * difficultyParams.hubInvestment;
  const netWorth = Math.max(
    0,
    Math.round(network.cash - network.loan + fleetValue + hubValue),
  );
  const reputation = clamp(
    difficultyParams.baseReputation +
      network.routes.length * 1.25 +
      network.hubIatas.length * 2 +
      Math.floor((safeDay - 1) / 30),
    0,
    95,
  );
  const demandScore = network.routes.length;
  const score = Math.round(
    netWorth +
      Math.max(0, network.dailyProfit) * 8 +
      network.trust * 1_000 +
      reputation * 500,
  );

  return {
    id: `ai-${gameSeed}-${index}`,
    name,
    code: normalizeAirlineCode(undefined, name),
    color: identity.primaryColor,
    secondaryColor: identity.secondaryColor,
    logoId: identity.logoId,
    paletteId: identity.paletteId,
    difficulty,
    seed: gameSeed,
    index,
    day: safeDay,
    cash: Math.round(network.cash),
    loan: Math.round(network.loan),
    netWorth,
    score,
    demandScore,
    reputation: Math.round(reputation),
    trust: Math.round(network.trust),
    hubIatas: network.hubIatas,
    routes: network.routes,
    routeCount: network.routes.length,
    planeCount: network.routes.length,
    dailyProfit: network.dailyProfit,
  };
}

export function computeAIRoster(params: {
  gameSeed: string;
  count: number;
  day: number;
  difficulty: AIDifficulty;
  airports: Airport[];
  reservedLogoId?: AirlineLogoId;
  reservedPaletteId?: AirlinePaletteId;
}): AIAirline[] {
  const count = clamp(Math.floor(params.count), 0, 5);

  return Array.from({ length: count }, (_, index) =>
    computeAIState(
      params.gameSeed,
      index,
      params.day,
      params.difficulty,
      params.airports,
      {
        reservedLogoId: params.reservedLogoId,
        reservedPaletteId: params.reservedPaletteId,
      },
    ),
  );
}

export function getNewAIRouteConflicts(
  gameSeed: string,
  aiIndex: number,
  currentDay: number,
  difficulty: AIDifficulty,
  playerMarkets: { origin: { iata: string }; dest: { iata: string } }[],
  airports: Airport[],
): { aiName: string; origin: string; dest: string }[] {
  if (currentDay <= 1) return [];

  const current = computeAIState(
    gameSeed,
    aiIndex,
    currentDay,
    difficulty,
    airports,
  );
  const previous = computeAIState(
    gameSeed,
    aiIndex,
    currentDay - 1,
    difficulty,
    airports,
  );
  const previousCorridors = new Set(
    previous.routes.map((route) =>
      corridorKey(route.originIata, route.destIata),
    ),
  );

  return current.routes.flatMap((route) => {
    const corridor = corridorKey(route.originIata, route.destIata);
    if (previousCorridors.has(corridor)) return [];

    const affectsPlayerMarket = playerMarkets.some((market) =>
      sameCorridor(route, market.origin.iata, market.dest.iata),
    );
    if (!affectsPlayerMarket) return [];

    return [
      {
        aiName: current.name,
        origin: route.originIata,
        dest: route.destIata,
      },
    ];
  });
}
