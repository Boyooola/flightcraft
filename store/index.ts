/**
 * store/FlightcraftStore.ts
 *
 * Single Zustand store for all game state.
 * Drives both the map and all bottom sheets.
 */

import type { DailyEvent } from "@/hooks/useDailyEvents";
import type { AIAirline } from "@/lib/AIAirline";
import type { AppliedDemandWave } from "@/lib/demandWaves";
import type { GlobalContractState } from "@/lib/globalContracts";
import type { Mission } from "@/lib/missions";
import { PriceStrategy, priceStrategyConfig } from "@/lib/revenue";
import { create } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";

// ─────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────

export type HaulClass = "short" | "medium" | "long";
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
  | "mega"
  | "large"
  | "major"
  | "regional"
  | "minor"
  | "local";

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
  color: string;
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
  trust_floor: number; // minimum trust enforced by tier (set on buy/upgrade)
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
  delivered_pax_today: number; // resets each game-day
  base_pax_day: number;
  popularity: number;
  ai_stolen_pax?: number;
  ai_pressure?: number;
  price_elasticity?: number;
  business_pct?: number;
  leisure_pct?: number;
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
  awayEarnings: { days: number; amount: number } | null;
  isApplyingAwayEarnings: boolean;
  dayProgress: number; // 0 → 1 within the current game day
  todayCash: number; // exact cash earned today (resets each day)
  aiAirlines: AIAirline[];
  weeklyProgress: {
    weekNumber: number;
    paxTotal: number; // total pax delivered this week
    revenueTotal: number; // total net revenue this week
    loginDays: number; // days logged in this week
    perfectDays: number; // days with all missions complete
    profitDays: number; // days all routes were profitable
    speedDays: number; // days played at 3× speed
    achEarned: number; // achievements earned this week
    rankImproved: number; // positions rank improved
  };

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
  applyWaveToStore: (wave: AppliedDemandWave) => void;
  setAwayEarnings: (data: { days: number; amount: number } | null) => void;
  setIsApplyingAway: (v: boolean) => void;
  setDayProgress: (value: number) => void;
  setAIAirlines: (airlines: AIAirline[]) => void;
  updateWeeklyProgress: (update: Partial<GameStore["weeklyProgress"]>) => void;
  resetWeeklyProgress: (weekNumber: number) => void;
  setAirline: (airline: AirlineConfig) => void;
  updateAirline: (patch: Partial<AirlineConfig>) => void;

  resetTodayCash: (todayCash: number) => void;

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
}

// ─────────────────────────────────────────────────────────────────
// INITIAL LOAD STEPS
// ─────────────────────────────────────────────────────────────────

