/**
 * store/FlightcraftStore.ts
 *
 * Single Zustand store for all game state.
 * Drives both the map and all bottom sheets.
 */

import type { DailyEvent } from "@/hooks/useDailyEvents";
import type { Mission } from "@/lib/missions";
import { create } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";

// ─────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────

export type HaulClass = "short" | "medium" | "long";
export type DemandStatus = "pending" | "served" | "no_plane";
export type FamilyId = "embraer" | "bombardier" | "boeing" | "airbus";
export type HubTier = 1 | 2 | 3 | 4;
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
  | "privacy-policy";

export interface Airport {
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  continent: string;
  lat: number;
  lng: number;
  tier: "mega" | "large" | "major" | "regional" | "minor" | "local";
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
  user_id: string;
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
}

export interface OwnedHub {
  id: string;
  airport: Airport;
  tier: HubTier;
  trust: number;
}

export interface Demand {
  id: string;
  airline_id: string;
  hub_iata: string;
  origin: Airport;
  dest: Airport;
  dist_nm: number;
  haul: HaulClass;
  pax_day: number;
  status: DemandStatus;
  delivered_pax_today: number; // resets each game-day
}

export interface OwnedPlane {
  id: string;
  plane_model: PlaneModel;
  route_id: string | null;
}

export interface Route {
  id: string;
  demand: Demand;
  plane: OwnedPlane;
  hub_iata: string;
  via_iata: string | null;
  total_dist_nm: number;
  active: boolean;
}

export interface LedgerEntry {
  id: string;
  day: number;
  type: "revenue" | "interest" | "purchase" | "loan";
  label: string;
  amount: number;
  route_id: string | null;
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
  isAnonymous: boolean;
  boughtPlaneToday: boolean;
  dailyEvent: DailyEvent | null;
  awayEarnings: { days: number; amount: number } | null;
  isApplyingAwayEarnings: boolean;
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

  // Mobile sheet + selection state
  activeSheet: ActiveSheet;
  selectedAirport: Airport | null;
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
  setAwayEarnings: (data: { days: number; amount: number } | null) => void;
  setIsApplyingAway: (v: boolean) => void;
  updateWeeklyProgress: (update: Partial<GameStore["weeklyProgress"]>) => void;
  resetWeeklyProgress: (weekNumber: number) => void;
  setAirline: (airline: AirlineConfig) => void;
  updateAirline: (patch: Partial<AirlineConfig>) => void;

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
  addPaxDelivered: (demandId: string, pax: number) => void;

  // Fleet
  setOwnedPlanes: (planes: OwnedPlane[]) => void;
  addOwnedPlane: (plane: OwnedPlane) => void;

  // Routes
  setRoutes: (routes: Route[]) => void;
  addRoute: (route: Route) => void;
  removeRoute: (id: string) => void;

  // Ledger
  setLedger: (entries: LedgerEntry[]) => void;
  addLedgerEntries: (entries: LedgerEntry[]) => void;

  // Economy
  spendCash: (amount: number) => void;
  earnCash: (amount: number) => void;
  accrueInterest: (amount: number) => void;
  repayLoan: (amount: number) => void;
  takeLoan: (amount: number, rate: number) => void;
  advanceDay: () => void;

  // Sheet control
  openSheet: (sheet: ActiveSheet, airport?: Airport, demand?: Demand) => void;
  closeSheet: () => void;
  startRouteCreation: (preWaypoints?: Airport[]) => void;
  addWaypoint: (airport: Airport) => void;
  removeWaypoint: (iata: string) => void;
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
      isAnonymous: false,
      boughtPlaneToday: false,
      dailyEvent: null,
      awayEarnings: null,
      isApplyingAwayEarnings: false,
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
      activeSheet: null,
      selectedAirport: null,
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

      // ── Session ──────────────────────────────────────────────────
      setPhase: (phase) => set({ phase }, false, "setPhase"),
      setBoughtPlaneToday: (val) =>
        set({ boughtPlaneToday: val }, false, "setBoughtPlaneToday"),
      setDailyEvent: (event) =>
        set({ dailyEvent: event }, false, "setDailyEvent"),
      setAwayEarnings: (data) =>
        set({ awayEarnings: data }, false, "setAwayEarnings"),
      setIsApplyingAway: (v) =>
        set({ isApplyingAwayEarnings: v }, false, "setIsApplyingAway"),
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

      resetDailyPax: () =>
        set(
          (s) => ({
            demands: s.demands.map((d) => ({ ...d, delivered_pax_today: 0 })),
          }),
          false,
          "resetDailyPax",
        ),

      addPaxDelivered: (demandId, pax) =>
        set(
          (s) => ({
            demands: s.demands.map((d) =>
              d.id === demandId
                ? {
                    ...d,
                    delivered_pax_today: (d.delivered_pax_today ?? 0) + pax,
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
          }),
          false,
          "advanceDay",
        ),

      // ── Sheet control ────────────────────────────────────────────
      openSheet: (sheet, airport, demand) =>
        set(
          {
            activeSheet: sheet,
            selectedAirport: airport ?? null,
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

      clearRouteCreation: () =>
        set(
          {
            routeCreationMode: false,
            creationWaypoints: [],
            activeSheet: null,
            selectedAirport: null,
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
export const useHubs = () => useGameStore((s) => s.hubs);
export const useDemands = () => useGameStore((s) => s.demands);
export const useOwnedPlanes = () => useGameStore((s) => s.ownedPlanes);
export const useRoutes = () => useGameStore((s) => s.routes);
export const useLedger = () => useGameStore((s) => s.ledger);
export const usePhase = () => useGameStore((s) => s.phase);
export const useIsAnonymous = () => useGameStore((s) => s.isAnonymous);
export const useBoughtPlaneToday = () =>
  useGameStore((s) => s.boughtPlaneToday);
export const useDailyEvent = () => useGameStore((s) => s.dailyEvent);
export const useAwayEarnings = () => useGameStore((s) => s.awayEarnings);
export const useLoadSteps = () => useGameStore((s) => s.loadSteps);
export const useLoadComplete = () => useGameStore((s) => s.loadComplete);

// Sheet / selection
export const useActiveSheet = () => useGameStore((s) => s.activeSheet);
export const useSelectedAirport = () => useGameStore((s) => s.selectedAirport);
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
export const useRouteCreation = () =>
  useGameStore((s) => ({
    active: s.routeCreationMode,
    waypoints: s.creationWaypoints,
  }));
