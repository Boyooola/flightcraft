/**
 * hooks/useSupabaseWrite.ts
 *
 * Centralised Supabase write-back.
 * Pattern: optimistic store update first → async DB write → rollback on error.
 *
 * Multi-plane route model:
 *   - 1 route row = 1 assigned plane
 *   - multiple route rows may share the same demand_id
 *   - assigning a plane does NOT mark demand as served
 *   - demand is considered cleared by passenger flow when delivered_pax_today >= pax_day
 */

import { gameSounds } from "@/hooks/useGameSounds";
import {
  generateDemands,
  generateOneDemand,
  hubPurchaseCost,
  simulatePaxDay,
} from "@/lib/demands";
import { fmtCash } from "@/lib/revenue";
import { supabase } from "@/lib/supabase";
import type { Airport, Demand, OwnedPlane, PlaneModel } from "@/store";
import { useGameStore } from "@/store";
import { useCallback } from "react";

// ─────────────────────────────────────────────────────────────────
// BUY HUB
// ─────────────────────────────────────────────────────────────────

export function useBuyHub() {
  const store = useGameStore.getState;

  return useCallback(
    async (
      airport: Airport,
      preGenerated?: Demand[],
    ): Promise<{ error: string | null }> => {
      const {
        airline,
        airports,
        demands,
        addHub,
        addDemands,
        spendCash,
        addLedgerEntries,
      } = store();

      if (!airline) return { error: "No airline found" };

      const cost = hubPurchaseCost(airport);

      if (airline.cash < cost) {
        return {
          error: `Insufficient funds. Need $${(cost / 1000).toFixed(0)}K`,
        };
      }

      const tempHubId = `temp-${Date.now()}`;
      spendCash(cost);
      addHub({ id: tempHubId, airport, tier: 1, trust: 0 });
      addLedgerEntries([
        {
          id: `led-${Date.now()}`,
          day: airline.day,
          type: "purchase",
          label: `Hub — ${airport.iata}`,
          amount: -cost,
          route_id: null,
        },
      ]);

      const existingDests = demands.map((d) => d.dest.iata);
      const newDemands =
        preGenerated && preGenerated.length > 0
          ? preGenerated
          : generateDemands(
              airport,
              airports,
              3,
              existingDests,
              airline.demand_score,
              true,
            );

      try {
        const { data: hubData, error: hubErr } = await supabase
          .from("hubs")
          .insert({
            airline_id: airline.id,
            iata: airport.iata,
            tier: 1,
            trust: 0,
          })
          .select()
          .single();

        if (hubErr) throw new Error(hubErr.message);

        const { updateHub } = store();
        updateHub(tempHubId, { id: hubData.id });

        if (newDemands.length > 0) {
          const demandRows = newDemands.map((d) => ({
            airline_id: airline.id,
            hub_iata: airport.iata,
            origin_iata: d.origin.iata,
            dest_iata: d.dest.iata,
            dist_nm: d.dist_nm,
            haul: d.haul,
            status: "pending",
            popularity: d.popularity,
            base_pax_day: d.base_pax_day,
          }));

          const { data: demandData, error: demandErr } = await supabase
            .from("demands")
            .insert(demandRows)
            .select();

          if (demandErr) throw new Error(demandErr.message);

          const airportMap = new Map(airports.map((a) => [a.iata, a]));
          const fullDemands: Demand[] = (demandData ?? []).map((row: any) => ({
            id: row.id,
            airline_id: row.airline_id,
            hub_iata: row.hub_iata,
            origin: airportMap.get(row.origin_iata)!,
            dest: airportMap.get(row.dest_iata)!,
            dist_nm: row.dist_nm,
            haul: row.haul as Demand["haul"],
            status: row.status as Demand["status"],
            delivered_pax_today: 0,
            popularity: row.popularity,
            base_pax_day: row.base_pax_day,
          }));

          addDemands(fullDemands);
        }

        await supabase
          .from("airlines")
          .update({ cash: store().airline?.cash })
          .eq("id", airline.id);

        return { error: null };
      } catch (err) {
        const { setHubs, earnCash } = store();
        setHubs(store().hubs.filter((h) => h.id !== tempHubId));
        earnCash(cost);
        return {
          error: err instanceof Error ? err.message : "Failed to purchase hub",
        };
      }
    },
    [],
  );
}

