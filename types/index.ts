/**
 * @file types/index.ts
 * @description Shared domain types used across the entire application.
 *
 * Covers core game entities (airports, aircraft models) and UI state
 * primitives (load steps). All other modules should import types from
 * here rather than redeclaring them locally.
 */

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
  | "playing";
export type GameSpeed = 0 | 1 | 2 | 3;

// Sheet names — drives which bottom sheet is visible
export type ActiveSheet =
  | null
  | "airport"
  | "fleet"
  | "finance"
  | "routes"
  | "settings"
  | "route-assign"
  | "create-route";

export interface LoadStep {
  key: string;
  label: string;
  status: "pending" | "loading" | "done" | "error";
  error?: string;
}

export interface Airport {
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  continent: string;
  lat: number;
  lng: number;
  tier: "major" | "regional";
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
  via_iata: string | null; // connecting airport (null = direct)
  total_dist_nm: number; // leg1+leg2 for connecting, dist_nm for direct
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
