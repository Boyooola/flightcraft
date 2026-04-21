/**
 * @file store/index.ts
 * @description Global Zustand store for Flightcraft game state.
 *
 * Manages the full lifecycle of startup data loading (auth, airports,
 * aircraft, airline, hubs, fleet) and holds reference data once fetched.
 * The store is wrapped with `devtools` for Redux DevTools support and
 * `subscribeWithSelector` to allow granular reactive subscriptions.
 *
 * Selector hooks (useAirports, usePlanes, etc.) are exported alongside
 * the raw store to encourage components to subscribe only to the slice
 * of state they need, minimising unnecessary re-renders.
 */

import {
  AirlineConfig,
  Airport,
  Demand,
  DemandStatus,
  GamePhase,
  LedgerEntry,
  LoadStep,
  OwnedHub,
  OwnedPlane,
  PlaneModel,
  Route,
} from "@/types";
import { create } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";

export interface GameStore {
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

  // Game objects
  hubs: OwnedHub[];
  demands: Demand[];
  ownedPlanes: OwnedPlane[];
  routes: Route[];
  ledger: LedgerEntry[];

  // Load actions
  setLoadStep: (
    key: string,
    status: LoadStep["status"],
    error?: string,
  ) => void;
  setLoadComplete: () => void;
  setLoadError: (error: string) => void;

  // Data actions
  setAirports: (airports: Airport[]) => void;
  setPlanes: (planes: PlaneModel[]) => void;

  // Session
  setPhase: (phase: GamePhase) => void;
  setAirline: (airline: AirlineConfig) => void;
  updateAirline: (patch: Partial<AirlineConfig>) => void;

  // Hubs
  setHubs: (hubs: OwnedHub[]) => void;
  addHub: (hub: OwnedHub) => void;
  updateHub: (id: string, patch: Partial<OwnedHub>) => void;

  // Demands
  setDemands: (demands: Demand[]) => void;
  addDemands: (demands: Demand[]) => void;
  updateDemand: (id: string, patch: Partial<Demand>) => void;

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
  advanceDay: () => void;

  // Helpers
  getAirportByIata: (iata: string) => Airport | undefined;
  getPlaneById: (id: string) => PlaneModel | undefined;
  getHubByIata: (iata: string) => OwnedHub | undefined;
  getUnassignedPlanes: () => OwnedPlane[];
}

const INITIAL_LOAD_STEPS: LoadStep[] = [
  { key: "auth", label: "Verifying session", status: "pending" },
  { key: "airports", label: "Loading airport database", status: "pending" },
  { key: "planes", label: "Loading aircraft catalogue", status: "pending" },
  { key: "airline", label: "Fetching airline data", status: "pending" },
  { key: "hubs", label: "Loading hubs & demands", status: "pending" },
  { key: "fleet", label: "Loading fleet & routes", status: "pending" },
];

export const useGameStore = create<GameStore>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      //Initial state
      loadSteps: INITIAL_LOAD_STEPS,
      loadComplete: false,
      loadError: null,
      airports: [],
      planes: [],
      phase: "auth",
      airline: null,
      hubs: [],
      demands: [],
      ownedPlanes: [],
      routes: [],
      ledger: [],

      // Load actions
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

      // Reference data
      setAirports: (airports) => set({ airports }, false, "setAirports"),
      setPlanes: (planes) => set({ planes }, false, "setPlanes"),

      // Session
      setPhase: (phase) => set({ phase }, false, "setPhase"),
      setAirline: (airline) => set({ airline }, false, "setAirline"),
      updateAirline: (patch) =>
        set(
          (s) => ({
            airline: s.airline ? { ...s.airline, ...patch } : null,
          }),
          false,
          "updateAirline",
        ),

      // Hubs
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

      // Demands
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

      // Fleet
      setOwnedPlanes: (ownedPlanes) =>
        set({ ownedPlanes }, false, "setOwnedPlanes"),
      addOwnedPlane: (plane) =>
        set(
          (s) => ({ ownedPlanes: [...s.ownedPlanes, plane] }),
          false,
          "addOwnedPlane",
        ),

      // Routes
      setRoutes: (routes) => set({ routes }, false, "setRoutes"),
      addRoute: (route) =>
        set((s) => ({ routes: [...s.routes, route] }), false, "addRoute"),
      removeRoute: (id) =>
        set(
          (s) => ({ routes: s.routes.filter((r) => r.id !== id) }),
          false,
          "removeRoute",
        ),

      // Ledger
      setLedger: (ledger) => set({ ledger }, false, "setLedger"),
      addLedgerEntries: (entries) =>
        set(
          (s) => ({
            ledger: [...s.ledger, ...entries].slice(-365),
          }),
          false,
          "addLedgerEntries",
        ),

      // Economy
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
              ? {
                  ...s.airline,
                  cash: s.airline.cash - amount,
                  loan: s.airline.loan + amount,
                }
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

      // Helpers
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

export const useAirports = () => useGameStore((s) => s.airports);
export const usePlanes = () => useGameStore((s) => s.planes);
export const useAirline = () => useGameStore((s) => s.airline);
export const useHubs = () => useGameStore((s) => s.hubs);
export const useDemands = () => useGameStore((s) => s.demands);
export const useOwnedPlanes = () => useGameStore((s) => s.ownedPlanes);
export const useRoutes = () => useGameStore((s) => s.routes);
export const useLedger = () => useGameStore((s) => s.ledger);
export const usePhase = () => useGameStore((s) => s.phase);
export const useLoadSteps = () => useGameStore((s) => s.loadSteps);
export const useLoadComplete = () => useGameStore((s) => s.loadComplete);

// Derived
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
