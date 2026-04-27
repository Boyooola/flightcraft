/**
 * hooks/useGameLoader.ts
 *
 * Runs once when the game screen mounts.
 * Fetches all data from Supabase in sequence and populates the store.
 * Column mapping adapts to common schema variants.
 */

import { supabase } from "@/lib/supabase";
import type {
  AirlineConfig,
  Airport,
  Demand,
  FamilyId,
  HaulClass,
  HubTier,
  LedgerEntry,
  OwnedHub,
  OwnedPlane,
  PlaneModel,
  Route,
} from "@/store";
import { useGameStore } from "@/store";
import { useEffect, useRef } from "react";

// ── Column mappers ────────────────────────────────────────────────
 
function rowToAirport(row: any): Airport {
  return {
    iata: row.iata_code ?? row.iata,
    icao: row.icao_code ?? row.icao ?? "",
    name: row.name,
    city: row.municipality ?? row.city ?? "",
    country: row.iso_country ?? row.country ?? "",
    continent: row.continent ?? "",
    lat: parseFloat(row.latitude_deg ?? row.lat),
    lng: parseFloat(row.longitude_deg ?? row.lng),
    tier: (() => {
      const t = (row.type ?? row.tier ?? "").toLowerCase();
      if (t === "mega" || t === "mega_airport") return "mega";
      if (t === "large" || t === "large_airport") return "large";
      if (t === "major" || t === "major_airport") return "major";
      if (t === "minor" || t === "minor_airport") return "minor";
      if (t === "local" || t === "local_airport") return "local";
      return "regional";
    })(),
    pax_annual_m:
      row.pax_annual_m != null ? parseFloat(row.pax_annual_m) : null,
  };
}

 
function rowToPlaneModel(row: any): PlaneModel {
  return {
    id: String(row.id),
    manufacturer: row.manufacturer,
    family: (row.family ?? row.manufacturer?.toLowerCase()) as FamilyId,
    model: row.model,
    nickname: row.nickname ?? row.model,
    tier: (row.tier ?? 1) as HubTier,
    pax_capacity: Number(row.pax_capacity ?? row.seats ?? 0),
    range_nm: Number(row.range_nm ?? row.range_nautical_miles ?? 0),
    speed_kts: Number(row.speed_kts ?? row.max_speed_knots ?? 0),
    price: Number(row.price ?? 0),
    unlock_cash: Number(row.unlock_cash ?? 0),
    unlock_demands: Number(row.unlock_demands ?? 0),
    description: row.description ?? "",
    haul: Array.isArray(row.haul)
      ? row.haul
      : ((row.haul ?? "short,medium").split(",") as HaulClass[]),
  };
}

