/**
 * store/FlightcraftStore.ts
 *
 * Single Zustand store for all game state.
 * Drives both the map and all bottom sheets.
 */

import type { DailyEvent } from "@/hooks/useDailyEvents";
import type { AIAirline } from "@/lib/AIAirline";
import {
  getAirlinePalette,
  getAirlinePaletteFromPrimary,
  normalizeAirlineCode,
  normalizeAirlineLogoId,
  normalizeAirlinePaletteId,
  normalizeHexColor,
  type AirlineLogoId,
  type AirlinePaletteId,
} from "@/lib/airlineBrand";
import type { ChoiceEvent, ResolvedChoice } from "@/lib/choiceEvents";
import type { AppliedDemandWave } from "@/lib/demandWaves";
import type { GlobalContractState } from "@/lib/globalContracts";
import type { Mission } from "@/lib/missions";
import type { PriceStrategy } from "@/lib/revenue";
import { create } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

// ─────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────

export type HaulClass = "short" | "medium" | "long";
/**
 * Compatibility status for persisted demand rows.
 *
 * "served" means today's travelers were handled, not that the market should
 * be removed. "no_plane" is retained until its opportunity is replaced.
 */
export type DemandStatus = "pending" | "served" | "no_plane";
export type FamilyId = "embraer" | "bombardier" | "boeing" | "airbus";
export type HubTier = 1 | 2 | 3 | 4 | 5 | 6;
export type GamePhase =
  | "auth"
  | "loading"
  | "setup"
  | "welcome"
  | "tutorial"
  | "playing"
  | "bankrupt";
export type GameSpeed = 0 | 1 | 2 | 3;

export type ActiveSheet =
  | null
  | "airport"
  | "fleet"
  | "finance"
  | "routes"
  | "settings"
  | "leaderboard"
  | "bank"
  | "create-route"
  | "achievements"
  | "missions"
  | "privacy-policy"
  | "manage-planes"
  | "assign-route";

export type AirportTier =
  "mega" | "large" | "major" | "regional" | "minor" | "local";

export interface Airport {
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  continent: string;
  lat: number;
  lng: number;
  tier: AirportTier;
  pax_annual_m: number | null;
}

export interface PlaneModel {
  id: string;
  manufacturer: string;
  family: FamilyId;
  model: string;
  nickname: string;
  tier: HubTier;
  pax_capacity: number;
  range_nm: number;
  speed_kts: number;
  price: number;
  cost_per_sector: number; // fixed cost per flight departure ($)
  fuel_per_nm: number; // variable fuel cost per nm ($)
  unlock_cash: number;
  unlock_demands: number;
  description: string;
  haul: HaulClass[];
}

export interface AirlineConfig {
  id: string;
  player_id: string;
  name: string;
  airline_code: string;
  color: string;
  secondary_color: string;
  logo_id: AirlineLogoId;
  palette_id: AirlinePaletteId;
  /** Legacy database mirror. New code should use logo_id. */
  icon: string;
  difficulty: string;
  cash: number;
  loan: number;
  loan_rate: number;
  day: number;
  speed: GameSpeed;
  reputation: number;
  demand_score: number;
  seed: string; // game seed — deterministic world generation
  ai_count: number; // 0-5 AI competitors
  ai_difficulty: string; // passive | balanced | aggressive
}

export interface OwnedHub {
  id: string;
  airport: Airport;
  tier: HubTier;
  trust: number;
  hub_pax: number; // cumulative pax moved through this hub; resets to 0 on upgrade
  /** Deprecated save field. Hub tiers no longer impose a trust floor. */
  trust_floor: number;
  nickname?: string; // player-defined hub name, max 20 chars
}

export interface Demand {
  id: string;
  airline_id: string;
  hub_iata: string;
  origin: Airport;
  dest: Airport;
  dist_nm: number;
  haul: HaulClass;
  status: DemandStatus;
  /** Passengers carried by the player today. Resets at day change. */
  delivered_pax_today: number;
  /** Total travelers in this OD market for the current game day. */
  base_pax_day: number;
  /** Legacy route-quality value. It must never change market size. */
  popularity: number;
  /** Passengers carried by rivals today. Resets at day change. */
  ai_stolen_pax?: number;
  price_elasticity?: number;
  business_pct?: number;
  leisure_pct?: number;
  /** Compatibility mirror of today's demand during the migration. */
  pax_ceiling: number;
}

export interface OwnedPlane {
  id: string;
  plane_model: PlaneModel;
  route_id: string | null;
  condition: number; // 0–100. 100=new, decreases with daily use
  days_active: number; // consecutive days on an active route
}

export interface Route {
  id: string;
  demand: Demand;
  plane: OwnedPlane;
  hub_iata: string;
  via_iata: string | null;
  total_dist_nm: number;
  via_pax_ratio: number | null; // O&D split: fraction of pax deplaning at via stop
  leg1_dist_nm: number | null; // origin → via distance (nm)
  leg2_dist_nm: number | null; // via → dest distance (nm)
  active: boolean;
  price_strategy?: PriceStrategy;
}

export interface LedgerEntry {
  id: string;
  day: number;
  type: "revenue" | "interest" | "purchase" | "loan" | "event";
  label: string;
  amount: number;
  route_id: string | null;
}

export interface AirportPresence {
  id: string;
  airport_iata: string;
  total_pax_delivered: number;
}

export interface LoadStep {
  key: string;
  label: string;
  status: "pending" | "loading" | "done" | "error";
  error?: string;
}

export interface WeeklyProgress {
  weekKey: number;
  passengers: number;
  routeEarnings: number;
  gameDays: number;
  profitableDays: number;
  speedThreeDays: number;
  achievementPoints: number;
}

export type WeeklyProgressDelta = Partial<Omit<WeeklyProgress, "weekKey">>;

// ─────────────────────────────────────────────────────────────────
// STORE SHAPE
// ─────────────────────────────────────────────────────────────────

export interface GameStore {
  // Auth
  boughtPlaneToday: boolean;
  dailyEvent: DailyEvent | null;
  globalContract: GlobalContractState | null;
  completedGlobalContracts: number;
  activeDemandWave: AppliedDemandWave | null;
  dayProgress: number; // 0 → 1 within the current game day
  todayCash: number; // exact cash earned today (resets each day)
  routeEarnings: Record<string, number>; // net earnings per route id, updated end of day
  aiAirlines: AIAirline[];
  weeklyProgress: WeeklyProgress;