const INITIAL_LOAD_STEPS: LoadStep[] = [
  { key: "auth", label: "Authenticating", status: "pending" },
  { key: "airline", label: "Loading your airline", status: "pending" },
  { key: "hubs", label: "Loading hubs & demands", status: "pending" },
  { key: "fleet", label: "Loading fleet & routes", status: "pending" },
];

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
      activeDemandWave: null,
      awayEarnings: null,
      isApplyingAwayEarnings: false,
      dayProgress: 0,
      weeklyProgress: {
        weekNumber: 0,
        paxTotal: 0,
        revenueTotal: 0,
        loginDays: 0,
        perfectDays: 0,
        profitDays: 0,
        speedDays: 0,
        achEarned: 0,
        rankImproved: 0,
      }, // set correctly by useGameLoader after session check
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
        set({ loadComplete: true, loadError: null }, false, "setLoadComplete"),

      setLoadError: (msg) => set({ loadError: msg }, false, "setLoadError"),

      // ── Reference data ───────────────────────────────────────────
      setAirports: (airports) => set({ airports }, false, "setAirports"),
      setPlanes: (planes) => set({ planes }, false, "setPlanes"),

      resetTodayCash: () => set({ todayCash: 0 }, false, "resetTodayCash"),

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

      applyWaveToStore: (wave) =>
        set(
          (s) => ({
            activeDemandWave: wave,
            demands: s.demands.map((d) => {
              const update = wave.updates.find((u) => u.demandId === d.id);
              if (!update) return d;
              return { ...d, base_pax_day: update.newPaxDay };
            }),
          }),
          false,
          "applyWaveToStore",
        ),
      setAwayEarnings: (data) =>
        set({ awayEarnings: data }, false, "setAwayEarnings"),
      setIsApplyingAway: (v) =>
        set({ isApplyingAwayEarnings: v }, false, "setIsApplyingAway"),
      setDayProgress: (value) =>
        set(
          { dayProgress: Math.max(0, Math.min(1, value)) },
          false,
          "setDayProgress",
        ),
      updateWeeklyProgress: (update) =>
        set(
          (s) => ({
            weeklyProgress: { ...s.weeklyProgress, ...update },
          }),
          false,
          "updateWeeklyProgress",
        ),
      resetWeeklyProgress: (weekNumber) =>
        set(
          {
            weeklyProgress: {
              weekNumber,
              paxTotal: 0,
              revenueTotal: 0,
              loginDays: 0,
              perfectDays: 0,
              profitDays: 0,
              speedDays: 0,
              achEarned: 0,
              rankImproved: 0,
            },
          },
          false,
          "resetWeeklyProgress",
        ),
      setAirline: (airline) => set({ airline }, false, "setAirline"),
      updateAirline: (patch) =>
        set(
          (s) => ({
            airline: s.airline ? { ...s.airline, ...patch } : null,
          }),
          false,
          "updateAirline",
        ),

      // ── Achievements ─────────────────────────────────────────────
      earnAchievement: (id, day) =>
        set(
          (s) => ({
            earnedAchievements: { ...s.earnedAchievements, [id]: day },
          }),
          false,
          "earnAchievement",
        ),

      // ── Missions ─────────────────────────────────────────────────
      setDailyMissions: (missions) =>
        set({ dailyMissions: missions }, false, "setDailyMissions"),

      completeMission: (id) =>
        set(
          (s) => ({
            dailyMissions: s.dailyMissions.map((m) =>
              m.id === id ? { ...m, completed: true } : m,
            ),
            missionsCompleted: s.missionsCompleted + 1,
          }),
          false,
          "completeMission",
        ),

      // ── Hubs ─────────────────────────────────────────────────────
      setHubs: (hubs) => set({ hubs }, false, "setHubs"),
      addHub: (hub) =>
        set((s) => ({ hubs: [...s.hubs, hub] }), false, "addHub"),
      updateHub: (id, patch) =>
        set(
          (s) => ({
            hubs: s.hubs.map((h) => (h.id === id ? { ...h, ...patch } : h)),
          }),
          false,
          "updateHub",
        ),

      // ── Demands ──────────────────────────────────────────────────
      setDemands: (demands) => set({ demands }, false, "setDemands"),
      addDemands: (demands) =>
        set(
          (s) => ({ demands: [...s.demands, ...demands] }),
          false,
          "addDemands",
        ),
      updateDemand: (id, patch) =>
        set(
          (s) => ({
            demands: s.demands.map((d) =>
              d.id === id ? { ...d, ...patch } : d,
            ),
          }),
          false,
          "updateDemand",
        ),

      resetDailyPax: () => {
        const { demands, routes } = get();

        const updatedDemands = demands.map((d) => {
          const hasActiveRoute = routes.some(
            (r) => r.active && r.demand.id === d.id,
          );
          const delivered = d.delivered_pax_today ?? 0;
          const base = d.base_pax_day ?? 0;

          let popularity = d.popularity ?? 0;

          if (hasActiveRoute) {
            const ratio = base > 0 ? delivered / base : 0;
            const strategy =
              routes.find((r) => r.active && r.demand.id === d.id)
                ?.price_strategy ?? "standard";
            const pricing = priceStrategyConfig(
              strategy,
              d.price_elasticity ?? 1,
            );

            popularity += pricing.popularityBonus;

            if (ratio >= 0.9) popularity += 3;
            else if (ratio >= 0.75) popularity += 2;
            else if (ratio >= 0.55) popularity += 1;
            else if (ratio < 0.35) popularity -= 2;
            else if (ratio < 0.5) popularity -= 1;

            popularity = Math.max(-40, Math.min(80, popularity));

            const multiplier = 1 + popularity / 100;
            const computed = Math.round(
              base * multiplier * pricing.demandMultiplier,
            );
            const floor = Math.max(20, Math.round(base * 0.3));

            // If player didn't clear the queue, demand should not grow.
            // Passengers who couldn't get a seat find other ways — demand shrinks.
            // If cleared → demand can grow normally.
            // If not cleared → demand can only stay or shrink (computed may drop due to popularity).
            const didClear = delivered >= d.base_pax_day;
            const newPax = didClear
              ? Math.max(floor, Math.min(computed, Math.round(base * 1.05))) // cleared → grow max 5%/day
              : Math.max(
                  floor,
                  Math.min(
                    d.base_pax_day,
                    computed - Math.round(d.base_pax_day * 0.05),
                  ),
                );
            // not cleared → shrink by up to 5%/day + popularity effect, never grow

            return {
              ...d,
              popularity,
              base_pax_day: newPax,
              delivered_pax_today: 0,
              ai_stolen_pax: 0,
              price_elasticity: d.price_elasticity ?? 1,
              status: "pending" as DemandStatus,
            };
          } else {
            // No active route — slowly recover toward base_pax_day.
            const recovered = Math.min(base, Math.round(d.base_pax_day * 1.02));

            return {
              ...d,
              base_pax_day: recovered,
              delivered_pax_today: 0,
              ai_stolen_pax: 0,
              price_elasticity: d.price_elasticity ?? 1,
              status: "pending" as DemandStatus,
            };
          }
        });

        set({ demands: updatedDemands, todayCash: 0 }, false, "resetDailyPax");
      },

      addPaxDelivered: (demandId, pax, lostToAi) =>
        set(
          (s) => ({
            demands: s.demands.map((d) =>
              d.id === demandId
                ? {
                    ...d,
                    delivered_pax_today: (d.delivered_pax_today ?? 0) + pax,
                    ai_stolen_pax: (d.ai_stolen_pax ?? 0) + lostToAi,
                  }
                : d,
            ),
          }),
          false,
          "addPaxDelivered",
        ),

      // ── Fleet ────────────────────────────────────────────────────
      setOwnedPlanes: (ownedPlanes) =>
        set({ ownedPlanes }, false, "setOwnedPlanes"),
      addOwnedPlane: (plane) =>
        set(
          (s) => ({ ownedPlanes: [...s.ownedPlanes, plane] }),
          false,
          "addOwnedPlane",
        ),

      updateOwnedPlane: (id, patch) =>
        set(
          (s) => ({
            ownedPlanes: s.ownedPlanes.map((p) =>
              p.id === id ? { ...p, ...patch } : p,
            ),
          }),
          false,
          "updateOwnedPlane",
        ),

      // ── Routes ───────────────────────────────────────────────────
      setRoutes: (routes) => set({ routes }, false, "setRoutes"),
      addRoute: (route) =>
        set((s) => ({ routes: [...s.routes, route] }), false, "addRoute"),
      removeRoute: (id) =>
        set(
          (s) => ({ routes: s.routes.filter((r) => r.id !== id) }),
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
            awayEarnings: null,
            completedGlobalContracts: 0,
            dayProgress: 0,
            todayCash: 0,
          },
          false,
          "resetGame",
        ),

      // ── Ledger ───────────────────────────────────────────────────
      setLedger: (ledger) => set({ ledger }, false, "setLedger"),
      addLedgerEntries: (entries) =>
        set(
          (s) => ({
            ledger: [...s.ledger, ...entries].slice(-365),
          }),
          false,
          "addLedgerEntries",
        ),

      // ── Presence ─────────────────────────────────────────────────
      setPresence: (presence) => set({ presence }, false, "setPresence"),

      upsertPresence: (iata, pax) =>
        set(
          (s) => {
            const existing = s.presence.find((p) => p.airport_iata === iata);
            if (existing) {
              return {
                presence: s.presence.map((p) =>
                  p.airport_iata === iata
                    ? { ...p, total_pax_delivered: p.total_pax_delivered + pax }
                    : p,
                ),
              };
            }
            return {
              presence: [
                ...s.presence,
                {
                  id: `presence-${iata}`,
                  airport_iata: iata,
                  total_pax_delivered: pax,
                },
              ],
            };
          },
          false,
          "upsertPresence",
        ),

      // ── Economy ──────────────────────────────────────────────────
      spendCash: (amount) =>
        set(
          (s) => ({
            airline: s.airline
              ? { ...s.airline, cash: s.airline.cash - amount }
              : null,
          }),
          false,
          "spendCash",
        ),

      earnCash: (amount) =>
        set(
          (s) => ({
            airline: s.airline
              ? { ...s.airline, cash: s.airline.cash + amount }
              : null,
            // Only accumulate positive cash as "today earned"
            todayCash: amount > 0 ? s.todayCash + amount : s.todayCash,
          }),
          false,
          "earnCash",
        ),

      accrueInterest: (amount) =>
        set(
          (s) => ({
            airline: s.airline
              ? { ...s.airline, cash: s.airline.cash - amount }
              : null,
          }),
          false,
          "accrueInterest",
        ),

      repayLoan: (amount) => {
        const { airline } = get();
        if (!airline) return;
        const actual = Math.min(amount, airline.loan);
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
        if (!airline) return;
        set(
          {
            airline: {
              ...airline,
              cash: airline.cash + amount,
              loan: airline.loan + amount,
              loan_rate: rate,
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
          {
            activeSheet: sheet,
            selectedAirport: airport ?? null,
            selectedPlaneGroup: planeGroup ?? null,
            selectedPlane: plane ?? null,
            pendingDemand: demand ?? null,
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
            creationWaypoints: preWaypoints ?? [],
            activeSheet: null,
          },
          false,
          "startRouteCreation",
        ),

      addWaypoint: (airport) =>
        set(
          (s) => {
            if (s.creationWaypoints.some((a) => a.iata === airport.iata))
              return s;
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
              (a) => a.iata !== iata,
            ),
          }),
          false,
          "removeWaypoint",
        ),

      reorderWaypoints: (waypoints) =>
        set({ creationWaypoints: waypoints }, false, "reorderWaypoints"),

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
      getAirportByIata: (iata) => get().airports.find((a) => a.iata === iata),
      getPlaneById: (id) => get().planes.find((p) => p.id === id),
      getHubByIata: (iata) => get().hubs.find((h) => h.airport.iata === iata),
      getUnassignedPlanes: () => {
        const assignedIds = new Set(get().routes.map((r) => r.plane.id));
        return get().ownedPlanes.filter((p) => !assignedIds.has(p.id));
      },
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
  useGameStore((s) => ({
    count: s.airline?.ai_count ?? 0,
    difficulty: s.airline?.ai_difficulty ?? "balanced",
  }));
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
export const useAwayEarnings = () => useGameStore((s) => s.awayEarnings);
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
  const active = useGameStore((s) => s.routeCreationMode);
  const waypoints = useGameStore((s) => s.creationWaypoints);
  return { active, waypoints };
};

export const useTodayCash = () => useGameStore((s) => s.todayCash);

export const usePresence = () => useGameStore((s) => s.presence);
export const useAirportPresence = (iata: string | undefined) =>
  useGameStore((s) =>
    iata
      ? (s.presence.find((p) => p.airport_iata === iata)?.total_pax_delivered ??
        0)
      : 0,
  );
