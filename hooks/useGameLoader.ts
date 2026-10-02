/**
 * hooks/useGameLoader.ts
 *
 * Loads the signed-in airline and its gameplay data once per game mount.
 * Authentication may be retried after the manual Play Games recovery screen.
 * Weekly challenge progress is kept locally because it changes frequently and
 * does not need to block or inflate the main airline save.
 */

import { getPlayerId, setPlayerId } from "@/hooks/useAuth";
import { signInWithPlayGames } from "@/hooks/usePlayGames";
import {
  getAirlinePalette,
  getAirlinePaletteFromPrimary,
  normalizeAirlineCode,
  normalizeAirlineLogoId,
  normalizeAirlinePaletteId,
  normalizeHexColor,
} from "@/lib/airlineBrand";
import {
  distanceNm,
  haulClass,
  setDemandSeed,
  simulatePaxDay,
} from "@/lib/demands";
import { fetchAllRows } from "@/lib/fetch";
import { passengerMixFromDistance } from "@/lib/passengerTypes";
import { normalizePriceStrategy } from "@/lib/revenue";
import { supabase } from "@/lib/supabase";
import type {
  AirlineConfig,
  Airport,
  AirportTier,
  Demand,
  DemandStatus,
  FamilyId,
  HaulClass,
  HubTier,
  LedgerEntry,
  OwnedHub,
  OwnedPlane,
  PlaneModel,
  Route,
  WeeklyProgress,
} from "@/store";
import { getCurrentWeekKey, useGameStore } from "@/store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef } from "react";

// ── Column mappers ────────────────────────────────────────────────

const AIRPORT_TIERS: readonly AirportTier[] = [
  "local",
  "minor",
  "regional",
  "major",
  "large",
  "mega",
];

const FAMILY_IDS: readonly FamilyId[] = [
  "embraer",
  "bombardier",
  "boeing",
  "airbus",
];

const WEEKLY_PROGRESS_STORAGE_VERSION = 1;