  // Load
  loadSteps: LoadStep[];
  loadComplete: boolean;
  loadError: string | null;

  // Reference data
  airports: Airport[];
  planes: PlaneModel[];

  // Session
  phase: GamePhase;
  airline: AirlineConfig | null;
  earnedAchievements: Record<string, number>; // id → day earned
  dailyMissions: Mission[]; // today's 3 missions
  missionsCompleted: number; // lifetime total

  // Game objects
  hubs: OwnedHub[];
  demands: Demand[];
  ownedPlanes: OwnedPlane[];
  routes: Route[];
  ledger: LedgerEntry[];
  presence: AirportPresence[]; // cumulative pax delivered per destination airport

  // Mobile sheet + selection state
  activeSheet: ActiveSheet;
  selectedAirport: Airport | null;
  selectedPlaneGroup: { model: PlaneModel; planes: OwnedPlane[] } | null;
  selectedPlane: OwnedPlane | null;
  pendingDemand: Demand | null;
  routeCreationMode: boolean;
  creationWaypoints: Airport[];

  // Choice events
  pendingChoiceEvent: ChoiceEvent | null;
  activeChoiceConsequence: ResolvedChoice | null;
  resolvedChoiceEventIds: string[]; // prevents repeat events
  speedBeforeChoice: GameSpeed; // restores speed after choice

  // ── Actions ───────────────────────────────────────────────────

  // Load
  setLoadStep: (
    key: string,
    status: LoadStep["status"],
    error?: string,
  ) => void;
  setLoadComplete: () => void;
  setLoadError: (msg: string) => void;

  // Reference data
  setAirports: (airports: Airport[]) => void;
  setPlanes: (planes: PlaneModel[]) => void;

  // Session
  setPhase: (phase: GamePhase) => void;
  setBoughtPlaneToday: (val: boolean) => void;
  setDailyEvent: (event: DailyEvent | null) => void;
  setGlobalContract: (contract: GlobalContractState | null) => void;
  updateGlobalContract: (patch: Partial<GlobalContractState>) => void;
  completeGlobalContract: () => void;
  setActiveDemandWave: (wave: AppliedDemandWave | null) => void;
  setDayProgress: (value: number) => void;
  setAIAirlines: (airlines: AIAirline[]) => void;
  setWeeklyProgress: (progress: WeeklyProgress) => void;
  addWeeklyProgress: (delta: WeeklyProgressDelta) => void;
  setAirline: (airline: AirlineConfig) => void;
  updateAirline: (patch: Partial<AirlineConfig>) => void;
  setSelectedPlaneGroup: (planes: OwnedPlane[]) => void;

  resetTodayCash: () => void;
  setRouteEarnings: (earnings: Record<string, number>) => void;
  addRouteEarning: (routeId: string, amount: number) => void;

  // Achievements
  earnAchievement: (id: string, day: number) => void;

  // Missions
  setDailyMissions: (missions: Mission[]) => void;
  completeMission: (id: string) => void;

  // Hubs
  setHubs: (hubs: OwnedHub[]) => void;
  addHub: (hub: OwnedHub) => void;
  updateHub: (id: string, patch: Partial<OwnedHub>) => void;

  // Demands
  setDemands: (demands: Demand[]) => void;
  addDemands: (demands: Demand[]) => void;
  updateDemand: (id: string, patch: Partial<Demand>) => void;
  resetDailyPax: () => void;
  addPaxDelivered: (demandId: string, pax: number, lostToAI: number) => void;

  // Fleet
  setOwnedPlanes: (planes: OwnedPlane[]) => void;
  addOwnedPlane: (plane: OwnedPlane) => void;
  updateOwnedPlane: (id: string, patch: Partial<OwnedPlane>) => void;

  // Routes
  setRoutes: (routes: Route[]) => void;
  addRoute: (route: Route) => void;
  removeRoute: (id: string) => void;
  resetGame: () => void;
  setLedger: (entries: LedgerEntry[]) => void;
  addLedgerEntries: (entries: LedgerEntry[]) => void;

  // Presence
  setPresence: (presence: AirportPresence[]) => void;
  upsertPresence: (iata: string, pax: number) => void;

  // Economy
  spendCash: (amount: number) => void;
  earnCash: (amount: number) => void;
  accrueInterest: (amount: number) => void;
  repayLoan: (amount: number) => void;
  takeLoan: (amount: number, rate: number) => void;
  advanceDay: () => void;

  // Sheet control
  openSheet: (
    sheet: ActiveSheet,
    airport?: Airport,
    demand?: Demand,
    planeGroup?: { model: PlaneModel; planes: OwnedPlane[] } | null,
    plane?: OwnedPlane | null,
  ) => void;
  closeSheet: () => void;
  startRouteCreation: (preWaypoints?: Airport[]) => void;
  addWaypoint: (airport: Airport) => void;
  removeWaypoint: (iata: string) => void;
  reorderWaypoints: (waypoints: Airport[]) => void;
  clearRouteCreation: () => void;

  // Helpers
  getAirportByIata: (iata: string) => Airport | undefined;
  getPlaneById: (id: string) => PlaneModel | undefined;
  getHubByIata: (iata: string) => OwnedHub | undefined;
  getUnassignedPlanes: () => OwnedPlane[];

  setPendingChoiceEvent: (event: ChoiceEvent | null) => void;
  setActiveChoiceConsequence: (resolved: ResolvedChoice | null) => void;
  pauseForChoice: () => void;
  resumeAfterChoice: () => void;
  updatePlaneCondition: (planeId: string, newCondition: number) => void;
  setResolvedChoiceEventIds: (ids: string[]) => void;
}

// ─────────────────────────────────────────────────────────────────
// INITIAL LOAD STEPS
// ─────────────────────────────────────────────────────────────────

const INITIAL_LOAD_STEPS: LoadStep[] = [
  { key: "airports", label: "Loading airports", status: "pending" },
  { key: "planes", label: "Loading aircraft", status: "pending" },
  { key: "airline", label: "Loading your airline", status: "pending" },
  { key: "hubs", label: "Loading hubs and demand", status: "pending" },
  { key: "fleet", label: "Loading fleet and routes", status: "pending" },
];