// ─────────────────────────────────────────────────────────────────
// SELL HUB
// ─────────────────────────────────────────────────────────────────

export function useSellHub() {
  const store = useGameStore.getState;

  return useCallback(
    async (
      hubId: string,
    ): Promise<{ error: string | null; refund: number }> => {
      const {
        airline,
        hubs,
        demands,
        routes,
        earnCash,
        setHubs,
        setDemands,
        setRoutes,
        setOwnedPlanes,
        addLedgerEntries,
      } = store();

      if (!airline) return { error: "No airline", refund: 0 };

      const hub = hubs.find((h) => h.id === hubId);
      if (!hub) return { error: "Hub not found", refund: 0 };

      const refund = Math.round(hubPurchaseCost(hub.airport) * 0.5);

      const hubDemands = demands.filter((d) => d.hub_iata === hub.airport.iata);
      const demandIds = hubDemands.map((d) => d.id);
      const hubRoutes = routes.filter((r) => r.hub_iata === hub.airport.iata);
      const routeIds = hubRoutes.map((r) => r.id);

      earnCash(refund);
      setHubs(hubs.filter((h) => h.id !== hubId));
      setDemands(demands.filter((d) => !demandIds.includes(d.id)));
      setRoutes(routes.filter((r) => !routeIds.includes(r.id)));

      const assignedPlaneIds = new Set(hubRoutes.map((r) => r.plane.id));
      setOwnedPlanes(
        store().ownedPlanes.map((p) =>
          assignedPlaneIds.has(p.id) ? { ...p, route_id: null } : p,
        ),
      );

      addLedgerEntries([
        {
          id: `led-sell-hub-${Date.now()}`,
          day: airline.day,
          type: "revenue",
          label: `Sold hub — ${hub.airport.iata}`,
          amount: refund,
          route_id: null,
        },
      ]);

      try {
        if (routeIds.length > 0) {
          await supabase
            .from("routes")
            .update({ active: false })
            .in("id", routeIds);

          await supabase
            .from("owned_planes")
            .update({ route_id: null })
            .in("id", [...assignedPlaneIds]);
        }

        if (demandIds.length > 0) {
          await supabase.from("demands").delete().in("id", demandIds);
        }

        await supabase.from("hubs").delete().eq("id", hubId);

        await supabase
          .from("airlines")
          .update({ cash: store().airline?.cash })
          .eq("id", airline.id);

        return { error: null, refund };
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : "Failed to sell hub",
          refund: 0,
        };
      }
    },
    [],
  );
}

// ─────────────────────────────────────────────────────────────────
// REFRESH DEMANDS — adds a new demand at an owned hub ($50K)
// ─────────────────────────────────────────────────────────────────

export function useRefreshDemands() {
  return useCallback(
    async (hubIata: string): Promise<{ error: string | null }> => {
      const {
        airline,
        airports,
        demands,
        hubs,
        addDemands,
        spendCash,
        addLedgerEntries,
      } = useGameStore.getState();

      if (!airline) return { error: "No airline" };

      const hub = hubs.find((h) => h.airport.iata === hubIata);
      if (!hub) return { error: "Hub not found" };

      const REFRESH_COST = 50_000;
      if (airline.cash < REFRESH_COST) {
        return { error: `Need $50K to unlock a new route demand` };
      }

      const existingDests = demands
        .filter((d) => d.hub_iata === hubIata)
        .map((d) => d.dest.iata);

      const newDemands = generateDemands(
        hub.airport,
        airports,
        1,
        existingDests,
        airline.demand_score,
        true,
      );

      if (newDemands.length === 0) {
        return { error: "No new destinations available right now" };
      }

      spendCash(REFRESH_COST);
      addLedgerEntries([
        {
          id: `led-refresh-${Date.now()}`,
          day: airline.day,
          type: "purchase",
          label: `New route demand — ${hubIata}`,
          amount: -REFRESH_COST,
          route_id: null,
        },
      ]);

      try {
        const d = newDemands[0];
        const { data, error } = await supabase
          .from("demands")
          .insert({
            airline_id: airline.id,
            hub_iata: hubIata,
            origin_iata: d.origin.iata,
            dest_iata: d.dest.iata,
            dist_nm: d.dist_nm,
            haul: d.haul,
            base_pax_day: d.base_pax_day,
            status: "pending",
          })
          .select()
          .single();

        if (error) throw new Error(error.message);

        if (data) {
          addDemands([
            {
              ...d,
              id: data.id,
              airline_id: airline.id,
              hub_iata: hubIata,
              delivered_pax_today: 0,
            },
          ]);
        }

        return { error: null };
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : "Failed to add demand",
        };
      }
    },
    [],
  );
}