interface StoredWeeklyProgress {
  version: typeof WEEKLY_PROGRESS_STORAGE_VERSION;
  airlineId: string;
  progress: WeeklyProgress;
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nonNegativeInteger(value: unknown, fallback = 0): number {
  return Math.max(0, Math.floor(finiteNumber(value, fallback)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizedIata(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function normalizedHubTier(value: unknown): HubTier {
  return clamp(Math.round(finiteNumber(value, 1)), 1, 6) as HubTier;
}

function normalizedGameSpeed(value: unknown): 0 | 1 | 2 | 3 {
  const speed = Math.round(finiteNumber(value, 1));
  return speed === 0 || speed === 2 || speed === 3 ? speed : 1;
}

function normalizedAirportTier(value: unknown): AirportTier {
  return AIRPORT_TIERS.includes(value as AirportTier)
    ? (value as AirportTier)
    : "minor";
}

function normalizedFamily(row: any): FamilyId {
  const value = String(row.family ?? row.manufacturer ?? "")
    .trim()
    .toLowerCase();
  return FAMILY_IDS.includes(value as FamilyId)
    ? (value as FamilyId)
    : "boeing";
}

function rowToAirport(row: any): Airport | null {
  const iata = normalizedIata(row.iata_code ?? row.iata);
  const lat = finiteNumber(row.latitude_deg ?? row.lat, Number.NaN);
  const lng = finiteNumber(row.longitude_deg ?? row.lng, Number.NaN);
  if (!iata || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const annualPassengers = finiteNumber(row.pax_annual_m, Number.NaN);
  return {
    iata,
    icao: String(row.icao_code ?? row.icao ?? "")
      .trim()
      .toUpperCase(),
    name: String(row.name ?? iata).trim(),
    city: String(row.municipality ?? row.city ?? "").trim(),
    country: String(row.iso_country ?? row.country ?? "").trim(),
    continent: String(row.continent ?? "").trim(),
    lat,
    lng,
    tier: normalizedAirportTier(row.tier),
    pax_annual_m: Number.isFinite(annualPassengers)
      ? Math.max(0, annualPassengers)
      : null,
  };
}

function rowToPlaneModel(row: any): PlaneModel {
  const rawHaul = Array.isArray(row.haul)
    ? row.haul
    : String(row.haul ?? "short,medium").split(",");
  const haul = rawHaul
    .map((value: unknown) => String(value).trim().toLowerCase())
    .filter(
      (value: string): value is HaulClass =>
        value === "short" || value === "medium" || value === "long",
    );

  return {
    id: String(row.id),
    manufacturer: String(row.manufacturer ?? ""),
    family: normalizedFamily(row),
    model: String(row.model ?? "Aircraft"),
    nickname: String(row.nickname ?? row.model ?? "Aircraft"),
    tier: normalizedHubTier(row.tier),
    pax_capacity: nonNegativeInteger(row.pax_capacity ?? row.seats),
    range_nm: nonNegativeInteger(row.range_nm ?? row.range_nautical_miles),
    speed_kts: nonNegativeInteger(row.speed_kts ?? row.max_speed_knots),
    price: nonNegativeInteger(row.price),
    unlock_cash: nonNegativeInteger(row.unlock_cash),
    unlock_demands: nonNegativeInteger(row.unlock_demands),
    description: String(row.description ?? ""),
    haul: haul.length > 0 ? haul : ["short", "medium"],
    cost_per_sector: Math.max(0, finiteNumber(row.cost_per_sector)),
    fuel_per_nm: Math.max(0, finiteNumber(row.fuel_per_nm)),
  };
}

function normalizedPassengerMix(
  businessValue: unknown,
  leisureValue: unknown,
  routeDistanceNm: number,
): { business: number; leisure: number } {
  let business = finiteNumber(businessValue, Number.NaN);
  let leisure = finiteNumber(leisureValue, Number.NaN);

  if (business > 1) business /= 100;
  if (leisure > 1) leisure /= 100;

  if (business < 0 || leisure < 0 || !Number.isFinite(business + leisure)) {
    const fallback = passengerMixFromDistance(routeDistanceNm);
    return {
      business: fallback.businessPct,
      leisure: fallback.leisurePct,
    };
  }

  const total = business + leisure;
  if (total <= 0) {
    const fallback = passengerMixFromDistance(routeDistanceNm);
    return {
      business: fallback.businessPct,
      leisure: fallback.leisurePct,
    };
  }

  return { business: business / total, leisure: leisure / total };
}

function normalizedDemandStatus(value: unknown): DemandStatus {
  return value === "served" || value === "no_plane" ? value : "pending";
}

function emptyWeeklyProgress(): WeeklyProgress {
  return {
    weekKey: getCurrentWeekKey(),
    passengers: 0,
    routeEarnings: 0,
    gameDays: 0,
    profitableDays: 0,
    speedThreeDays: 0,
    achievementPoints: 0,
  };
}

function parseWeeklyProgress(value: unknown): WeeklyProgress | null {
  if (!isRecord(value)) return null;

  const currentWeekKey = getCurrentWeekKey();
  const rawWeekKey = nonNegativeInteger(value.weekKey, -1);
  const legacyWeekNumber = nonNegativeInteger(value.weekNumber, -1);
  const weekKey =
    rawWeekKey === currentWeekKey ||
    (rawWeekKey < 100 && rawWeekKey === currentWeekKey % 100) ||
    legacyWeekNumber === currentWeekKey % 100
      ? currentWeekKey
      : -1;

  if (weekKey !== currentWeekKey) return null;

  return {
    weekKey,
    passengers: nonNegativeInteger(value.passengers ?? value.paxTotal),
    routeEarnings: Math.max(
      0,
      finiteNumber(value.routeEarnings ?? value.revenueTotal),
    ),
    gameDays: nonNegativeInteger(value.gameDays ?? value.loginDays),
    profitableDays: nonNegativeInteger(
      value.profitableDays ?? value.profitDays,
    ),
    speedThreeDays: nonNegativeInteger(value.speedThreeDays ?? value.speedDays),
    achievementPoints: nonNegativeInteger(
      value.achievementPoints ?? value.achEarned,
    ),
  };
}

function weeklyProgressStorageKey(airlineId: string): string {
  return `flightcraft:weekly-progress:${airlineId}`;
}

async function loadWeeklyProgress(airlineId: string): Promise<WeeklyProgress> {
  const storageKey = weeklyProgressStorageKey(airlineId);

  try {
    const saved = await AsyncStorage.getItem(storageKey);
    if (!saved) return emptyWeeklyProgress();

    const parsed: unknown = JSON.parse(saved);
    if (!isRecord(parsed)) throw new Error("Invalid weekly progress record");

    const isCurrentEnvelope =
      parsed.version === WEEKLY_PROGRESS_STORAGE_VERSION &&
      parsed.airlineId === airlineId;
    const progress = parseWeeklyProgress(
      isCurrentEnvelope ? parsed.progress : parsed,
    );

    return progress ?? emptyWeeklyProgress();
  } catch (error) {
    console.warn("Could not restore weekly challenge progress", error);
    await AsyncStorage.removeItem(storageKey).catch(() => undefined);
    return emptyWeeklyProgress();
  }
}

async function saveWeeklyProgress(
  airlineId: string,
  progress: WeeklyProgress,
): Promise<void> {
  const payload: StoredWeeklyProgress = {
    version: WEEKLY_PROGRESS_STORAGE_VERSION,
    airlineId,
    progress,
  };

  await AsyncStorage.setItem(
    weeklyProgressStorageKey(airlineId),
    JSON.stringify(payload),
  );
}

// ── Hook ──────────────────────────────────────────────────────────
export function useGameLoader() {
  const hasAttemptedLoad = useRef(false);
  const loadInFlight = useRef(false);
  const weeklySaveQueue = useRef<Promise<void>>(Promise.resolve());
  const loadedAirlineId = useGameStore((state) => state.airline?.id ?? null);
  const loadComplete = useGameStore((state) => state.loadComplete);
  const phase = useGameStore((state) => state.phase);

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
    setWeeklyProgress,
  } = useGameStore.getState();

  useEffect(() => {
    const isInitialAttempt = !hasAttemptedLoad.current;
    const isAuthenticationRetry =
      hasAttemptedLoad.current && phase === "loading";

    if (
      loadComplete ||
      loadInFlight.current ||
      (!isInitialAttempt && !isAuthenticationRetry)
    ) {
      return;
    }

    hasAttemptedLoad.current = true;
    loadInFlight.current = true;

    useGameStore.setState(
      (state) => ({
        phase: "loading",
        loadComplete: false,
        loadError: null,
        loadSteps: state.loadSteps.map((step) => ({
          ...step,
          status: "pending" as const,
          error: undefined,
        })),
      }),
      false,
      "startGameLoad",
    );

    void runLoad().finally(() => {
      loadInFlight.current = false;
    });

    // runLoad is intentionally owned by this retry gate. Store actions are
    // stable and the phase transition is the only supported retry trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadComplete, phase]);

  useEffect(() => {
    if (!loadComplete || !loadedAirlineId) return;

    const queueSave = (progress: WeeklyProgress) => {
      weeklySaveQueue.current = weeklySaveQueue.current
        .catch(() => undefined)
        .then(() => saveWeeklyProgress(loadedAirlineId, progress))
        .catch((error) => {
          console.warn("Could not save weekly challenge progress", error);
        });
    };

    queueSave(useGameStore.getState().weeklyProgress);
    return useGameStore.subscribe(
      (state) => state.weeklyProgress,
      (progress) => queueSave(progress),
    );
  }, [loadComplete, loadedAirlineId]);

  async function runLoad() {
    // ── Play Games sign-in (required) ─────────────────────────
    let playerId: string | null = null;
    try {
      playerId = getPlayerId();
      if (!playerId) {
        const player = await signInWithPlayGames();
        if (!player?.playerId) {
          setPhase("auth");
          return;
        }
        playerId = player.playerId;
        setPlayerId(playerId);
      }
    } catch {
      setLoadError("Could not sign in to Play Games. Try again.");
      setPhase("auth");
      return;
    }

    if (!playerId) {
      setLoadError("Could not identify the current player.");
      setPhase("auth");
      return;
    }

    // ── RevenueCat — link to Play Games ID ─────────────────────
    // initRevenueCat(playerId);

    // ── 1. airports ────────────────────────────────────────────
    try {
      setLoadStep("airports", "loading");

      const allAirports = await fetchAllRows<any>(
        supabase
          .from("airports")
          .select("*")
          .in("tier", ["minor", "regional", "major", "large", "mega"])
          .eq("scheduled_service", "yes")
          .not("iata_code", "is", null)
          .gte("pax_annual_m", 0),
      );

      const airports = allAirports
        .map(rowToAirport)
        .filter((airport): airport is Airport => airport !== null);

      if (airports.length === 0) throw new Error("Airport catalogue is empty");

      setAirports(airports);
      setLoadStep("airports", "done");
    } catch {
      // Fall back to bundled JSON
      try {
        const json = require("@/data/airports.json");
        const airports = (json as object[])
          .map(rowToAirport)
          .filter((airport): airport is Airport => airport !== null);
        if (airports.length === 0)
          throw new Error("Airport catalogue is empty");
        setAirports(airports);
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
      const planes = (data ?? []).map(rowToPlaneModel);
      if (planes.length === 0) throw new Error("Plane catalogue is empty");
      setPlanes(planes);
      setLoadStep("planes", "done");
    } catch {
      try {
        const json = require("@/data/planes.json");
        const planes = (json as object[]).map(rowToPlaneModel);
        if (planes.length === 0) throw new Error("Plane catalogue is empty");
        setPlanes(planes);
        setLoadStep("planes", "done");
      } catch {
        setLoadStep("planes", "error", "Could not load plane catalogue");
        setLoadError("Could not load plane data");
        return;
      }
    }

    // ── 3. airline ─────────────────────────────────────────────
    try {
      setLoadStep("airline", "loading");
      const { data, error } = await supabase
        .from("airlines")
        .select("*")
        .eq("player_id", playerId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        const rawColor = String(data.color ?? "").trim();
        const name =
          String(data.name ?? "Northstar Air").trim() || "Northstar Air";
        const legacyPalette = getAirlinePaletteFromPrimary(rawColor);
        const paletteId = data.palette_id
          ? normalizeAirlinePaletteId(data.palette_id)
          : legacyPalette.id;
        const palette = getAirlinePalette(paletteId);
        const logoId = normalizeAirlineLogoId(data.logo_id ?? data.icon);
        const seed = String(data.seed ?? "DEFAULT").trim() || "DEFAULT";
        const airline: AirlineConfig = {
          id: String(data.id),
          player_id: String(data.player_id),
          name,
          airline_code: normalizeAirlineCode(data.airline_code, name),
          color: normalizeHexColor(rawColor, palette.primary),
          secondary_color: normalizeHexColor(
            data.secondary_color,
            palette.secondary,
          ),
          logo_id: logoId,
          palette_id: paletteId,
          icon: logoId,
          difficulty: String(data.difficulty ?? "normal"),
          cash: finiteNumber(data.cash, 3_000_000),
          loan: Math.max(0, finiteNumber(data.loan, 3_000_000)),
          loan_rate: Math.max(0, finiteNumber(data.loan_rate, 5)),
          day: Math.max(1, nonNegativeInteger(data.day, 1)),
          speed: normalizedGameSpeed(data.speed),
          reputation: clamp(finiteNumber(data.reputation), 0, 100),
          demand_score: nonNegativeInteger(data.demand_score),
          seed,
          ai_count: clamp(nonNegativeInteger(data.ai_count), 0, 5),
          ai_difficulty: String(data.ai_difficulty ?? "balanced"),
        };
        setAirline(airline);
        // Wire seed so demand generation uses correct game seed
        setDemandSeed(airline.seed);
        useGameStore.setState({
          aiAirlines: [],
          dayProgress: 0,
          todayCash: 0,
          routeEarnings: {},
        });
        // These values belong to the loaded airline. Reset missing fields so a
        // previous session cannot leak progress into another airline.
        const earnedAchievements: Record<string, number> = {};
        if (data.achievements && typeof data.achievements === "object") {
          Object.entries(data.achievements).forEach(([id, day]) => {
            earnedAchievements[id] = Math.max(1, nonNegativeInteger(day, 1));
          });
        }
        useGameStore.setState({
          earnedAchievements,
          missionsCompleted: nonNegativeInteger(data.missions_completed),
        });
        setWeeklyProgress(await loadWeeklyProgress(airline.id));
        setLoadStep("airline", "done");
      } else {
        // New player — no airline yet
        setWeeklyProgress(emptyWeeklyProgress());
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

        // HUBS
        const hubData = await fetchAllRows<any>(
          supabase.from("hubs").select("*").eq("airline_id", airlineId),
        );

        const hubs: OwnedHub[] = hubData
          .map((h) => {
            const airport = airportMap.get(normalizedIata(h.iata));
            if (!airport) return null;

            return {
              id: String(h.id),
              airport,
              tier: normalizedHubTier(h.tier),
              trust: clamp(finiteNumber(h.trust), 0, 100),
              hub_pax: nonNegativeInteger(h.hub_pax),
              nickname:
                typeof h.nickname === "string" && h.nickname.trim()
                  ? h.nickname.trim().slice(0, 20)
                  : undefined,
              trust_floor: 0,
            };
          })
          .filter(Boolean) as OwnedHub[];

        setHubs(hubs);

        // DEMANDS
        const demandData = await fetchAllRows<any>(
          supabase.from("demands").select("*").eq("airline_id", airlineId),
        );

        const gameDay = useGameStore.getState().airline?.day ?? 1;
        const validHubIatas = new Set(hubs.map((hub) => hub.airport.iata));
        const demands: Demand[] = demandData
          .map((d) => {
            const origin = airportMap.get(normalizedIata(d.origin_iata));
            const dest = airportMap.get(normalizedIata(d.dest_iata));

            if (!origin || !dest || origin.iata === dest.iata) return null;
            if (!validHubIatas.has(origin.iata)) return null;

            const routeDistance = Math.max(
              1,
              Math.round(
                distanceNm(origin.lat, origin.lng, dest.lat, dest.lng),
              ),
            );
            const generatedDemand = simulatePaxDay(
              origin,
              dest,
              routeDistance,
              0,
              gameDay,
            );
            const savedMarketTotal = nonNegativeInteger(d.base_pax_day);
            const marketTotal =
              savedMarketTotal > 0 ? savedMarketTotal : generatedDemand;
            const playerPax = Math.min(
              marketTotal,
              nonNegativeInteger(d.delivered_pax_today),
            );
            const rivalPax = Math.min(
              marketTotal - playerPax,
              nonNegativeInteger(d.ai_stolen_pax),
            );
            const mix = normalizedPassengerMix(
              d.business_pct,
              d.leisure_pct,
              routeDistance,
            );

            return {
              id: String(d.id),
              airline_id: String(d.airline_id ?? airlineId),
              hub_iata: origin.iata,
              origin,
              dest,
              dist_nm: routeDistance,
              haul: haulClass(routeDistance),

              base_pax_day: marketTotal,
              popularity: clamp(finiteNumber(d.popularity), 0, 100),
              price_elasticity: clamp(
                finiteNumber(d.price_elasticity, 1),
                0.5,
                1.5,
              ),
              delivered_pax_today: playerPax,
              ai_stolen_pax: rivalPax,
              business_pct: mix.business,
              leisure_pct: mix.leisure,

              status: normalizedDemandStatus(d.status),
              pax_ceiling: marketTotal,
            };
          })
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

        // ── owned planes ─────────────────────────────

        const planeData = await fetchAllRows<any>(
          supabase.from("owned_planes").select("*").eq("airline_id", airlineId),
        );

        const loadedPlanes: OwnedPlane[] = planeData
          .map(
            (p: {
              id: string;
              plane_id: string;
              route_id?: string | null;
              condition?: number | null;
              days_active?: number | null;
            }) => {
              const model = planeMap.get(String(p.plane_id));

              if (!model) return null;

              return {
                id: String(p.id),
                plane_model: model,
                route_id: p.route_id ?? null,
                condition: clamp(finiteNumber(p.condition, 100), 0, 100),
                days_active: nonNegativeInteger(p.days_active),
              };
            },
          )
          .filter(Boolean) as OwnedPlane[];

        const ownedMap = new Map(loadedPlanes.map((p) => [p.id, p]));

        // ── routes ─────────────────────────────

        const routeData = await fetchAllRows<any>(
          supabase
            .from("routes")
            .select("*")
            .eq("airline_id", airlineId)
            .eq("active", true),
        );

        const assignedPlaneIds = new Set<string>();
        const routeIdByPlaneId = new Map<string, string>();
        const loadedRoutes: Route[] = [];
        const airportByIata = new Map(
          useGameStore
            .getState()
            .airports.map((airport) => [airport.iata, airport]),
        );

        for (const row of routeData as {
          id: string;
          demand_id: string;
          plane_id: string;
          hub_iata: string;
          via_iata?: string | null;
          total_dist_nm?: number | null;
          leg1_dist_nm?: number | null;
          leg2_dist_nm?: number | null;
          active: boolean;
          via_pax_ratio?: number | null;
          price_strategy?: string | null;
        }[]) {
          const routeId = String(row.id);
          const demandId = String(row.demand_id);
          const planeId = String(row.plane_id);
          const demand = demandMap.get(demandId);
          const plane = ownedMap.get(planeId);
          const viaIata = row.via_iata ? normalizedIata(row.via_iata) : null;
          const viaAirport = viaIata ? airportByIata.get(viaIata) : null;

          if (!demand || !plane || !row.active) continue;
          if (assignedPlaneIds.has(planeId)) continue;
          if (
            viaIata &&
            (!viaAirport ||
              viaIata === demand.origin.iata ||
              viaIata === demand.dest.iata)
          ) {
            continue;
          }

          const leg1Distance = viaAirport
            ? Math.max(
                1,
                Math.round(
                  distanceNm(
                    demand.origin.lat,
                    demand.origin.lng,
                    viaAirport.lat,
                    viaAirport.lng,
                  ),
                ),
              )
            : demand.dist_nm;
          const leg2Distance = viaAirport
            ? Math.max(
                1,
                Math.round(
                  distanceNm(
                    viaAirport.lat,
                    viaAirport.lng,
                    demand.dest.lat,
                    demand.dest.lng,
                  ),
                ),
              )
            : 0;
          const fallbackTotalDistance = viaAirport
            ? leg1Distance + leg2Distance
            : demand.dist_nm;

          assignedPlaneIds.add(planeId);
          routeIdByPlaneId.set(planeId, routeId);
          loadedRoutes.push({
            id: routeId,
            demand,
            plane,
            hub_iata: demand.origin.iata,
            via_iata: viaIata,
            total_dist_nm: Math.max(
              1,
              finiteNumber(row.total_dist_nm, fallbackTotalDistance),
            ),
            leg1_dist_nm: viaIata
              ? Math.max(1, finiteNumber(row.leg1_dist_nm, leg1Distance))
              : null,
            leg2_dist_nm: viaIata
              ? Math.max(1, finiteNumber(row.leg2_dist_nm, leg2Distance))
              : null,
            via_pax_ratio:
              viaIata && row.via_pax_ratio != null
                ? clamp(finiteNumber(row.via_pax_ratio, 0.5), 0, 1)
                : null,
            active: true,
            price_strategy: normalizePriceStrategy(row.price_strategy),
          });
        }

        const ownedPlanes = loadedPlanes.map((plane) => ({
          ...plane,
          route_id: routeIdByPlaneId.get(plane.id) ?? null,
        }));
        const reconciledPlaneMap = new Map(
          ownedPlanes.map((plane) => [plane.id, plane]),
        );
        const routes = loadedRoutes.map((route) => ({
          ...route,
          plane: reconciledPlaneMap.get(route.plane.id) ?? route.plane,
        }));

        setOwnedPlanes(ownedPlanes);
        setRoutes(routes);

        // ── ledger ─────────────────────────────

        const airlineDay = useGameStore.getState().airline?.day ?? 1;

        const ledgerData = await fetchAllRows<any>(
          supabase
            .from("ledger")
            .select("*")
            .eq("airline_id", airlineId)
            .gte("day", Math.max(1, airlineDay - 90))
            .order("day", { ascending: false }),
        );

        const validLedgerTypes = new Set<LedgerEntry["type"]>([
          "revenue",
          "interest",
          "purchase",
          "loan",
          "event",
        ]);
        const ledger: LedgerEntry[] = ledgerData
          .slice(0, 365)
          .map(
            (e: {
              id: string;
              day: number;
              type: string;
              label: string;
              amount: number;
              route_id?: string | null;
            }) => ({
              id: String(e.id),
              day: Math.max(1, nonNegativeInteger(e.day, 1)),
              type: validLedgerTypes.has(e.type as LedgerEntry["type"])
                ? (e.type as LedgerEntry["type"])
                : "event",
              label: String(e.label ?? "Airline activity"),
              amount: finiteNumber(e.amount),
              route_id: e.route_id ?? null,
            }),
          );

        setLedger(ledger);

        setLoadStep("fleet", "done");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load fleet";
      setLoadStep("fleet", "error", msg);
      setLoadError(msg);
      return;
    }

    setLoadComplete();
    setPhase("playing");
  }
}