function passengerCount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function finiteNumber(value: number | null | undefined, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function getCurrentWeekKey(date: Date = new Date()): number {
  const value = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const weekday = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - weekday);
  const year = value.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(
    ((value.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );

  return year * 100 + week;
}

function emptyWeeklyProgress(weekKey = getCurrentWeekKey()): WeeklyProgress {
  return {
    weekKey,
    passengers: 0,
    routeEarnings: 0,
    gameDays: 0,
    profitableDays: 0,
    speedThreeDays: 0,
    achievementPoints: 0,
  };
}

function normalizeWeeklyProgress(progress: WeeklyProgress): WeeklyProgress {
  const weekKey = getCurrentWeekKey();
  if (passengerCount(progress.weekKey) !== weekKey) {
    return emptyWeeklyProgress(weekKey);
  }

  return {
    weekKey,
    passengers: passengerCount(progress.passengers),
    routeEarnings: Math.max(0, finiteNumber(progress.routeEarnings)),
    gameDays: passengerCount(progress.gameDays),
    profitableDays: passengerCount(progress.profitableDays),
    speedThreeDays: passengerCount(progress.speedThreeDays),
    achievementPoints: passengerCount(progress.achievementPoints),
  };
}

function addWeeklyDelta(
  progress: WeeklyProgress,
  delta: WeeklyProgressDelta,
): WeeklyProgress {
  const weekKey = getCurrentWeekKey();
  const base = progress.weekKey === weekKey ? progress : emptyWeeklyProgress();

  return {
    weekKey,
    passengers: passengerCount(
      base.passengers + finiteNumber(delta.passengers),
    ),
    routeEarnings: Math.max(
      0,
      finiteNumber(base.routeEarnings) + finiteNumber(delta.routeEarnings),
    ),
    gameDays: passengerCount(base.gameDays + finiteNumber(delta.gameDays)),
    profitableDays: passengerCount(
      base.profitableDays + finiteNumber(delta.profitableDays),
    ),
    speedThreeDays: passengerCount(
      base.speedThreeDays + finiteNumber(delta.speedThreeDays),
    ),
    achievementPoints: passengerCount(
      base.achievementPoints + finiteNumber(delta.achievementPoints),
    ),
  };
}

function normalizedIata(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeAirline(airline: AirlineConfig): AirlineConfig {
  const speed = [0, 1, 2, 3].includes(airline.speed) ? airline.speed : 1;
  const name = airline.name.trim() || "Northstar Air";
  const savedPalette = getAirlinePaletteFromPrimary(airline.color);
  const paletteId = airline.palette_id
    ? normalizeAirlinePaletteId(airline.palette_id)
    : savedPalette.id;
  const palette = getAirlinePalette(paletteId);
  const logoId = normalizeAirlineLogoId(airline.logo_id ?? airline.icon);

  return {
    ...airline,
    name,
    airline_code: normalizeAirlineCode(airline.airline_code, name),
    color: normalizeHexColor(airline.color, palette.primary),
    secondary_color: normalizeHexColor(
      airline.secondary_color,
      palette.secondary,
    ),
    logo_id: logoId,
    palette_id: paletteId,
    icon: logoId,
    cash: finiteNumber(airline.cash),
    loan: Math.max(0, finiteNumber(airline.loan)),
    loan_rate: Math.max(0, finiteNumber(airline.loan_rate)),
    day: Math.max(1, passengerCount(airline.day)),
    speed,
    reputation: clamp(finiteNumber(airline.reputation), 0, 100),
    demand_score: passengerCount(airline.demand_score),
    seed: airline.seed.trim() || "DEFAULT",
    ai_count: clamp(passengerCount(airline.ai_count), 0, 5),
  };
}

function normalizeDemand(demand: Demand): Demand {
  const savedTotal = passengerCount(demand.base_pax_day);
  const marketTotal = Math.max(
    1,
    savedTotal > 0 ? savedTotal : passengerCount(demand.pax_ceiling),
  );
  const playerPax = Math.min(
    marketTotal,
    passengerCount(demand.delivered_pax_today),
  );
  const rivalPax = Math.min(
    marketTotal - playerPax,
    passengerCount(demand.ai_stolen_pax),
  );
  const rawBusiness = clamp(finiteNumber(demand.business_pct, 0.25), 0, 1);
  const rawLeisure = clamp(finiteNumber(demand.leisure_pct, 0.75), 0, 1);
  const mixTotal = rawBusiness + rawLeisure;
  const businessPct = mixTotal > 0 ? rawBusiness / mixTotal : 0.25;
  const leisurePct = mixTotal > 0 ? rawLeisure / mixTotal : 0.75;
  const status: DemandStatus =
    demand.status === "served" || demand.status === "no_plane"
      ? demand.status
      : "pending";

  return {
    ...demand,
    hub_iata: normalizedIata(demand.hub_iata || demand.origin.iata),
    dist_nm: Math.max(1, finiteNumber(demand.dist_nm, 1)),
    status,
    base_pax_day: marketTotal,
    pax_ceiling: marketTotal,
    delivered_pax_today: playerPax,
    ai_stolen_pax: rivalPax,
    popularity: clamp(finiteNumber(demand.popularity), 0, 100),
    price_elasticity: clamp(finiteNumber(demand.price_elasticity, 1), 0.5, 1.5),
    business_pct: businessPct,
    leisure_pct: leisurePct,
  };
}

function normalizeDemands(demands: readonly Demand[]): Demand[] {
  const byId = new Map<string, Demand>();
  demands.forEach((demand) => {
    if (!demand.id) return;
    byId.set(demand.id, normalizeDemand(demand));
  });
  return [...byId.values()];
}

function normalizeOwnedPlane(plane: OwnedPlane): OwnedPlane {
  return {
    ...plane,
    route_id: plane.route_id || null,
    condition: clamp(finiteNumber(plane.condition, 100), 0, 100),
    days_active: passengerCount(plane.days_active),
  };
}

function normalizeOwnedPlanes(planes: readonly OwnedPlane[]): OwnedPlane[] {
  const byId = new Map<string, OwnedPlane>();
  planes.forEach((plane) => {
    if (!plane.id) return;
    byId.set(plane.id, normalizeOwnedPlane(plane));
  });
  return [...byId.values()];
}

function reconcileGameplayCollections(params: {
  demands: readonly Demand[];
  ownedPlanes: readonly OwnedPlane[];
  routes: readonly Route[];
}): { demands: Demand[]; ownedPlanes: OwnedPlane[]; routes: Route[] } {
  const demands = normalizeDemands(params.demands);
  const loadedPlanes = normalizeOwnedPlanes(params.ownedPlanes);
  const demandById = new Map(demands.map((demand) => [demand.id, demand]));
  const planeById = new Map(loadedPlanes.map((plane) => [plane.id, plane]));
  const usedRouteIds = new Set<string>();
  const usedPlaneIds = new Set<string>();
  const routeIdByPlaneId = new Map<string, string>();
  const stagedRoutes: Route[] = [];

  params.routes.forEach((route) => {
    const demand = demandById.get(route.demand.id);
    const plane = planeById.get(route.plane.id);
    if (!route.id || !route.active || !demand || !plane) return;
    if (usedRouteIds.has(route.id) || usedPlaneIds.has(plane.id)) return;

    usedRouteIds.add(route.id);
    usedPlaneIds.add(plane.id);
    routeIdByPlaneId.set(plane.id, route.id);
    stagedRoutes.push({
      ...route,
      demand,
      plane,
      hub_iata: demand.origin.iata,
      via_iata: route.via_iata ? normalizedIata(route.via_iata) : null,
      total_dist_nm: Math.max(
        1,
        finiteNumber(route.total_dist_nm, demand.dist_nm),
      ),
      leg1_dist_nm:
        route.leg1_dist_nm == null
          ? null
          : Math.max(1, finiteNumber(route.leg1_dist_nm, demand.dist_nm)),
      leg2_dist_nm:
        route.leg2_dist_nm == null
          ? null
          : Math.max(1, finiteNumber(route.leg2_dist_nm, demand.dist_nm)),
      via_pax_ratio:
        route.via_pax_ratio == null
          ? null
          : clamp(finiteNumber(route.via_pax_ratio, 0.5), 0, 1),
      active: true,
    });
  });

  const ownedPlanes = loadedPlanes.map((plane) => ({
    ...plane,
    route_id: routeIdByPlaneId.get(plane.id) ?? null,
  }));
  const assignedPlaneById = new Map(
    ownedPlanes.map((plane) => [plane.id, plane]),
  );
  const routes = stagedRoutes.map((route) => ({
    ...route,
    plane: assignedPlaneById.get(route.plane.id) ?? route.plane,
  }));

  return { demands, ownedPlanes, routes };
}

function normalizeHubs(hubs: readonly OwnedHub[]): OwnedHub[] {
  const byIata = new Map<string, OwnedHub>();
  hubs.forEach((hub) => {
    const iata = normalizedIata(hub.airport.iata);
    if (!iata) return;
    byIata.set(iata, {
      ...hub,
      tier: clamp(Math.round(finiteNumber(hub.tier, 1)), 1, 6) as HubTier,
      trust: clamp(finiteNumber(hub.trust), 0, 100),
      hub_pax: passengerCount(hub.hub_pax),
      trust_floor: 0,
      nickname: hub.nickname?.trim().slice(0, 20) || undefined,
    });
  });
  return [...byIata.values()];
}

function normalizeWaypoints(waypoints: readonly Airport[]): Airport[] {
  const byIata = new Map<string, Airport>();
  waypoints.forEach((airport) => {
    const iata = normalizedIata(airport.iata);
    if (iata && !byIata.has(iata) && byIata.size < 3) {
      byIata.set(iata, airport);
    }
  });
  return [...byIata.values()];
}

/**
 * Applies one movement update without allowing negative or duplicate callbacks
 * to push the handled total beyond today's OD demand.
 */
function addPassengerMovement(
  demand: Demand,
  playerPax: number,
  rivalPax: number,
): Demand {
  const marketTotal = passengerCount(demand.base_pax_day);
  const playerBefore = Math.min(
    marketTotal,
    passengerCount(demand.delivered_pax_today),
  );
  const rivalBefore = Math.min(
    Math.max(0, marketTotal - playerBefore),
    passengerCount(demand.ai_stolen_pax),
  );
  const remainingBefore = Math.max(0, marketTotal - playerBefore - rivalBefore);
  const playerAdded = Math.min(remainingBefore, passengerCount(playerPax));
  const rivalAdded = Math.min(
    remainingBefore - playerAdded,
    passengerCount(rivalPax),
  );

  return {
    ...demand,
    delivered_pax_today: playerBefore + playerAdded,
    ai_stolen_pax: rivalBefore + rivalAdded,
  };
}

// ─────────────────────────────────────────────────────────────────
// STORE
// ─────────────────────────────────────────────────────────────────

export const useGameStore = create<GameStore>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      // ── Initial state ────────────────────────────────────────────
      aiAirlines: [],
      boughtPlaneToday: false,
      dailyEvent: null,
      globalContract: null,
      completedGlobalContracts: 0,
      todayCash: 0,
      routeEarnings: {},
      activeDemandWave: null,
      dayProgress: 0,
      weeklyProgress: emptyWeeklyProgress(),
      loadSteps: INITIAL_LOAD_STEPS,
      loadComplete: false,
      loadError: null,
      airports: [],
      planes: [],
      phase: "auth",
      airline: null,
      earnedAchievements: {},
      dailyMissions: [],
      missionsCompleted: 0,
      hubs: [],
      demands: [],
      ownedPlanes: [],
      routes: [],
      ledger: [],
      presence: [],
      activeSheet: null,
      selectedAirport: null,
      selectedPlaneGroup: null,
      selectedPlane: null,
      pendingDemand: null,
      routeCreationMode: false,
      creationWaypoints: [],
      pendingChoiceEvent: null,
      activeChoiceConsequence: null,
      resolvedChoiceEventIds: [],
      speedBeforeChoice: 1,

      // ── Load ─────────────────────────────────────────────────────
      setLoadStep: (key, status, error) =>
        set(
          (s) => ({
            loadSteps: s.loadSteps.map((step) =>
              step.key === key ? { ...step, status, error } : step,
            ),
          }),
          false,
          "setLoadStep",
        ),

      setLoadComplete: () =>
        set(
          (s) => ({
            loadComplete: true,
            loadError: null,
            loadSteps: s.loadSteps.map((step) => ({
              ...step,
              status: "done" as const,
              error: undefined,
            })),
          }),
          false,
          "setLoadComplete",
        ),

      setLoadError: (msg) =>
        set({ loadComplete: false, loadError: msg }, false, "setLoadError"),

      // ── Reference data ───────────────────────────────────────────
      setAirports: (airports) => set({ airports }, false, "setAirports"),
      setPlanes: (planes) => set({ planes }, false, "setPlanes"),

      resetTodayCash: () => set({ todayCash: 0 }, false, "resetTodayCash"),
      setRouteEarnings: (earnings) => {
        const cleaned = Object.fromEntries(
          Object.entries(earnings).filter(
            ([routeId, amount]) => routeId && Number.isFinite(amount),
          ),
        );
        set({ routeEarnings: cleaned }, false, "setRouteEarnings");
      },
      addRouteEarning: (routeId, amount) => {
        if (!routeId || !Number.isFinite(amount) || amount === 0) return;
        set(
          (s) => ({
            routeEarnings: {
              ...s.routeEarnings,
              [routeId]: finiteNumber(s.routeEarnings[routeId]) + amount,
            },
          }),
          false,
          "addRouteEarning",
        );
      },

      // ── Session ──────────────────────────────────────────────────
      setPhase: (phase) => set({ phase }, false, "setPhase"),
      setBoughtPlaneToday: (val) =>
        set({ boughtPlaneToday: val }, false, "setBoughtPlaneToday"),
      setAIAirlines: (a) => set({ aiAirlines: a }, false, "setAIAirlines"),
      setDailyEvent: (event) =>
        set({ dailyEvent: event }, false, "setDailyEvent"),
      setGlobalContract: (contract) =>
        set({ globalContract: contract }, false, "setGlobalContract"),
      updateGlobalContract: (patch) =>
        set(
          (s) => ({
            globalContract: s.globalContract
              ? { ...s.globalContract, ...patch }
              : null,
          }),
          false,
          "updateGlobalContract",
        ),
      completeGlobalContract: () =>
        set(
          (s) => ({
            completedGlobalContracts: s.completedGlobalContracts + 1,
          }),
          false,
          "completeGlobalContract",
        ),

      setActiveDemandWave: (wave) =>
        set({ activeDemandWave: wave }, false, "setActiveDemandWave"),
      setDayProgress: (value) =>
        set(
          { dayProgress: clamp(finiteNumber(value), 0, 1) },
          false,
          "setDayProgress",
        ),
      setWeeklyProgress: (progress) =>
        set(
          { weeklyProgress: normalizeWeeklyProgress(progress) },
          false,
          "setWeeklyProgress",
        ),
      addWeeklyProgress: (delta) =>
        set(
          (s) => ({
            weeklyProgress: addWeeklyDelta(s.weeklyProgress, delta),
          }),
          false,
          "addWeeklyProgress",
        ),
      setAirline: (airline) =>
        set({ airline: normalizeAirline(airline) }, false, "setAirline"),
      updateAirline: (patch) =>
        set(
          (s) => ({
            airline: s.airline
              ? normalizeAirline({ ...s.airline, ...patch })
              : null,
          }),
          false,
          "updateAirline",
        ),

      // ── Achievements ─────────────────────────────────────────────
      earnAchievement: (id, day) =>
        set(
          (s) =>
            s.earnedAchievements[id]
              ? s
              : {
                  earnedAchievements: {
                    ...s.earnedAchievements,
                    [id]: Math.max(1, passengerCount(day)),
                  },
                },
          false,
          "earnAchievement",
        ),

      // ── Missions ─────────────────────────────────────────────────
      setDailyMissions: (missions) =>
        set({ dailyMissions: missions }, false, "setDailyMissions"),

      completeMission: (id) =>
        set(
          (s) => {
            const mission = s.dailyMissions.find((item) => item.id === id);
            if (!mission || mission.completed) return s;
            return {
              dailyMissions: s.dailyMissions.map((item) =>
                item.id === id ? { ...item, completed: true } : item,
              ),
              missionsCompleted: s.missionsCompleted + 1,
            };
          },
          false,
          "completeMission",
        ),

      // ── Hubs ─────────────────────────────────────────────────────
      setHubs: (hubs) => set({ hubs: normalizeHubs(hubs) }, false, "setHubs"),
      addHub: (hub) =>
        set(
          (s) => ({ hubs: normalizeHubs([...s.hubs, hub]) }),
          false,
          "addHub",
        ),
      updateHub: (id, patch) =>
        set(
          (s) => ({
            hubs: normalizeHubs(
              s.hubs.map((hub) => (hub.id === id ? { ...hub, ...patch } : hub)),
            ),
          }),
          false,
          "updateHub",
        ),

      // ── Demands ──────────────────────────────────────────────────
      setDemands: (demands) =>
        set(
          (s) => {
            const reconciled = reconcileGameplayCollections({
              demands,
              ownedPlanes: s.ownedPlanes,
              routes: s.routes,
            });
            const demandById = new Map(
              reconciled.demands.map((demand) => [demand.id, demand]),
            );
            return {
              ...reconciled,
              pendingDemand: s.pendingDemand
                ? (demandById.get(s.pendingDemand.id) ?? null)
                : null,
            };
          },
          false,
          "setDemands",
        ),
      addDemands: (demands) =>
        set(
          (s) => {
            const reconciled = reconcileGameplayCollections({
              demands: [...s.demands, ...demands],
              ownedPlanes: s.ownedPlanes,
              routes: s.routes,
            });
            return reconciled;
          },
          false,
          "addDemands",
        ),
      updateDemand: (id, patch) =>
        set(
          (s) => {
            const reconciled = reconcileGameplayCollections({
              demands: s.demands.map((demand) =>
                demand.id === id ? { ...demand, ...patch } : demand,
              ),
              ownedPlanes: s.ownedPlanes,
              routes: s.routes,
            });
            const updatedDemand = reconciled.demands.find(
              (demand) => demand.id === id,
            );
            return {
              ...reconciled,
              pendingDemand:
                s.pendingDemand?.id === id
                  ? (updatedDemand ?? null)
                  : s.pendingDemand,
            };
          },
          false,
          "updateDemand",
        ),

      /**
       * Ends the accounting window without modifying the underlying market.
       * The daily market service calculates tomorrow's passenger total after
       * this reset. Fulfillment, pricing, and route assignment must not make a
       * market grow, decay, disappear, or silently change opportunity state.
       */
      resetDailyPax: () =>
        set(
          (s) => ({
            ...reconcileGameplayCollections({
              demands: s.demands.map((demand) => ({
                ...demand,
                delivered_pax_today: 0,
                ai_stolen_pax: 0,
                status: demand.status === "served" ? "pending" : demand.status,
              })),
              ownedPlanes: s.ownedPlanes,
              routes: s.routes,
            }),
            todayCash: 0,
            routeEarnings: {},
          }),
          false,
          "resetDailyPax",
        ),

      addPaxDelivered: (demandId, pax, lostToAi) =>
        set(
          (s) => {
            const reconciled = reconcileGameplayCollections({
              demands: s.demands.map((demand) =>
                demand.id === demandId
                  ? addPassengerMovement(demand, pax, lostToAi)
                  : demand,
              ),
              ownedPlanes: s.ownedPlanes,
              routes: s.routes,
            });
            return reconciled;
          },
          false,
          "addPaxDelivered",
        ),

      // ── Fleet ────────────────────────────────────────────────────
      setOwnedPlanes: (ownedPlanes) =>
        set(
          (s) => {
            const reconciled = reconcileGameplayCollections({
              demands: s.demands,
              ownedPlanes,
              routes: s.routes,
            });
            const planeById = new Map(
              reconciled.ownedPlanes.map((plane) => [plane.id, plane]),
            );
            return {
              ...reconciled,
              selectedPlane: s.selectedPlane
                ? (planeById.get(s.selectedPlane.id) ?? null)
                : null,
              selectedPlaneGroup: s.selectedPlaneGroup
                ? {
                    ...s.selectedPlaneGroup,
                    planes: s.selectedPlaneGroup.planes
                      .map((plane) => planeById.get(plane.id))
                      .filter((plane): plane is OwnedPlane => Boolean(plane)),
                  }
                : null,
            };
          },
          false,
          "setOwnedPlanes",
        ),
      addOwnedPlane: (plane) =>
        set(
          (s) =>
            reconcileGameplayCollections({
              demands: s.demands,
              ownedPlanes: [...s.ownedPlanes, plane],
              routes: s.routes,
            }),
          false,
          "addOwnedPlane",
        ),

      updateOwnedPlane: (id, patch) =>
        set(
          (s) => {
            const reconciled = reconcileGameplayCollections({
              demands: s.demands,
              ownedPlanes: s.ownedPlanes.map((plane) =>
                plane.id === id ? { ...plane, ...patch } : plane,
              ),
              routes: s.routes,
            });
            const updatedPlane = reconciled.ownedPlanes.find(
              (plane) => plane.id === id,
            );
            return {
              ...reconciled,
              selectedPlane:
                s.selectedPlane?.id === id
                  ? (updatedPlane ?? null)
                  : s.selectedPlane,
              selectedPlaneGroup: s.selectedPlaneGroup
                ? {
                    ...s.selectedPlaneGroup,
                    planes: s.selectedPlaneGroup.planes.map((plane) =>
                      plane.id === id && updatedPlane ? updatedPlane : plane,
                    ),
                  }
                : null,
            };
          },
          false,
          "updateOwnedPlane",
        ),

      // ── Routes ───────────────────────────────────────────────────
      setRoutes: (routes) =>
        set(
          (s) =>
            reconcileGameplayCollections({
              demands: s.demands,
              ownedPlanes: s.ownedPlanes,
              routes,
            }),
          false,
          "setRoutes",
        ),
      addRoute: (route) =>
        set(
          (s) =>
            reconcileGameplayCollections({
              demands: s.demands,
              ownedPlanes: s.ownedPlanes,
              routes: [...s.routes, route],
            }),
          false,
          "addRoute",
        ),
      removeRoute: (id) =>
        set(
          (s) =>
            reconcileGameplayCollections({
              demands: s.demands,
              ownedPlanes: s.ownedPlanes,
              routes: s.routes.filter((route) => route.id !== id),
            }),
          false,
          "removeRoute",
        ),

      // ── Reset (bankruptcy restart) ────────────────────────────────
      resetGame: () =>
        set(
          {
            airline: null,
            hubs: [],
            demands: [],
            routes: [],
            ownedPlanes: [],
            ledger: [],
            presence: [],
            aiAirlines: [],
            globalContract: null,
            activeDemandWave: null,
            dailyEvent: null,
            completedGlobalContracts: 0,
            dayProgress: 0,
            todayCash: 0,
            routeEarnings: {},
            boughtPlaneToday: false,
            earnedAchievements: {},
            dailyMissions: [],
            missionsCompleted: 0,
            weeklyProgress: emptyWeeklyProgress(),
            activeSheet: null,
            selectedAirport: null,
            selectedPlaneGroup: null,
            selectedPlane: null,
            pendingDemand: null,
            routeCreationMode: false,
            creationWaypoints: [],
            pendingChoiceEvent: null,
            activeChoiceConsequence: null,
            resolvedChoiceEventIds: [],
            speedBeforeChoice: 1,
          },
          false,
          "resetGame",
        ),

      // ── Ledger ───────────────────────────────────────────────────
      setLedger: (ledger) =>
        set(
          {
            ledger: [
              ...new Map(ledger.map((entry) => [entry.id, entry])).values(),
            ]
              .filter((entry) => entry.id && Number.isFinite(entry.amount))
              .slice(0, 365),
          },
          false,
          "setLedger",
        ),
      addLedgerEntries: (entries) =>
        set(
          (s) => ({
            ledger: [
              ...new Map(
                [...s.ledger, ...entries]
                  .filter((entry) => entry.id && Number.isFinite(entry.amount))
                  .map((entry) => [entry.id, entry]),
              ).values(),
            ].slice(-365),
          }),
          false,
          "addLedgerEntries",
        ),

      // ── Presence ─────────────────────────────────────────────────
      setPresence: (presence) => {
        const byIata = new Map<string, AirportPresence>();
        presence.forEach((row) => {
          const iata = normalizedIata(row.airport_iata);
          if (!iata) return;
          const existing = byIata.get(iata);
          byIata.set(iata, {
            id: existing?.id ?? row.id,
            airport_iata: iata,
            total_pax_delivered: Math.max(
              passengerCount(existing?.total_pax_delivered),
              passengerCount(row.total_pax_delivered),
            ),
          });
        });
        set({ presence: [...byIata.values()] }, false, "setPresence");
      },

      upsertPresence: (iata, pax) => {
        const airportIata = normalizedIata(iata);
        const delivered = passengerCount(pax);
        if (!airportIata || delivered === 0) return;
        set(
          (s) => {
            const existing = s.presence.find(
              (row) => row.airport_iata === airportIata,
            );
            if (existing) {
              return {
                presence: s.presence.map((p) =>
                  p.airport_iata === airportIata
                    ? {
                        ...p,
                        total_pax_delivered:
                          passengerCount(p.total_pax_delivered) + delivered,
                      }
                    : p,
                ),
              };
            }
            return {
              presence: [
                ...s.presence,
                {
                  id: `presence-${airportIata}`,
                  airport_iata: airportIata,
                  total_pax_delivered: delivered,
                },
              ],
            };
          },
          false,
          "upsertPresence",
        );
      },

      // ── Economy ──────────────────────────────────────────────────
      spendCash: (amount) => {
        if (!Number.isFinite(amount) || amount === 0) return;
        set(
          (s) => ({
            airline: s.airline
              ? { ...s.airline, cash: s.airline.cash - amount }
              : null,
          }),
          false,
          "spendCash",
        );
      },

      earnCash: (amount) => {
        if (!Number.isFinite(amount) || amount === 0) return;
        set(
          (s) => ({
            airline: s.airline
              ? { ...s.airline, cash: s.airline.cash + amount }
              : null,
            // Accumulate all route revenue (positive or negative) as today's net
            todayCash: s.todayCash + amount,
          }),
          false,
          "earnCash",
        );
      },

      accrueInterest: (amount) => {
        if (!Number.isFinite(amount) || amount === 0) return;
        set(
          (s) => ({
            airline: s.airline
              ? { ...s.airline, cash: s.airline.cash - amount }
              : null,
          }),
          false,
          "accrueInterest",
        );
      },

      repayLoan: (amount) => {
        const { airline } = get();
        if (!airline || !Number.isFinite(amount) || amount <= 0) return;
        const actual = Math.min(amount, Math.max(0, airline.loan));
        if (actual <= 0) return;
        set(
          {
            airline: {
              ...airline,
              cash: airline.cash - actual,
              loan: airline.loan - actual,
            },
          },
          false,
          "repayLoan",
        );
      },

      takeLoan: (amount, rate) => {
        const { airline } = get();
        if (!airline || !Number.isFinite(amount) || amount <= 0) return;
        set(
          {
            airline: {
              ...airline,
              cash: airline.cash + amount,
              loan: airline.loan + amount,
              loan_rate: Math.max(0, finiteNumber(rate, airline.loan_rate)),
            },
          },
          false,
          "takeLoan",
        );
      },

      advanceDay: () =>
        set(
          (s) => ({
            airline: s.airline
              ? { ...s.airline, day: s.airline.day + 1 }
              : null,
            dayProgress: 0,
          }),
          false,
          "advanceDay",
        ),

      // ── Sheet control ────────────────────────────────────────────
      openSheet: (sheet, airport, demand, planeGroup, plane) =>
        set(
          (s) => {
            const demandById = new Map(
              s.demands.map((item) => [item.id, item]),
            );
            const planeById = new Map(
              s.ownedPlanes.map((item) => [item.id, item]),
            );
            return {
              activeSheet: sheet,
              selectedAirport: airport ?? null,
              selectedPlaneGroup: planeGroup
                ? {
                    ...planeGroup,
                    planes: planeGroup.planes
                      .map((item) => planeById.get(item.id))
                      .filter((item): item is OwnedPlane => Boolean(item)),
                  }
                : null,
              selectedPlane: plane ? (planeById.get(plane.id) ?? null) : null,
              pendingDemand: demand
                ? (demandById.get(demand.id) ?? null)
                : null,
            };
          },
          false,
          "openSheet",
        ),

      closeSheet: () =>
        set(
          {
            activeSheet: null,
            selectedAirport: null,
            selectedPlaneGroup: null,
            selectedPlane: null,
            pendingDemand: null,
            // Does NOT reset routeCreationMode — use clearRouteCreation() for that
          },
          false,
          "closeSheet",
        ),

      // ── Route creation ───────────────────────────────────────────
      startRouteCreation: (preWaypoints) =>
        set(
          {
            routeCreationMode: true,
            creationWaypoints: normalizeWaypoints(preWaypoints ?? []),
            activeSheet: null,
            selectedAirport: null,
            pendingDemand: null,
          },
          false,
          "startRouteCreation",
        ),

      setSelectedPlaneGroup(planes) {
        set(
          (s) => ({
            selectedPlaneGroup: s.selectedPlaneGroup
              ? {
                  ...s.selectedPlaneGroup,
                  planes: planes
                    .map((plane) =>
                      s.ownedPlanes.find((owned) => owned.id === plane.id),
                    )
                    .filter((plane): plane is OwnedPlane => Boolean(plane)),
                }
              : null,
          }),
          false,
          "setSelectedPlaneGroup",
        );
      },

      addWaypoint: (airport) =>
        set(
          (s) => {
            const iata = normalizedIata(airport.iata);
            if (
              s.creationWaypoints.some(
                (waypoint) => normalizedIata(waypoint.iata) === iata,
              )
            ) {
              return s;
            }
            if (s.creationWaypoints.length >= 3) return s;
            return { creationWaypoints: [...s.creationWaypoints, airport] };
          },
          false,
          "addWaypoint",
        ),

      removeWaypoint: (iata) =>
        set(
          (s) => ({
            creationWaypoints: s.creationWaypoints.filter(
              (airport) =>
                normalizedIata(airport.iata) !== normalizedIata(iata),
            ),
          }),
          false,
          "removeWaypoint",
        ),

      reorderWaypoints: (waypoints) =>
        set(
          { creationWaypoints: normalizeWaypoints(waypoints) },
          false,
          "reorderWaypoints",
        ),

      clearRouteCreation: () =>
        set(
          {
            routeCreationMode: false,
            creationWaypoints: [],
            activeSheet: null,
            selectedAirport: null,
            selectedPlaneGroup: null,
            selectedPlane: null,
            pendingDemand: null,
          },
          false,
          "clearRouteCreation",
        ),

      // ── Helpers ──────────────────────────────────────────────────
      getAirportByIata: (iata) =>
        get().airports.find(
          (airport) => normalizedIata(airport.iata) === normalizedIata(iata),
        ),
      getPlaneById: (id) => get().planes.find((p) => p.id === id),
      getHubByIata: (iata) =>
        get().hubs.find(
          (hub) => normalizedIata(hub.airport.iata) === normalizedIata(iata),
        ),
      getUnassignedPlanes: () => {
        const assignedIds = new Set(
          get()
            .routes.filter((route) => route.active)
            .map((route) => route.plane.id),
        );
        return get().ownedPlanes.filter(
          (plane) => !plane.route_id && !assignedIds.has(plane.id),
        );
      },
      setPendingChoiceEvent: (event) =>
        set({ pendingChoiceEvent: event }, false, "setPendingChoiceEvent"),

      setActiveChoiceConsequence: (resolved) =>
        set(
          { activeChoiceConsequence: resolved },
          false,
          "setActiveChoiceConsequence",
        ),

      // Pauses the game and remembers speed so we can restore it
      pauseForChoice: () =>
        set(
          (s) => {
            if (!s.airline || s.airline.speed === 0) return s;
            return {
              speedBeforeChoice: s.airline.speed,
              airline: { ...s.airline, speed: 0 },
            };
          },
          false,
          "pauseForChoice",
        ),

      // Restores speed and records the resolved event ID
      resumeAfterChoice: () =>
        set(
          (s) => ({
            airline: s.airline
              ? { ...s.airline, speed: s.speedBeforeChoice ?? 1 }
              : null,
            resolvedChoiceEventIds: s.pendingChoiceEvent
              ? [
                  ...(s.resolvedChoiceEventIds ?? []).filter(
                    (id) => id !== s.pendingChoiceEvent?.id,
                  ),
                  s.pendingChoiceEvent.id,
                ]
              : (s.resolvedChoiceEventIds ?? []),
            pendingChoiceEvent: null,
          }),
          false,
          "resumeAfterChoice",
        ),

      // Update a single plane's condition
      updatePlaneCondition: (planeId, newCondition) =>
        get().updateOwnedPlane(planeId, {
          condition: clamp(finiteNumber(newCondition, 100), 0, 100),
        }),

      setResolvedChoiceEventIds: (ids) =>
        set(
          { resolvedChoiceEventIds: [...new Set(ids.filter(Boolean))] },
          false,
          "setResolvedChoiceEventIds",
        ),
    })),
    { name: "FlightcraftStore" },
  ),
);