// ─────────────────────────────────────────────────────────────────
// CREATE ROUTE — existing generated demand
// ─────────────────────────────────────────────────────────────────

export function useCreateRoute() {
  const store = useGameStore.getState;

  return useCallback(
    async (
      demand: Demand,
      plane: OwnedPlane,
      viaIata: string | null = null,
      viaPaxRatio: number | null = null,
      totalDistNm: number | null = null,
    ): Promise<{ error: string | null }> => {
      const { airline, addRoute, airports } = store();
      if (!airline) return { error: "No airline found" };

      const routeDistNm = totalDistNm ?? demand.dist_nm;

      // Auto-compute via_pax_ratio for connecting routes
      let computedViaPaxRatio = viaPaxRatio;
      if (viaIata && !computedViaPaxRatio) {
        try {
          const { computeViaPaxRatio } = await import("@/lib/od");
          const viaAirport = airports.find((a) => a.iata === viaIata);
          const destAirport = demand.dest;
          if (viaAirport && destAirport && totalDistNm) {
            // Approximate leg distances — origin→via and via→dest
            const originAirport = demand.origin;
            const leg1 =
              originAirport && viaAirport
                ? Math.round(
                    Math.sqrt(
                      Math.pow((originAirport.lat - viaAirport.lat) * 60, 2) +
                        Math.pow(
                          (originAirport.lng - viaAirport.lng) *
                            60 *
                            Math.cos((originAirport.lat * Math.PI) / 180),
                          2,
                        ),
                    ),
                  )
                : totalDistNm * 0.5;
            const leg2 = totalDistNm - leg1;
            computedViaPaxRatio = computeViaPaxRatio({
              leg1Nm: leg1,
              leg2Nm: leg2,
              viaAirport,
              destAirport,
              businessPct: demand.business_pct ?? 0.25,
            });
          }
        } catch {}
      }

      if (!viaIata && demand.dist_nm > plane.plane_model.range_nm) {
        return {
          error:
            `${plane.plane_model.nickname} can't reach ${demand.dest.iata}. ` +
            `Range: ${plane.plane_model.range_nm}nm, Distance: ${demand.dist_nm}nm`,
        };
      }

      const planeBusy = store().routes.some(
        (r) => r.active && r.plane.id === plane.id,
      );

      if (planeBusy) {
        return { error: `${plane.plane_model.nickname} is already assigned` };
      }

      const tempRouteId = `temp-route-${Date.now()}-${plane.id}`;

      addRoute({
        id: tempRouteId,
        demand: { ...demand, status: "pending" },
        plane,
        hub_iata: demand.hub_iata,
        via_iata: viaIata,
        total_dist_nm: routeDistNm,
        active: true,
        via_pax_ratio: computedViaPaxRatio,
        price_strategy: "standard",
      });

      // Multi-plane safe: demand stays pending/active while planes serve it.
      store().updateDemand(demand.id, { status: "pending" });
      gameSounds.play("routeCreate");

      try {
        const { data: routeData, error: routeErr } = await supabase
          .from("routes")
          .insert({
            airline_id: airline.id,
            demand_id: demand.id,
            plane_id: plane.id,
            hub_iata: demand.hub_iata,
            via_iata: viaIata,
            total_dist_nm: routeDistNm,
            active: true,
          })
          .select()
          .single();

        if (routeErr) throw new Error(routeErr.message);

        await supabase
          .from("demands")
          .update({ status: "pending" })
          .eq("id", demand.id);

        await supabase
          .from("owned_planes")
          .update({ route_id: routeData.id })
          .eq("id", plane.id);

        const { removeRoute, addRoute: ar, setOwnedPlanes } = store();

        removeRoute(tempRouteId);
        ar({
          id: routeData.id,
          demand: { ...demand, status: "pending" },
          plane: { ...plane, route_id: routeData.id },
          hub_iata: demand.hub_iata,
          via_iata: viaIata,
          total_dist_nm: routeDistNm,
          active: true,
          via_pax_ratio: computedViaPaxRatio,
        });

        setOwnedPlanes(
          store().ownedPlanes.map((p) =>
            p.id === plane.id ? { ...p, route_id: routeData.id } : p,
          ),
        );

        const newScore = (store().airline?.demand_score ?? 0) + 1;
        await supabase
          .from("airlines")
          .update({ demand_score: newScore })
          .eq("id", airline.id);
        store().updateAirline({ demand_score: newScore });

        return { error: null };
      } catch (err) {
        const { removeRoute } = store();
        removeRoute(tempRouteId);
        return {
          error: err instanceof Error ? err.message : "Failed to create route",
        };
      }
    },
    [],
  );
}

