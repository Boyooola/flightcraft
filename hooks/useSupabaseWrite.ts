/**
 * hooks/useSupabaseWrite.ts
 *
 * Centralised Supabase write-back.
 * Pattern: optimistic store update first → async DB write → rollback on error.
 */

import {
  generateDemands,
  generateOneDemand,
  hubPurchaseCost,
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
    async (airport: Airport): Promise<{ error: string | null }> => {
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
      const newDemands = generateDemands(
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
            pax_day: d.pax_day,
            status: "pending",
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
            pax_day: row.pax_day,
            status: row.status as Demand["status"],
            delivered_pax_today: 0,
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
// CREATE ROUTE
// ─────────────────────────────────────────────────────────────────

export function useCreateRoute() {
  const store = useGameStore.getState;

  return useCallback(
    async (
      demand: Demand,
      plane: OwnedPlane,
      viaIata: string | null = null,
      totalDistNm: number | null = null,
    ): Promise<{ error: string | null }> => {
      const { airline, addRoute, updateDemand } = store();
      if (!airline) return { error: "No airline found" };

      const routeDistNm = totalDistNm ?? demand.dist_nm;

      if (!viaIata && demand.dist_nm > plane.plane_model.range_nm) {
        return {
          error:
            `${plane.plane_model.nickname} can't reach ${demand.dest.iata}. ` +
            `Range: ${plane.plane_model.range_nm}nm, Distance: ${demand.dist_nm}nm`,
        };
      }

      const tempRouteId = `temp-${Date.now()}`;
      addRoute({
        id: tempRouteId,
        demand,
        plane,
        hub_iata: demand.hub_iata,
        via_iata: viaIata,
        total_dist_nm: routeDistNm,
        active: true,
      });
      updateDemand(demand.id, { status: "served" });

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
          .update({ status: "served" })
          .eq("id", demand.id);

        const { removeRoute, addRoute: ar } = store();
        removeRoute(tempRouteId);
        ar({
          id: routeData.id,
          demand,
          plane,
          hub_iata: demand.hub_iata,
          via_iata: viaIata,
          total_dist_nm: routeDistNm,
          active: true,
        });

        const newScore = (airline.demand_score ?? 0) + 1;
        await supabase
          .from("airlines")
          .update({ demand_score: newScore })
          .eq("id", airline.id);
        store().updateAirline({ demand_score: newScore });

        return { error: null };
      } catch (err) {
        const { removeRoute, updateDemand: ud } = store();
        removeRoute(tempRouteId);
        ud(demand.id, { status: "pending" });
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
    const { airline, hubs } = store();
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
          pax_day: newDemand.pax_day,
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
          pax_day: data.pax_day,
          status: "pending",
          delivered_pax_today: 0,
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
          error: `Serve ${remaining} more demand${remaining > 1 ? "s" : ""} to unlock this aircraft`,
        };
      }

      const tempId = `temp-plane-${Date.now()}`;
      spendCash(planeModel.price);
      addOwnedPlane({ id: tempId, plane_model: planeModel, route_id: null });
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
      const { routes, removeRoute, updateDemand } = store();
      const route = routes.find((r) => r.id === routeId);
      if (!route) return { error: "Route not found" };

      const otherActiveRoutes = routes.filter(
        (r) => r.active && r.demand.id === route.demand.id && r.id !== routeId,
      );
      const isLastRoute = otherActiveRoutes.length === 0;

      removeRoute(routeId);
      if (isLastRoute) {
        updateDemand(route.demand.id, { status: "pending" });
      }

      try {
        const { error: routeErr } = await supabase
          .from("routes")
          .update({ active: false })
          .eq("id", routeId);

        if (routeErr) throw new Error(routeErr.message);

        if (isLastRoute) {
          await supabase
            .from("demands")
            .update({ status: "pending" })
            .eq("id", route.demand.id);
        }

        return { error: null };
      } catch (err) {
        store().addRoute(route);
        if (isLastRoute) {
          store().updateDemand(route.demand.id, { status: "served" });
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
      if (airline.cash < actual)
        return { error: "Insufficient cash to repay that amount" };

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
// Bug fix: reuses existing demand if one already exists for this
// origin→dest corridor at this hub, instead of creating a duplicate.
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
      origin: import("@/store").Airport,
      dest: import("@/store").Airport,
      via: import("@/store").Airport | null,
      plane: import("@/store").OwnedPlane,
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

      // ── Bug 1 fix: reuse existing demand if corridor already exists ──
      // Check for an existing demand at this hub for the same origin→dest
      const existingDemand = demands.find(
        (d) =>
          d.hub_iata === origin.iata &&
          d.origin.iata === origin.iata &&
          d.dest.iata === dest.iata,
      );

      const tempRouteId = `custom-route-${Date.now()}`;
      spendCash(fee);

      let demandToUse: typeof existingDemand extends undefined
        ? (typeof demands)[0]
        : typeof existingDemand;

      if (existingDemand) {
        // Reuse the existing demand — just create the route
        demandToUse = existingDemand;
        addRoute({
          id: tempRouteId,
          demand: existingDemand,
          plane,
          hub_iata: origin.iata,
          via_iata: via?.iata ?? null,
          total_dist_nm: totalDist,
          active: true,
        });
      } else {
        // Create a new synthetic demand
        const tempDemandId = `custom-demand-${Date.now()}`;
        const syntheticDemand = {
          id: tempDemandId,
          airline_id: airline.id,
          hub_iata: origin.iata,
          origin,
          dest,
          dist_nm: distNm,
          haul: haul as any,
          pax_day: paxDay,
          status: "served" as const,
          delivered_pax_today: 0,
        };
        addDemands([syntheticDemand]);
        addRoute({
          id: tempRouteId,
          demand: syntheticDemand,
          plane,
          hub_iata: origin.iata,
          via_iata: via?.iata ?? null,
          total_dist_nm: totalDist,
          active: true,
        });
        demandToUse = syntheticDemand;
      }

      try {
        let demandId: string;

        if (existingDemand) {
          // Use existing demand ID — no insert needed
          demandId = existingDemand.id;
          // Mark as served if it was pending
          if (existingDemand.status === "pending") {
            store().updateDemand(existingDemand.id, { status: "served" });
            await supabase
              .from("demands")
              .update({ status: "served" })
              .eq("id", existingDemand.id);
          }
        } else {
          // Insert new synthetic demand
          const { data: demandData, error: demandErr } = await supabase
            .from("demands")
            .insert({
              airline_id: airline.id,
              hub_iata: origin.iata,
              origin_iata: origin.iata,
              dest_iata: dest.iata,
              dist_nm: distNm,
              haul,
              pax_day: paxDay,
              status: "served",
              source: "custom",
            })
            .select()
            .single();
          if (demandErr) throw new Error(demandErr.message);

          // Replace temp demand ID with real one
          const { setDemands } = store();
          const realDemand = { ...demandToUse, id: demandData.id };
          setDemands(
            store().demands.map((d) =>
              d.id === demandToUse!.id ? realDemand : d,
            ),
          );
          demandToUse = realDemand;
          demandId = demandData.id;
        }

        // Insert route
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

        // Persist cash + demand score
        await supabase
          .from("airlines")
          .update({
            cash: store().airline?.cash,
            demand_score: (airline.demand_score ?? 0) + 1,
          })
          .eq("id", airline.id);
        store().updateAirline({
          demand_score: (airline.demand_score ?? 0) + 1,
        });

        // Replace temp route ID with real one
        const { removeRoute, addRoute: ar } = store();
        removeRoute(tempRouteId);
        ar({
          id: routeData.id,
          demand: demandToUse!,
          plane,
          hub_iata: origin.iata,
          via_iata: via?.iata ?? null,
          total_dist_nm: totalDist,
          active: true,
        });

        clearRouteCreation();
        return { error: null };
      } catch (err) {
        // Rollback
        const { removeRoute: rr, earnCash } = store();
        rr(tempRouteId);
        if (!existingDemand) {
          store().setDemands(
            store().demands.filter((d) =>
              d.id === demandToUse?.id ? false : true,
            ),
          );
        }
        earnCash(fee);
        return {
          error: err instanceof Error ? err.message : "Failed to create route",
        };
      }
    },
    [],
  );
}