// ─────────────────────────────────────────────────────────────────
// SELECTOR HOOKS
// ─────────────────────────────────────────────────────────────────

// Core state
export const useAirports = () => useGameStore((s) => s.airports);
export const usePlanes = () => useGameStore((s) => s.planes);
export const useAirline = () => useGameStore((s) => s.airline);
export const useGameSeed = () =>
  useGameStore((s) => s.airline?.seed ?? "DEFAULT");
export const useAIAirlines = () => useGameStore((s) => s.aiAirlines);
export const useAIConfig = () =>
  useGameStore(
    useShallow((s) => ({
      count: s.airline?.ai_count ?? 0,
      difficulty: s.airline?.ai_difficulty ?? "balanced",
    })),
  );
export const useHubs = () => useGameStore((s) => s.hubs);
export const useDemands = () => useGameStore((s) => s.demands);
export const useOwnedPlanes = () => useGameStore((s) => s.ownedPlanes);
export const useRoutes = () => useGameStore((s) => s.routes);
export const useLedger = () => useGameStore((s) => s.ledger);
export const usePhase = () => useGameStore((s) => s.phase);
export const useBoughtPlaneToday = () =>
  useGameStore((s) => s.boughtPlaneToday);
export const useDailyEvent = () => useGameStore((s) => s.dailyEvent);
export const useGlobalContract = () => useGameStore((s) => s.globalContract);
export const useActiveDemandWave = () =>
  useGameStore((s) => s.activeDemandWave);