// ─────────────────────────────────────────────────────────────────
// DAILY TICK WRITE-BACK
// ─────────────────────────────────────────────────────────────────

export function useSaveAirlineDay() {
  const store = useGameStore.getState;

  return useCallback(async () => {
    const { airline, hubs, demands } = store();
    if (!airline) return;

    const { earnedAchievements, missionsCompleted } = store();

    await supabase
      .from("airlines")
      .update({
        cash: airline.cash,
        loan: airline.loan,
        loan_rate: airline.loan_rate,
        day: airline.day,
        demand_score: airline.demand_score,
        reputation: airline.reputation,
        achievements: earnedAchievements,
        missions_completed: missionsCompleted,
      })
      .eq("id", airline.id);

    const hubUpdates = hubs
      .filter((h) => !h.id.startsWith("temp-"))
      .map((h) =>
        supabase
          .from("hubs")
          .update({ trust: Math.round(h.trust * 10) / 10 })
          .eq("id", h.id),
      );

    await Promise.all(hubUpdates);

    await Promise.all(
      demands.map((d) =>
        supabase
          .from("demands")
          .update({
            popularity: d.popularity,
            delivered_pax_today: d.delivered_pax_today,
            base_pax_day: d.base_pax_day,
          })
          .eq("id", d.id),
      ),
    );
  }, []);
}

// ─────────────────────────────────────────────────────────────────
// SPAWN DAILY NEW DEMAND
// ─────────────────────────────────────────────────────────────────

export function useSpawnDailyDemand() {
  const store = useGameStore.getState;

  return useCallback(async (hubIata: string) => {
    const { airline, airports, demands, hubs, addDemands } = store();
    if (!airline) return;

    const hub = hubs.find((h) => h.airport.iata === hubIata);
    if (!hub) return;

    const hubDemands = demands.filter((d) => d.hub_iata === hubIata);
    const hasPending = hubDemands.some((d) => d.status === "pending");
    if (hasPending) return;

    const existingDests = hubDemands.map((d) => d.dest.iata);
    const newDemand = generateOneDemand(
      hub.airport,
      airports,
      existingDests,
      airline.demand_score,
      hubDemands.length,
    );

    if (!newDemand) return;

    try {
      const { data, error } = await supabase
        .from("demands")
        .insert({
          airline_id: airline.id,
          hub_iata: hubIata,
          origin_iata: newDemand.origin.iata,
          dest_iata: newDemand.dest.iata,
          dist_nm: newDemand.dist_nm,
          haul: newDemand.haul,
          base_pax_day: newDemand.base_pax_day,
          status: "pending",
        })
        .select()
        .single();

      if (error || !data) return;

      const airportMap = new Map(airports.map((a) => [a.iata, a]));
      addDemands([
        {
          id: data.id,
          airline_id: data.airline_id,
          hub_iata: data.hub_iata,
          origin: airportMap.get(data.origin_iata)!,
          dest: airportMap.get(data.dest_iata)!,
          dist_nm: data.dist_nm,
          haul: data.haul,
          status: "pending",
          delivered_pax_today: data.delivered_pax_today,
          base_pax_day: data.base_pax_day ?? 0,
          popularity: data.popularity,
        },
      ]);
    } catch {
      // Silent fail — will retry next day
    }
  }, []);
}