// ── Hook ──────────────────────────────────────────────────────────
export function useGameLoader() {
  const hasRun = useRef(false);

  const {
    setLoadStep,
    setLoadComplete,
    setLoadError,
    setAirports,
    setPlanes,
    setAirline,
    setPhase,
    setHubs,
    setDemands,
    setOwnedPlanes,
    setRoutes,
    setLedger,
  } = useGameStore.getState();

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;
    runLoad();
  }, []);

  async function runLoad() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setPhase("auth");
      return;
    }
    const userId = session.user.id;

    // ── 1. airports ────────────────────────────────────────────
    try {
      setLoadStep("airports", "loading");
      const { data, error } = await supabase
        .from("airports")
        .select("*")
        .in("type", ["large_airport", "medium_airport"])
        .eq("scheduled_service", "yes")
        .not("iata_code", "is", null);

      if (error) throw error;
      const airports: Airport[] = (data ?? [])
        .filter(
          (r: { latitude_deg?: string; longitude_deg?: string }) =>
            r.latitude_deg && r.longitude_deg,
        )
        .map(rowToAirport);

      setAirports(airports);
      setLoadStep("airports", "done");
    } catch {
      // Fall back to bundled JSON
      try {
        const json = require("@/data/airports.json");
        setAirports(json as Airport[]);
        setLoadStep("airports", "done");
      } catch {
        setLoadStep("airports", "error", "Could not load airports");
        setLoadError("Could not load airport data");
        return;
      }
    }

    // ── 2. planes ──────────────────────────────────────────────
    try {
      setLoadStep("planes", "loading");
      const { data, error } = await supabase
        .from("planes")
        .select("*")
        .order("tier")
        .order("price");

      if (error) throw error;
      setPlanes((data ?? []).map(rowToPlaneModel));
      setLoadStep("planes", "done");
    } catch {
      try {
        const json = require("@/data/planes.json");
        setPlanes((json as object[]).map(rowToPlaneModel));
        setLoadStep("planes", "done");
      } catch {
        setLoadStep("planes", "error", "Could not load plane catalogue");
      }
    }

    // ── 3. airline ─────────────────────────────────────────────
    try {
      setLoadStep("airline", "loading");
      const { data, error } = await supabase
        .from("airlines")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        const airline: AirlineConfig = {
          id: data.id,
          user_id: data.user_id,
          name: data.name,
          color: data.color ?? "#38BDF8",
          icon: data.icon ?? "plane",
          difficulty: data.difficulty ?? "normal",
          cash: Number(data.cash ?? 3_000_000),
          loan: Number(data.loan ?? 3_000_000),
          loan_rate: Number(data.loan_rate ?? 5),
          day: Number(data.day ?? 1),
          speed: (data.speed ?? 1) as 0 | 1 | 2 | 3,
          reputation: Number(data.reputation ?? 0),
          demand_score: Number(data.demand_score ?? 0),
        };
        // Store whether this is a guest/anonymous session
        const isAnon = session.user.is_anonymous ?? false;
        useGameStore.setState({ isAnonymous: isAnon });
        setAirline(airline);
        // Load earned achievements and missions count from DB
        if (data.achievements && typeof data.achievements === "object") {
          const { useGameStore: gs } = await import("@/store");
          const earnedAchievements: Record<string, number> = {};
          Object.entries(data.achievements).forEach(([id, day]) => {
            earnedAchievements[id] = Number(day);
          });
          gs.setState({ earnedAchievements });
        }
        if (data.missions_completed) {
          const { useGameStore: gs } = await import("@/store");
          gs.setState({ missionsCompleted: Number(data.missions_completed) });
        }
        setLoadStep("airline", "done");
      } else {
        // New player — no airline yet
        setLoadStep("airline", "done");
        setPhase("setup");
        setLoadComplete();
        return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load airline";
      setLoadStep("airline", "error", msg);
      setLoadError(msg);
      return;
    }

    // ── 4. hubs + demands ──────────────────────────────────────
    try {
      setLoadStep("hubs", "loading");
      const airlineId = useGameStore.getState().airline?.id;
      if (!airlineId) {
        setLoadStep("hubs", "done");
      } else {
        const airportMap = new Map(
          useGameStore.getState().airports.map((a) => [a.iata, a]),
        );

        const { data: hubData, error: hubErr } = await supabase
          .from("hubs")
          .select("*")
          .eq("airline_id", airlineId);
        if (hubErr) throw hubErr;

        const hubs: OwnedHub[] = (hubData ?? [])
          .map(
            (h: {
              id: string;
              iata: string;
              tier?: number;
              trust?: number;
            }) => {
              const airport = airportMap.get(h.iata);
              if (!airport) return null;
              return {
                id: h.id,
                airport,
                tier: (h.tier ?? 1) as HubTier,
                trust: Number(h.trust ?? 0),
              };
            },
          )
          .filter(Boolean) as OwnedHub[];
        setHubs(hubs);

        const { data: demandData, error: demandErr } = await supabase
          .from("demands")
          .select("*")
          .eq("airline_id", airlineId);
        if (demandErr) throw demandErr;

        const demands: Demand[] = (demandData ?? [])
          .map(
            (d: {
              id: string;
              airline_id: string;
              hub_iata: string;
              origin_iata: string;
              dest_iata: string;
              dist_nm: number;
              haul: string;
              pax_day: number;
              status: string;
            }) => {
              const origin = airportMap.get(d.origin_iata);
              const dest = airportMap.get(d.dest_iata);
              if (!origin || !dest) return null;
              return {
                id: d.id,
                airline_id: d.airline_id,
                hub_iata: d.hub_iata,
                origin,
                dest,
                dist_nm: d.dist_nm,
                haul: d.haul as HaulClass,
                pax_day: d.pax_day,
                status: d.status as "pending" | "served" | "no_plane",
              };
            },
          )
          .filter(Boolean) as Demand[];
        setDemands(demands);
        setLoadStep("hubs", "done");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load hubs";
      setLoadStep("hubs", "error", msg);
      setLoadError(msg);
      return;
    }

    // ── 5. fleet + routes + ledger ─────────────────────────────
    try {
      setLoadStep("fleet", "loading");
      const airlineId = useGameStore.getState().airline?.id;
      if (!airlineId) {
        setLoadStep("fleet", "done");
      } else {
        const planeMap = new Map(
          useGameStore.getState().planes.map((p) => [p.id, p]),
        );
        const demandMap = new Map(
          useGameStore.getState().demands.map((d) => [d.id, d]),
        );

        const { data: planeData, error: planeErr } = await supabase
          .from("owned_planes")
          .select("*")
          .eq("airline_id", airlineId);
        if (planeErr) throw planeErr;

        const ownedPlanes: OwnedPlane[] = (planeData ?? [])
          .map(
            (p: { id: string; plane_id: string; route_id?: string | null }) => {
              const model = planeMap.get(p.plane_id);
              if (!model) return null;
              return {
                id: p.id,
                plane_model: model,
                route_id: p.route_id ?? null,
              };
            },
          )
          .filter(Boolean) as OwnedPlane[];
        setOwnedPlanes(ownedPlanes);

        const ownedMap = new Map(ownedPlanes.map((p) => [p.id, p]));

        const { data: routeData, error: routeErr } = await supabase
          .from("routes")
          .select("*")
          .eq("airline_id", airlineId)
          .eq("active", true);
        if (routeErr) throw routeErr;

        const routes: Route[] = (routeData ?? [])
          .map(
            (r: {
              id: string;
              demand_id: string;
              plane_id: string;
              hub_iata: string;
              via_iata?: string | null;
              total_dist_nm?: number | null;
              active: boolean;
            }) => {
              const demand = demandMap.get(r.demand_id);
              const plane = ownedMap.get(r.plane_id);
              if (!demand || !plane) return null;
              return {
                id: r.id,
                demand,
                plane,
                hub_iata: r.hub_iata,
                via_iata: r.via_iata ?? null,
                total_dist_nm: r.total_dist_nm ?? demand.dist_nm,
                active: r.active,
              };
            },
          )
          .filter(Boolean) as Route[];
        setRoutes(routes);

        const airlineDay = useGameStore.getState().airline?.day ?? 1;
        const { data: ledgerData } = await supabase
          .from("ledger")
          .select("*")
          .eq("airline_id", airlineId)
          .gte("day", Math.max(1, airlineDay - 90))
          .order("day", { ascending: false })
          .limit(365);

        const ledger: LedgerEntry[] = (ledgerData ?? []).map(
          (e: {
            id: string;
            day: number;
            type: string;
            label: string;
            amount: number;
            route_id?: string | null;
          }) => ({
            id: e.id,
            day: e.day,
            type: e.type as LedgerEntry["type"],
            label: e.label,
            amount: Number(e.amount),
            route_id: e.route_id ?? null,
          }),
        );
        setLedger(ledger);
        setLoadStep("fleet", "done");
      }
    } catch {
      setLoadStep("fleet", "done"); // non-fatal
    }

    setLoadComplete();
    setPhase("playing");
  }
}