export const useCompletedGlobalContracts = () =>
  useGameStore((s) => s.completedGlobalContracts);
export const useDayProgress = () => useGameStore((s) => s.dayProgress);
export const useLoadSteps = () => useGameStore((s) => s.loadSteps);
export const useLoadComplete = () => useGameStore((s) => s.loadComplete);

// Sheet / selection
export const useActiveSheet = () => useGameStore((s) => s.activeSheet);
export const useSelectedAirport = () => useGameStore((s) => s.selectedAirport);
export const useSelectedPlaneGroup = () =>
  useGameStore((s) => s.selectedPlaneGroup);
export const useSelectedPlane = () => useGameStore((s) => s.selectedPlane);
export const usePendingDemand = () => useGameStore((s) => s.pendingDemand);

// Derived scalar
export const useCash = () => useGameStore((s) => s.airline?.cash ?? 0);
export const useLoan = () => useGameStore((s) => s.airline?.loan ?? 0);
export const useDay = () => useGameStore((s) => s.airline?.day ?? 1);
export const useHubCount = () => useGameStore((s) => s.hubs.length);
export const useRouteCount = () =>
  useGameStore((s) => s.routes.filter((r) => r.active).length);
export const useDemandCount = (status?: DemandStatus) =>
  useGameStore((s) =>
    status
      ? s.demands.filter((d) => d.status === status).length
      : s.demands.length,
  );