// ─────────────────────────────────────────────────────────────────
// BUY PLANE
// ─────────────────────────────────────────────────────────────────

export function useBuyPlane() {
  const store = useGameStore.getState;

  return useCallback(
    async (planeModel: PlaneModel): Promise<{ error: string | null }> => {
      const { airline, spendCash, addOwnedPlane, addLedgerEntries } = store();
      if (!airline) return { error: "No airline found" };

      if (airline.cash < planeModel.price) {
        return {
          error: `Insufficient funds. Need ${fmtCash(planeModel.price)}`,
        };
      }

      if ((airline.demand_score ?? 0) < planeModel.unlock_demands) {
        const remaining =
          planeModel.unlock_demands - (airline.demand_score ?? 0);
        return {
          error: `Serve ${remaining} more demand${
            remaining > 1 ? "s" : ""
          } to unlock this aircraft`,
        };
      }

      const tempId = `temp-plane-${Date.now()}`;
      spendCash(planeModel.price);
      addOwnedPlane({ id: tempId, plane_model: planeModel, route_id: null });
      store().setBoughtPlaneToday(true);

      addLedgerEntries([
        {
          id: `led-plane-${Date.now()}`,
          day: airline.day,
          type: "purchase",
          label: `Purchased ${planeModel.nickname}`,
          amount: -planeModel.price,
          route_id: null,
        },
      ]);

      try {
        const { data, error } = await supabase
          .from("owned_planes")
          .insert({ airline_id: airline.id, plane_id: planeModel.id })
          .select()
          .single();

        if (error) throw new Error(error.message);

        store().setOwnedPlanes(
          store().ownedPlanes.map((p) =>
            p.id === tempId ? { ...p, id: data.id } : p,
          ),
        );

        await supabase
          .from("airlines")
          .update({ cash: store().airline?.cash })
          .eq("id", airline.id);

        return { error: null };
      } catch (err) {
        store().setOwnedPlanes(
          store().ownedPlanes.filter((p) => p.id !== tempId),
        );
        store().earnCash(planeModel.price);
        return {
          error:
            err instanceof Error ? err.message : "Failed to purchase aircraft",
        };
      }
    },
    [],
  );
}

// ─────────────────────────────────────────────────────────────────
// DEACTIVATE ROUTE
// ─────────────────────────────────────────────────────────────────

export function useDeactivateRoute() {
  const store = useGameStore.getState;

  return useCallback(
    async (routeId: string): Promise<{ error: string | null }> => {
      const { routes, removeRoute, setOwnedPlanes } = store();
      const route = routes.find((r) => r.id === routeId);
      if (!route) return { error: "Route not found" };

      const otherActiveRoutes = routes.filter(
        (r) => r.active && r.demand.id === route.demand.id && r.id !== routeId,
      );

      const isLastRoute = otherActiveRoutes.length === 0;
      const previousDemandStatus = route.demand.status;

      removeRoute(routeId);

      setOwnedPlanes(
        store().ownedPlanes.map((p) =>
          p.id === route.plane.id ? { ...p, route_id: null } : p,
        ),
      );

      if (isLastRoute) {
        store().updateDemand(route.demand.id, { status: "pending" });
      }

      try {
        const { error: routeErr } = await supabase
          .from("routes")
          .update({ active: false })
          .eq("id", routeId);

        if (routeErr) throw new Error(routeErr.message);

        await supabase
          .from("owned_planes")
          .update({ route_id: null })
          .eq("id", route.plane.id);

        if (isLastRoute) {
          await supabase
            .from("demands")
            .update({ status: "pending" })
            .eq("id", route.demand.id);
        }

        return { error: null };
      } catch (err) {
        store().addRoute(route);
        store().setOwnedPlanes(
          store().ownedPlanes.map((p) =>
            p.id === route.plane.id ? { ...p, route_id: route.id } : p,
          ),
        );

        if (isLastRoute) {
          store().updateDemand(route.demand.id, {
            status: previousDemandStatus,
          });
        }

        return {
          error:
            err instanceof Error ? err.message : "Failed to deactivate route",
        };
      }
    },
    [],
  );
}

// ─────────────────────────────────────────────────────────────────
// LOAN ACTIONS
// ─────────────────────────────────────────────────────────────────

export function useLoanActions() {
  const store = useGameStore.getState;

  const take = useCallback(
    async (amount: number, rate: number): Promise<{ error: string | null }> => {
      const { airline, takeLoan } = store();
      if (!airline) return { error: "No airline found" };

      const { routes } = store();
      if (routes.filter((r) => r.active).length === 0) {
        return {
          error: "You need at least one active route before taking a loan.",
        };
      }

      takeLoan(amount, rate);

      try {
        const { error } = await supabase
          .from("airlines")
          .update({
            cash: airline.cash + amount,
            loan: airline.loan + amount,
            loan_rate: rate,
          })
          .eq("id", airline.id);

        if (error) throw new Error(error.message);
        return { error: null };
      } catch (err) {
        store().repayLoan(amount);
        store().updateAirline({ loan_rate: airline.loan_rate });
        return {
          error: err instanceof Error ? err.message : "Failed to take loan",
        };
      }
    },
    [],
  );

  const repay = useCallback(
    async (amount: number): Promise<{ error: string | null }> => {
      const { airline, repayLoan } = store();
      if (!airline) return { error: "No airline found" };

      const actual = Math.min(amount, airline.loan);
      if (actual <= 0) return { error: "No loan balance to repay" };
      if (airline.cash < actual) {
        return { error: "Insufficient cash to repay that amount" };
      }

      repayLoan(actual);

      try {
        const updated = store().airline!;
        const { error } = await supabase
          .from("airlines")
          .update({
            cash: updated.cash,
            loan: updated.loan,
            loan_rate: updated.loan <= 0 ? 0 : updated.loan_rate,
          })
          .eq("id", airline.id);

        if (error) throw new Error(error.message);
        return { error: null };
      } catch (err) {
        store().takeLoan(actual, airline.loan_rate);
        return {
          error: err instanceof Error ? err.message : "Failed to repay loan",
        };
      }
    },
    [],
  );

  return { take, repay };
}

// ─────────────────────────────────────────────────────────────────
// CREATE CUSTOM ROUTE
// Reuses existing demand for the same origin→dest corridor.
// Multi-plane safe: creating a route keeps demand status as pending.
// ─────────────────────────────────────────────────────────────────

const ROUTE_CREATION_FEE: Record<string, number> = {
  short: 50_000,
  medium: 150_000,
  long: 300_000,
};