// Hub tier for a given iata (used by upgrade UI)
export const useHubTier = (iata: string | undefined) =>
  useGameStore((s) =>
    iata ? (s.hubs.find((h) => h.airport.iata === iata)?.tier ?? 1) : 1,
  );

// Route creation — specific hooks (no object returns)
export const useRouteCreationActive = () =>
  useGameStore((s) => s.routeCreationMode);
export const useRouteCreationWaypoints = () =>
  useGameStore((s) => s.creationWaypoints);

// Achievements + missions
export const useEarnedAchievements = () =>
  useGameStore((s) => s.earnedAchievements);
export const useDailyMissions = () => useGameStore((s) => s.dailyMissions);
export const useMissionsCompleted = () =>
  useGameStore((s) => s.missionsCompleted);

// Compat — use specific hooks above where possible
export const useRouteCreation = () => {
  return useGameStore(
    useShallow((s) => ({
      active: s.routeCreationMode,
      waypoints: s.creationWaypoints,
    })),
  );
};

export const useTodayCash = () => useGameStore((s) => s.todayCash);
export const useRouteEarnings = () => useGameStore((s) => s.routeEarnings);

export const usePresence = () => useGameStore((s) => s.presence);
export const useAirportPresence = (iata: string | undefined) =>
  useGameStore((s) =>
    iata
      ? (s.presence.find((p) => p.airport_iata === iata)?.total_pax_delivered ??
        0)
      : 0,
  );
export const usePendingChoiceEvent = () =>
  useGameStore((s) => s.pendingChoiceEvent);

export const useActiveChoiceConsequence = () =>
  useGameStore((s) => s.activeChoiceConsequence);
export const useResolvedChoiceEventIds = () =>
  useGameStore((s) => s.resolvedChoiceEventIds);