export function useCreateCustomRoute() {
  const store = useGameStore.getState;

  return useCallback(
    async (
      origin: Airport,
      dest: Airport,
      via: Airport | null,
      plane: OwnedPlane,
      paxDay: number,
      distNm: number,
      haul: string,
      totalDist: number,
    ): Promise<{ error: string | null }> => {
      const {
        airline,
        spendCash,
        addDemands,
        addRoute,
        clearRouteCreation,
        demands,
      } = store();

      if (!airline) return { error: "No airline found" };

      const fee = ROUTE_CREATION_FEE[haul] ?? 150_000;
      if (airline.cash < fee) {
        return {
          error: `Opening this route costs ${fee.toLocaleString("en", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0,
          })}. You need ${(fee - airline.cash).toLocaleString()} more.`,
        };
      }

      const planeBusy = store().routes.some(
        (r) => r.active && r.plane.id === plane.id,
      );

      if (planeBusy) {
        return { error: `${plane.plane_model.nickname} is already assigned` };
      }

      const existingDemand = demands.find(
        (d) =>
          d.hub_iata === origin.iata &&
          d.origin.iata === origin.iata &&
          d.dest.iata === dest.iata,
      );

      let viaPaxRatio: number | null = null;
      if (via) {
        const legDemand = demands.find(
          (d) => d.origin.iata === origin.iata && d.dest.iata === via.iata,
        );
        const legPaxDay =
          legDemand?.base_pax_day ?? simulatePaxDay(origin, via, distNm);
        const throughPaxDay = paxDay;
        viaPaxRatio = legPaxDay / Math.max(1, legPaxDay + throughPaxDay);
      }

      const tempRouteId = `custom-route-${Date.now()}-${plane.id}`;
      const tempDemandId = `custom-demand-${Date.now()}`;

      spendCash(fee);

      let demandToUse: Demand;

      if (existingDemand) {
        demandToUse = { ...existingDemand, status: "pending" };

        store().updateDemand(existingDemand.id, { status: "pending" });

        addRoute({
          id: tempRouteId,
          demand: demandToUse,
          plane,
          hub_iata: origin.iata,
          via_iata: via?.iata ?? null,
          total_dist_nm: totalDist,
          via_pax_ratio: viaPaxRatio,
          active: true,
          price_strategy: "standard",
        });
      } else {
        const syntheticDemand: Demand = {
          id: tempDemandId,
          airline_id: airline.id,
          hub_iata: origin.iata,
          origin,
          dest,
          dist_nm: distNm,
          haul: haul as Demand["haul"],
          base_pax_day: paxDay,
          status: "pending",
          delivered_pax_today: 0,
          popularity: 0,
        };

        addDemands([syntheticDemand]);

        addRoute({
          id: tempRouteId,
          demand: syntheticDemand,
          plane,
          hub_iata: origin.iata,
          via_iata: via?.iata ?? null,
          total_dist_nm: totalDist,
          via_pax_ratio: viaPaxRatio,
          active: true,
          price_strategy: "standard",
        });

        demandToUse = syntheticDemand;
      }

      gameSounds.play("routeCreate");

      try {
        let demandId: string;

        if (existingDemand) {
          demandId = existingDemand.id;

          await supabase
            .from("demands")
            .update({ status: "pending" })
            .eq("id", existingDemand.id);
        } else {
          const { data: demandData, error: demandErr } = await supabase
            .from("demands")
            .insert({
              airline_id: airline.id,
              hub_iata: origin.iata,
              origin_iata: origin.iata,
              dest_iata: dest.iata,
              dist_nm: distNm,
              haul,
              base_pax_day: paxDay,
              status: "pending",
              source: "custom",
            })
            .select()
            .single();

          if (demandErr) throw new Error(demandErr.message);

          const realDemand: Demand = {
            ...demandToUse,
            id: demandData.id,
            status: "pending",
          };

          store().setDemands(
            store().demands.map((d) =>
              d.id === demandToUse.id ? realDemand : d,
            ),
          );

          demandToUse = realDemand;
          demandId = demandData.id;
        }

        // Important: via leg demands are no longer marked served here.
        // They should only be considered cleared by actual delivered pax.

        const { data: routeData, error: routeErr } = await supabase
          .from("routes")
          .insert({
            airline_id: airline.id,
            demand_id: demandId,
            plane_id: plane.id,
            hub_iata: origin.iata,
            via_iata: via?.iata ?? null,
            total_dist_nm: totalDist,
            active: true,
          })
          .select()
          .single();

        if (routeErr) throw new Error(routeErr.message);

        await supabase
          .from("owned_planes")
          .update({ route_id: routeData.id })
          .eq("id", plane.id);

        const newScore = (store().airline?.demand_score ?? 0) + 1;

        await supabase
          .from("airlines")
          .update({
            cash: store().airline?.cash,
            demand_score: newScore,
          })
          .eq("id", airline.id);

        store().updateAirline({ demand_score: newScore });

        const { removeRoute, addRoute: ar, setOwnedPlanes } = store();

        removeRoute(tempRouteId);

        ar({
          id: routeData.id,
          demand: demandToUse,
          plane: { ...plane, route_id: routeData.id },
          hub_iata: origin.iata,
          via_iata: via?.iata ?? null,
          total_dist_nm: totalDist,
          via_pax_ratio: viaPaxRatio,
          active: true,
        });

        setOwnedPlanes(
          store().ownedPlanes.map((p) =>
            p.id === plane.id ? { ...p, route_id: routeData.id } : p,
          ),
        );

        clearRouteCreation();
        return { error: null };
      } catch (err) {
        store().removeRoute(tempRouteId);
        store().earnCash(fee);

        if (!existingDemand) {
          store().setDemands(
            store().demands.filter((d) => d.id !== demandToUse.id),
          );
        }

        return {
          error: err instanceof Error ? err.message : "Failed to create route",
        };
      }
    },
    [],
  );
}
