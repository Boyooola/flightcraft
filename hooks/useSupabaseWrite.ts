/**
 * hooks/useSupabaseWrite.ts
 *
 * Centralised Supabase write-back.
 * Pattern: optimistic store update first, then database write, then rollback.
 *
 * Multi-plane route model:
 *   - 1 route row = 1 assigned plane
 *   - multiple route rows may share the same demand_id
 *   - assigning a plane does NOT mark demand as served
 *   - serving today's passengers never deletes or replaces the destination
 *   - missing opportunity slots are refilled once when the game day changes
 */

import { gameSounds } from "@/hooks/useGameSounds";
import { ResolvedChoice } from "@/lib/choiceEvents";
import {
  activeDemandCount,
  CASH_RESERVE_AFTER_BUY,
  demandSlotsForHub,
  generateHubOpportunities,
  HUB_TIER_CONFIG,
  hubPurchaseCost,
  presenceThreshold,
  routeOpportunityToLegacyDemand,
  simulatePaxDay,
} from "@/lib/demands";
import { fmtCash } from "@/lib/revenue";
import { supabase } from "@/lib/supabase";
import type { Airport, Demand, HubTier, OwnedPlane, PlaneModel } from "@/store";
import { useGameStore } from "@/store";
import { useCallback, useEffect } from "react";

type DemandDraft = Omit<Demand, "id" | "airline_id">;

interface OpportunityRefreshResult {
  added: number;
  error: string | null;
}

const opportunityRefreshes = new Map<
  string,
  Promise<OpportunityRefreshResult>
>();

function demandDraftsForHub(params: {
  hub: Airport;
  airports: readonly Airport[];
  ownedPlanes: readonly OwnedPlane[];
  gameDay: number;
  hubLevel: number;
  count?: number;
  existingDestinationIatas?: readonly string[];
}): DemandDraft[] {
  const airportByIata = new Map(
    params.airports.map((airport) => [airport.iata, airport]),
  );
  const opportunities = generateHubOpportunities({
    hub: params.hub,
    airports: params.airports,
    ownedPlanes: params.ownedPlanes,
    gameDay: params.gameDay,
    hubLevel: params.hubLevel,
    count: params.count,
    existingDestinationIatas: params.existingDestinationIatas,
  });

  return opportunities.flatMap((opportunity) => {
    const destination = airportByIata.get(opportunity.destinationIata);
    if (!destination) return [];
    return [
      routeOpportunityToLegacyDemand(
        opportunity,
        params.hub,
        destination,
        params.gameDay,
      ),
    ];
  });
}

async function insertDemandDrafts(params: {
  airlineId: string;
  hubIata: string;
  drafts: readonly DemandDraft[];
}): Promise<Demand[]> {
  if (params.drafts.length === 0) return [];

  const { data, error } = await supabase
    .from("demands")
    .insert(
      params.drafts.map((draft) => ({
        airline_id: params.airlineId,
        hub_iata: params.hubIata,
        origin_iata: draft.origin.iata,
        dest_iata: draft.dest.iata,
        dist_nm: draft.dist_nm,
        haul: draft.haul,
        status: "pending",
        popularity: draft.popularity,
        base_pax_day: draft.base_pax_day,
        pax_ceiling: draft.pax_ceiling,
        delivered_pax_today: 0,
        ai_stolen_pax: 0,
      })),
    )
    .select();

  if (error) throw new Error(error.message);

  const draftByDestination = new Map(
    params.drafts.map((draft) => [draft.dest.iata, draft]),
  );

  return (data ?? []).flatMap((row) => {
    const draft = draftByDestination.get(row.dest_iata);
    if (!draft) return [];
    return [
      {
        ...draft,
        id: row.id,
        airline_id: row.airline_id ?? params.airlineId,
        hub_iata: params.hubIata,
        status: "pending" as const,
        delivered_pax_today: 0,
        ai_stolen_pax: 0,
      },
    ];
  });
}

async function ensureHubOpportunitySlots(
  hubIata: string,
): Promise<OpportunityRefreshResult> {
  const initial = useGameStore.getState();
  const airline = initial.airline;
  const hub = initial.hubs.find((item) => item.airport.iata === hubIata);
  if (!airline || !hub) return { added: 0, error: "Hub not found" };

  const refreshKey = `${airline.id}:${hubIata}:${airline.day}`;
  const running = opportunityRefreshes.get(refreshKey);
  if (running) return running;

  const refresh = (async (): Promise<OpportunityRefreshResult> => {
    const state = useGameStore.getState();
    const hubDemands = state.demands.filter(
      (demand) => demand.hub_iata === hubIata,
    );
    const visibleSlots = demandSlotsForHub({ hubLevel: hub.tier });
    const missingSlots = Math.max(
      0,
      visibleSlots - activeDemandCount(hubIata, state.demands),
    );
    if (missingSlots === 0) return { added: 0, error: null };

    const drafts = demandDraftsForHub({
      hub: hub.airport,
      airports: state.airports,
      ownedPlanes: state.ownedPlanes,
      gameDay: airline.day,
      hubLevel: hub.tier,
      count: missingSlots,
      // Include dismissed rows so the replacement is genuinely different.
      existingDestinationIatas: hubDemands.map((demand) => demand.dest.iata),
    });
    if (drafts.length === 0) return { added: 0, error: null };

    try {
      const inserted = await insertDemandDrafts({
        airlineId: airline.id,
        hubIata,
        drafts,
      });
      if (inserted.length > 0) {
        useGameStore.getState().addDemands(inserted);
      }
      return { added: inserted.length, error: null };
    } catch (error) {
      return {
        added: 0,
        error:
          error instanceof Error
            ? error.message
            : "Unable to refresh route opportunities.",
      };
    }
  })().finally(() => {
    opportunityRefreshes.delete(refreshKey);
  });

  opportunityRefreshes.set(refreshKey, refresh);
  return refresh;
}

// ─────────────────────────────────────────────────────────────────
// BUY HUB
// ─────────────────────────────────────────────────────────────────

export function useBuyHub() {
  const store = useGameStore.getState;

  return useCallback(
    async (
      airport: Airport,
      _preGenerated?: Demand[],
    ): Promise<{ error: string | null }> => {
      const {
        airline,
        airports,
        hubs,
        aiAirlines,
        ownedPlanes,
        addHub,
        addDemands,
        spendCash,
        addLedgerEntries,
      } = store();

      if (!airline)
        return { error: "Something went wrong. Try restarting the app." };

      if (hubs.find((h) => h.airport.iata === airport.iata)) {
        return { error: "You already have a hub here!" };
      }

      const cost = hubPurchaseCost(airport);
      const isFirstHub = hubs.length === 0;

      if (isFirstHub) {
        if (airline.cash < cost) {
          return {
            error: `You need ${fmtCash(cost)} to open your first hub. Keep flying!`,
          };
        }
      } else {
        // ── Presence gate ──────────────────────────────────────────
        const aiHubCount = aiAirlines.filter((ai) =>
          ai.hubIatas.includes(airport.iata),
        ).length;
        const paxNeeded = presenceThreshold(airport, aiHubCount);
        const paxDelivered =
          store().presence.find((p) => p.airport_iata === airport.iata)
            ?.total_pax_delivered ?? 0;
        if (paxDelivered < paxNeeded) {
          const remaining = paxNeeded - paxDelivered;
          return {
            error: `Fly ${remaining.toLocaleString()} more passengers to ${airport.iata} before opening a hub here.`,
          };
        }

        // ── Cash reserve gate ──────────────────────────────────────
        if (airline.cash < cost + CASH_RESERVE_AFTER_BUY) {
          return {
            error: `You'll need ${fmtCash(cost)} for the hub, plus ${fmtCash(CASH_RESERVE_AFTER_BUY)} kept in reserve.`,
          };
        }
      }

      const newDemands = demandDraftsForHub({
        hub: airport,
        airports,
        ownedPlanes,
        gameDay: airline.day,
        hubLevel: 1,
      });
      if (newDemands.length === 0) {
        return {
          error:
            "No reachable destinations are available from this airport with your current fleet.",
        };
      }

      const tempHubId = `temp-${Date.now()}`;
      const previousLedger = store().ledger;
      let createdHubId: string | null = null;
      let createdDemandIds: string[] = [];
      spendCash(cost);
      addHub({
        id: tempHubId,
        airport,
        tier: 1,
        trust: 20,
        hub_pax: 0,
        trust_floor: 0,
      });
      addLedgerEntries([
        {
          id: `led-${Date.now()}`,
          day: airline.day,
          type: "purchase",
          label: `Hub: ${airport.iata}`,
          amount: -cost,
          route_id: null,
        },
      ]);

      try {
        const { data: hubData, error: hubErr } = await supabase
          .from("hubs")
          .insert({
            airline_id: airline.id,
            iata: airport.iata,
            tier: 1,
            trust: 20,
            hub_pax: 0,
            trust_floor: 0,
          })
          .select()
          .single();

        if (hubErr) throw new Error(hubErr.message);
        createdHubId = hubData.id;

        const { updateHub } = store();
        updateHub(tempHubId, { id: hubData.id });

        const insertedDemands = await insertDemandDrafts({
          airlineId: airline.id,
          hubIata: airport.iata,
          drafts: newDemands,
        });
        createdDemandIds = insertedDemands.map((demand) => demand.id);
        addDemands(insertedDemands);

        const { error: cashError } = await supabase
          .from("airlines")
          .update({ cash: store().airline?.cash })
          .eq("id", airline.id);
        if (cashError) throw new Error(cashError.message);

        return { error: null };
      } catch (err) {
        if (createdDemandIds.length > 0) {
          await supabase.from("demands").delete().in("id", createdDemandIds);
        }
        if (createdHubId) {
          await supabase.from("hubs").delete().eq("id", createdHubId);
        }

        const { setHubs, setDemands, setLedger } = store();
        setHubs(
          store().hubs.filter(
            (h) => h.id !== tempHubId && h.id !== createdHubId,
          ),
        );
        if (createdDemandIds.length > 0) {
          setDemands(
            store().demands.filter((d) => !createdDemandIds.includes(d.id)),
          );
        }
        setLedger(previousLedger);
        spendCash(-cost);
        return {
          error:
            err instanceof Error
              ? err.message
              : "Something went wrong opening this hub. Please try again.",
        };
      }
    },
    [store],
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

      if (!airline)
        return {
          error: "Something went wrong. Try restarting the app.",
          refund: 0,
        };

      const hub = hubs.find((h) => h.id === hubId);
      if (!hub) return { error: "Couldn't find this hub.", refund: 0 };

      const refund = Math.round(hubPurchaseCost(hub.airport) * 0.5);

      const hubDemands = demands.filter((d) => d.hub_iata === hub.airport.iata);
      const demandIds = hubDemands.map((d) => d.id);
      const hubRoutes = routes.filter((r) => r.hub_iata === hub.airport.iata);
      const routeIds = hubRoutes.map((r) => r.id);

      const assignedPlaneIds = new Set(hubRoutes.map((r) => r.plane.id));

      try {
        if (routeIds.length > 0) {
          const { error: routeError } = await supabase
            .from("routes")
            .update({ active: false })
            .in("id", routeIds);
          if (routeError) throw new Error(routeError.message);

          const { error: planeError } = await supabase
            .from("owned_planes")
            .update({ route_id: null })
            .in("id", [...assignedPlaneIds]);
          if (planeError) throw new Error(planeError.message);
        }

        if (demandIds.length > 0) {
          const { error: demandError } = await supabase
            .from("demands")
            .delete()
            .in("id", demandIds);
          if (demandError) throw new Error(demandError.message);
        }

        const { error: hubError } = await supabase
          .from("hubs")
          .delete()
          .eq("id", hubId);
        if (hubError) throw new Error(hubError.message);

        const { error: cashError } = await supabase
          .from("airlines")
          .update({ cash: airline.cash + refund })
          .eq("id", airline.id);
        if (cashError) throw new Error(cashError.message);

        earnCash(refund);
        setHubs(hubs.filter((h) => h.id !== hubId));
        setDemands(demands.filter((d) => !demandIds.includes(d.id)));
        setRoutes(routes.filter((r) => !routeIds.includes(r.id)));
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
            label: `Sold hub: ${hub.airport.iata}`,
            amount: refund,
            route_id: null,
          },
        ]);

        return { error: null, refund };
      } catch (err) {
        return {
          error:
            err instanceof Error
              ? err.message
              : "Something went wrong selling this hub. Please try again.",
          refund: 0,
        };
      }
    },
    [store],
  );
}

// ─────────────────────────────────────────────────────────────────
// UPGRADE HUB
// Advances a hub by one tier. Costs scale with tier.
// Resets days_owned to 0, sets trust_floor to the new tier's value.
// ─────────────────────────────────────────────────────────────────

export const HUB_UPGRADE_COSTS: Record<number, number> = {
  1: 150_000, // T1 → T2
  2: 350_000, // T2 → T3
  3: 700_000, // T3 → T4
  4: 1_400_000, // T4 → T5
  5: 2_500_000, // T5 → T6
};

export function useUpgradeHub() {
  const store = useGameStore.getState;

  return useCallback(
    async (hubId: string): Promise<{ error: string | null }> => {
      const { airline, hubs, updateHub, spendCash, addLedgerEntries } = store();

      if (!airline)
        return { error: "Something went wrong. Try restarting the app." };

      const hub = hubs.find((h) => h.id === hubId);
      if (!hub) return { error: "Couldn't find this hub." };

      const currentTier = hub.tier as number;
      if (currentTier >= 6)
        return { error: "This hub is already at the highest tier!" };

      const cfg = HUB_TIER_CONFIG[currentTier];
      if (!cfg)
        return { error: "Something went wrong. Try restarting the app." };

      // Eligibility checks
      if (hub.trust < cfg.upgradeTrust) {
        return {
          error: `Your passengers don't trust this hub enough yet. Reach ${cfg.upgradeTrust}% trust to upgrade.`,
        };
      }
      if ((hub.hub_pax ?? 0) < cfg.upgradePax) {
        const remaining = cfg.upgradePax - (hub.hub_pax ?? 0);
        return {
          error: `Keep flying! You need ${remaining.toLocaleString()} more passengers through this hub before it's ready to grow.`,
        };
      }

      const cost = HUB_UPGRADE_COSTS[currentTier] ?? 500_000;
      if (airline.cash < cost) {
        const shortfall = cost - airline.cash;
        return {
          error: `You're ${fmtCash(shortfall)} short. Keep earning and come back!`,
        };
      }

      const nextTier = (currentTier + 1) as HubTier;
      const nextFloor = HUB_TIER_CONFIG[nextTier]?.trustFloor ?? 0;
      const previousLedger = store().ledger;

      // Optimistic update
      spendCash(cost);
      updateHub(hubId, {
        tier: nextTier,
        trust_floor: nextFloor,
        trust: Math.max(hub.trust, nextFloor),
      });
      addLedgerEntries([
        {
          id: `led-upgrade-hub-${Date.now()}`,
          day: airline.day,
          type: "purchase",
          label: `Hub upgrade: ${hub.airport.iata} T${currentTier} to T${nextTier}`,
          amount: -cost,
          route_id: null,
        },
      ]);

      try {
        const { error: dbErr } = await supabase
          .from("hubs")
          .update({
            tier: nextTier,
            trust_floor: nextFloor,
            trust: Math.max(hub.trust, nextFloor),
          })
          .eq("id", hubId);

        if (dbErr) throw new Error(dbErr.message);

        const { error: cashError } = await supabase
          .from("airlines")
          .update({ cash: store().airline?.cash })
          .eq("id", airline.id);
        if (cashError) throw new Error(cashError.message);

        return { error: null };
      } catch (err) {
        await supabase
          .from("hubs")
          .update({
            tier: currentTier,
            trust_floor: hub.trust_floor,
            trust: hub.trust,
            hub_pax: hub.hub_pax,
          })
          .eq("id", hubId);

        // Rollback
        updateHub(hubId, {
          tier: currentTier as HubTier,
          trust_floor: hub.trust_floor,
          hub_pax: hub.hub_pax,
          trust: hub.trust,
        });
        store().setLedger(previousLedger);
        spendCash(-cost);
        return {
          error:
            err instanceof Error
              ? err.message
              : "Something went wrong upgrading this hub. Please try again.",
        };
      }
    },
    [store],
  );
}

// ─────────────────────────────────────────────────────────────────
// UPDATE HUB NICKNAME
// ─────────────────────────────────────────────────────────────────

export function useUpdateHubNickname() {
  const store = useGameStore.getState;

  return useCallback(
    async (
      hubId: string,
      nickname: string,
    ): Promise<{ error: string | null }> => {
      const { hubs, updateHub } = store();

      const hub = hubs.find((h) => h.id === hubId);
      if (!hub) return { error: "Hub not found" };

      const trimmed = nickname.trim().slice(0, 20);

      // Optimistic update
      updateHub(hubId, { nickname: trimmed || undefined });

      const { error } = await supabase
        .from("hubs")
        .update({ nickname: trimmed || null })
        .eq("id", hubId);

      if (error) {
        // Rollback
        updateHub(hubId, { nickname: hub.nickname });
        return { error: error.message };
      }

      return { error: null };
    },
    [store],
  );
}

// ─────────────────────────────────────────────────────────────────
// LEGACY MANUAL REFRESH
// Route opportunities now refresh with the game day and never cost cash.
// ─────────────────────────────────────────────────────────────────

export function useRefreshDemands() {
  return useCallback(
    async (hubIata: string): Promise<{ error: string | null }> => {
      const { airline, hubs } = useGameStore.getState();
      if (!airline) return { error: "No airline found" };
      const hub = hubs.find((h) => h.airport.iata === hubIata);
      if (!hub) return { error: "Hub not found" };
      return {
        error: "Route opportunities update at the start of the next game day.",
      };
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

      // Auto-compute via_pax_ratio and leg distances for connecting routes
      let computedViaPaxRatio = viaPaxRatio;
      let leg1DistNm: number | null = null;
      let leg2DistNm: number | null = null;

      if (viaIata) {
        try {
          const { computeViaPaxRatio } = await import("@/lib/od");
          const viaAirport = airports.find((a) => a.iata === viaIata);
          const destAirport = demand.dest;
          const originAirport = demand.origin;

          if (viaAirport && originAirport) {
            // Haversine distance — accurate for any distance on earth
            const haversine = (
              lat1: number,
              lng1: number,
              lat2: number,
              lng2: number,
            ): number => {
              const R = 3440.065; // Earth radius in nautical miles
              const dLat = ((lat2 - lat1) * Math.PI) / 180;
              const dLng = ((lng2 - lng1) * Math.PI) / 180;
              const a =
                Math.sin(dLat / 2) ** 2 +
                Math.cos((lat1 * Math.PI) / 180) *
                  Math.cos((lat2 * Math.PI) / 180) *
                  Math.sin(dLng / 2) ** 2;
              return Math.round(
                R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)),
              );
            };

            leg1DistNm = haversine(
              originAirport.lat,
              originAirport.lng,
              viaAirport.lat,
              viaAirport.lng,
            );
            leg2DistNm = haversine(
              viaAirport.lat,
              viaAirport.lng,
              destAirport.lat,
              destAirport.lng,
            );

            if (!computedViaPaxRatio) {
              computedViaPaxRatio = computeViaPaxRatio({
                leg1Nm: leg1DistNm,
                leg2Nm: leg2DistNm,
                viaAirport,
                destAirport,
                businessPct: demand.business_pct ?? 0.25,
              });
            }
          }
        } catch {}
      }

      const routeLegs = viaIata
        ? [leg1DistNm, leg2DistNm]
        : [Math.round(demand.dist_nm)];
      if (routeLegs.some((leg) => leg === null)) {
        return { error: "Unable to calculate this route. Try again." };
      }

      const longestLeg = Math.max(...(routeLegs as number[]));
      if (longestLeg > plane.plane_model.range_nm) {
        return {
          error: `${plane.plane_model.nickname} cannot operate this route. Its range is ${plane.plane_model.range_nm.toLocaleString()} nm, but the longest leg is ${longestLeg.toLocaleString()} nm.`,
        };
      }

      const planeBusy =
        Boolean(plane.route_id) ||
        store().routes.some((r) => r.active && r.plane.id === plane.id);

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
        leg1_dist_nm: leg1DistNm,
        leg2_dist_nm: leg2DistNm,
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
            via_pax_ratio: computedViaPaxRatio,
            leg1_dist_nm: leg1DistNm,
            leg2_dist_nm: leg2DistNm,
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
          leg1_dist_nm: leg1DistNm,
          leg2_dist_nm: leg2DistNm,
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
    [store],
  );
}

// ─────────────────────────────────────────────────────────────────
// DAILY TICK WRITE-BACK
// ─────────────────────────────────────────────────────────────────

export function useSaveAirlineDay() {
  const store = useGameStore.getState;

  return useCallback(async () => {
    const initial = store();
    const initialAirline = initial.airline;
    if (!initialAirline) return;

    // Rebuild each persistent market from its stable OD baseline for the new
    // day. Previous load factor, route popularity, and missed passengers must
    // never compound into tomorrow's traveler count.
    initial.demands.forEach((demand) => {
      const todayDemand = simulatePaxDay(
        demand.origin,
        demand.dest,
        demand.dist_nm,
        0,
        initialAirline.day,
      );
      initial.updateDemand(demand.id, {
        base_pax_day: todayDemand,
        pax_ceiling: todayDemand,
        delivered_pax_today: 0,
        ai_stolen_pax: 0,
      });
    });

    // Hub upgrades and dismissed choices may leave open opportunity slots.
    // Refill them now, regardless of whether yesterday's passengers were met.
    const refreshResults = await Promise.all(
      initial.hubs.map((hub) => ensureHubOpportunitySlots(hub.airport.iata)),
    );
    const refreshError = refreshResults.find((result) => result.error)?.error;
    if (refreshError) {
      console.warn("[useSaveAirlineDay] opportunity refresh:", refreshError);
    }

    const {
      airline,
      hubs,
      demands,
      presence,
      earnedAchievements,
      missionsCompleted,
    } = store();
    if (!airline) return;

    try {
      const { error: airlineError } = await supabase
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
      if (airlineError) throw new Error(airlineError.message);

      const hubResults = await Promise.all(
        hubs
          .filter((hub) => !hub.id.startsWith("temp-"))
          .map((hub) =>
            supabase
              .from("hubs")
              .update({
                trust: Math.round(hub.trust * 10) / 10,
                hub_pax: hub.hub_pax ?? 0,
                trust_floor: hub.trust_floor ?? 0,
                nickname: hub.nickname ?? null,
              })
              .eq("id", hub.id),
          ),
      );
      const hubError = hubResults.find((result) => result.error)?.error;
      if (hubError) throw new Error(hubError.message);

      const demandResults = await Promise.all(
        demands
          .filter(
            (demand) =>
              !demand.id.startsWith("temp-") &&
              !demand.id.startsWith("custom-demand-"),
          )
          .map((demand) =>
            supabase
              .from("demands")
              .update({
                popularity: demand.popularity,
                status: demand.status,
                delivered_pax_today: demand.delivered_pax_today,
                ai_stolen_pax: demand.ai_stolen_pax ?? 0,
                base_pax_day: demand.base_pax_day,
                pax_ceiling: demand.pax_ceiling,
              })
              .eq("id", demand.id),
          ),
      );
      const demandError = demandResults.find((result) => result.error)?.error;
      if (demandError) throw new Error(demandError.message);

      const savedPresence = presence.filter(
        (row) => !row.id.startsWith("presence-"),
      );
      if (savedPresence.length > 0) {
        const { error } = await supabase.from("airport_presence").upsert(
          savedPresence.map((row) => ({
            id: row.id,
            airline_id: airline.id,
            airport_iata: row.airport_iata,
            total_pax_delivered: row.total_pax_delivered,
          })),
          { onConflict: "airline_id,airport_iata" },
        );
        if (error) throw new Error(error.message);
      }

      const newPresence = presence.filter((row) =>
        row.id.startsWith("presence-"),
      );
      if (newPresence.length > 0) {
        const { error } = await supabase.from("airport_presence").upsert(
          newPresence.map((row) => ({
            airline_id: airline.id,
            airport_iata: row.airport_iata,
            total_pax_delivered: row.total_pax_delivered,
          })),
          { onConflict: "airline_id,airport_iata" },
        );
        if (error) throw new Error(error.message);
      }
    } catch (error) {
      console.warn(
        "[useSaveAirlineDay] save failed:",
        error instanceof Error ? error.message : error,
      );
    }
  }, [store]);
}

// ─────────────────────────────────────────────────────────────────
// LOAD PRESENCE — call from game loader after hubs/demands load
// ─────────────────────────────────────────────────────────────────

export function useLoadPresence() {
  const airlineId = useGameStore((s) => s.airline?.id);

  useEffect(() => {
    if (!airlineId) return;

    const load = async () => {
      const { data, error } = await supabase
        .from("airport_presence")
        .select("id, airport_iata, total_pax_delivered")
        .eq("airline_id", airlineId);

      if (error || !data) {
        console.warn(
          "[useLoadPresence] failed to load presence:",
          error?.message,
        );
        return;
      }

      useGameStore.getState().setPresence(
        data.map((row) => ({
          id: row.id,
          airport_iata: row.airport_iata,
          total_pax_delivered: row.total_pax_delivered,
        })),
      );
    };

    load();
  }, [airlineId]);
}

// ─────────────────────────────────────────────────────────────────
// REFILL MISSING OPPORTUNITY SLOTS FOR THE NEW DAY
// ─────────────────────────────────────────────────────────────────

export function useSpawnDailyDemand() {
  return useCallback(async (hubIata: string) => {
    await ensureHubOpportunitySlots(hubIata);
  }, []);
}

// ─────────────────────────────────────────────────────────────────
// PLANE MAINTENANCE
// ─────────────────────────────────────────────────────────────────

export function useMaintenancePlane() {
  const store = useGameStore.getState;

  return useCallback(
    async (planeId: string): Promise<{ error: string | null }> => {
      const {
        airline,
        ownedPlanes,
        updateOwnedPlane,
        spendCash,
        addLedgerEntries,
      } = store();
      if (!airline) return { error: "No airline found" };

      const plane = ownedPlanes.find((p) => p.id === planeId);
      if (!plane) return { error: "Plane not found" };

      // Cost: $5K base + $50 per seat — affordable but meaningful
      const cost = Math.round(5_000 + plane.plane_model.pax_capacity * 50);
      if (airline.cash < cost) {
        return { error: `Need ${fmtCash(cost)} for maintenance` };
      }

      const previousLedger = store().ledger;
      // Optimistic update
      updateOwnedPlane(planeId, { condition: 100, days_active: 0 });
      spendCash(cost);
      addLedgerEntries([
        {
          id: `maint-${planeId}-${Date.now()}`,
          day: airline.day,
          type: "purchase" as const,
          label: `Maintenance: ${plane.plane_model.nickname}`,
          amount: -cost,
          route_id: null,
        },
      ]);

      try {
        const { error: planeError } = await supabase
          .from("owned_planes")
          .update({ condition: 100, days_active: 0 })
          .eq("id", planeId);
        if (planeError) throw new Error(planeError.message);

        const { error: cashError } = await supabase
          .from("airlines")
          .update({ cash: store().airline?.cash })
          .eq("id", airline.id);
        if (cashError) throw new Error(cashError.message);

        return { error: null };
      } catch {
        await supabase
          .from("owned_planes")
          .update({
            condition: plane.condition ?? 100,
            days_active: plane.days_active ?? 0,
          })
          .eq("id", planeId);

        // Rollback
        updateOwnedPlane(planeId, {
          condition: plane.condition,
          days_active: plane.days_active,
        });
        store().setLedger(previousLedger);
        spendCash(-cost);
        return { error: "Maintenance failed. Please try again." };
      }
    },
    [store],
  );
}

// ─────────────────────────────────────────────────────────────────
// BUY PLANE
// ─────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────
// SELL PLANE
// ─────────────────────────────────────────────────────────────────

export function useSellPlane() {
  const store = useGameStore.getState;

  return useCallback(
    async (planeId: string): Promise<{ error: string | null }> => {
      const {
        airline,
        ownedPlanes,
        setOwnedPlanes,
        earnCash,
        addLedgerEntries,
        setSelectedPlaneGroup,
        selectedPlaneGroup,
      } = store();
      if (!airline) return { error: "No airline found" };

      const plane = ownedPlanes.find((p) => p.id === planeId);
      if (!plane) return { error: "Plane not found" };

      // Can only sell idle planes
      if (plane.route_id) return { error: "Unassign the plane before selling" };

      const salePrice = Math.round(plane.plane_model.price * 0.4);

      try {
        const { error: cashError } = await supabase
          .from("airlines")
          .update({ cash: airline.cash + salePrice })
          .eq("id", airline.id);
        if (cashError) throw new Error(cashError.message);

        const { error: planeError } = await supabase
          .from("owned_planes")
          .delete()
          .eq("id", planeId);
        if (planeError) {
          await supabase
            .from("airlines")
            .update({ cash: airline.cash })
            .eq("id", airline.id);
          throw new Error(planeError.message);
        }

        setOwnedPlanes(ownedPlanes.filter((p) => p.id !== planeId));
        if (selectedPlaneGroup) {
          setSelectedPlaneGroup(
            selectedPlaneGroup.planes.filter((p) => p.id !== planeId),
          );
        }
        earnCash(salePrice);
        addLedgerEntries([
          {
            id: `sold-plane-${Date.now()}`,
            day: airline.day,
            type: "revenue" as const,
            label: `Sold ${plane.plane_model.nickname}`,
            amount: salePrice,
            route_id: null,
          },
        ]);

        return { error: null };
      } catch (err) {
        return {
          error:
            err instanceof Error
              ? err.message
              : "Sale failed. Please try again.",
        };
      }
    },
    [store],
  );
}

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
          error: `Open ${remaining} more route${
            remaining > 1 ? "s" : ""
          } to unlock this aircraft`,
        };
      }

      const tempId = `temp-plane-${Date.now()}`;
      const previousLedger = store().ledger;
      const previouslyBoughtPlaneToday = store().boughtPlaneToday;
      let createdPlaneId: string | null = null;
      spendCash(planeModel.price);
      addOwnedPlane({
        id: tempId,
        plane_model: planeModel,
        route_id: null,
        condition: 100,
        days_active: 0,
      });
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
          .insert({
            airline_id: airline.id,
            plane_id: planeModel.id,
            condition: 100,
            days_active: 0,
          })
          .select()
          .single();

        if (error) throw new Error(error.message);
        createdPlaneId = data.id;

        store().setOwnedPlanes(
          store().ownedPlanes.map((p) =>
            p.id === tempId
              ? {
                  ...p,
                  id: data.id,
                  condition: data.condition ?? 100,
                  days_active: data.days_active ?? 0,
                }
              : p,
          ),
        );

        const { error: cashError } = await supabase
          .from("airlines")
          .update({ cash: store().airline?.cash })
          .eq("id", airline.id);
        if (cashError) throw new Error(cashError.message);

        return { error: null };
      } catch (err) {
        if (createdPlaneId) {
          await supabase.from("owned_planes").delete().eq("id", createdPlaneId);
        }
        store().setOwnedPlanes(
          store().ownedPlanes.filter(
            (p) => p.id !== tempId && p.id !== createdPlaneId,
          ),
        );
        store().setLedger(previousLedger);
        store().setBoughtPlaneToday(previouslyBoughtPlaneToday);
        store().spendCash(-planeModel.price);
        return {
          error:
            err instanceof Error ? err.message : "Failed to purchase aircraft",
        };
      }
    },
    [store],
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
    [store],
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
    [store],
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
    [store],
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
      _paxDay: number,
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

      const planeBusy =
        Boolean(plane.route_id) ||
        store().routes.some((r) => r.active && r.plane.id === plane.id);

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
      let leg1DistNmC: number | null = null;
      let leg2DistNmC: number | null = null;

      if (via) {
        // Haversine — proper great-circle distance
        const haversineC = (
          lat1: number,
          lng1: number,
          lat2: number,
          lng2: number,
        ): number => {
          const R = 3440.065;
          const dLat = ((lat2 - lat1) * Math.PI) / 180;
          const dLng = ((lng2 - lng1) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((lat1 * Math.PI) / 180) *
              Math.cos((lat2 * Math.PI) / 180) *
              Math.sin(dLng / 2) ** 2;
          return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
        };

        leg1DistNmC = haversineC(origin.lat, origin.lng, via.lat, via.lng);
        leg2DistNmC = haversineC(via.lat, via.lng, dest.lat, dest.lng);

        try {
          const { computeViaPaxRatio } = await import("@/lib/od");
          viaPaxRatio = computeViaPaxRatio({
            leg1Nm: leg1DistNmC,
            leg2Nm: leg2DistNmC,
            viaAirport: via,
            destAirport: dest,
            businessPct: 0.25,
          });
        } catch {}
      }

      const routeLegs = via ? [leg1DistNmC, leg2DistNmC] : [Math.round(distNm)];
      if (routeLegs.some((leg) => leg === null)) {
        return { error: "Unable to calculate this route. Try again." };
      }

      const longestLeg = Math.max(...(routeLegs as number[]));
      if (longestLeg > plane.plane_model.range_nm) {
        return {
          error: `${plane.plane_model.nickname} cannot operate this route. Its range is ${plane.plane_model.range_nm.toLocaleString()} nm, but the longest leg is ${longestLeg.toLocaleString()} nm.`,
        };
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
          leg1_dist_nm: leg1DistNmC,
          leg2_dist_nm: leg2DistNmC,
          active: true,
          price_strategy: "standard",
        });
      } else {
        const todayDemand = simulatePaxDay(
          origin,
          dest,
          distNm,
          0,
          airline.day,
        );
        const syntheticDemand: Demand = {
          id: tempDemandId,
          airline_id: airline.id,
          hub_iata: origin.iata,
          origin,
          dest,
          dist_nm: distNm,
          haul: haul as Demand["haul"],
          base_pax_day: todayDemand,
          status: "pending",
          delivered_pax_today: 0,
          ai_stolen_pax: 0,
          popularity: 0,
          pax_ceiling: todayDemand,
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
          leg1_dist_nm: leg1DistNmC,
          leg2_dist_nm: leg2DistNmC,
          active: true,
          price_strategy: "standard",
        });

        demandToUse = syntheticDemand;
      }

      try {
        let demandId: string;

        if (existingDemand) {
          demandId = existingDemand.id;

          await supabase
            .from("demands")
            .update({ status: "pending" })
            .eq("id", existingDemand.id);
        } else {
          const todayDemand = demandToUse.base_pax_day;
          const { data: demandData, error: demandErr } = await supabase
            .from("demands")
            .insert({
              airline_id: airline.id,
              hub_iata: origin.iata,
              origin_iata: origin.iata,
              dest_iata: dest.iata,
              dist_nm: distNm,
              haul,
              base_pax_day: todayDemand,
              pax_ceiling: todayDemand,
              status: "pending",
              source: "custom",
              delivered_pax_today: 0,
              ai_stolen_pax: 0,
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
            via_pax_ratio: viaPaxRatio,
            leg1_dist_nm: leg1DistNmC,
            leg2_dist_nm: leg2DistNmC,
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
          leg1_dist_nm: leg1DistNmC,
          leg2_dist_nm: leg2DistNmC,
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
    [store],
  );
}

export function useLoadChoiceEventState() {
  const airlineId = useGameStore((s) => s.airline?.id);

  useEffect(() => {
    if (!airlineId) return;

    const load = async () => {
      const { data, error } = await supabase
        .from("airlines")
        .select("choice_event_ids, active_choice_consequence")
        .eq("id", airlineId)
        .single();

      if (error || !data) {
        console.warn(
          "[useLoadChoiceEventState] failed to load:",
          error?.message,
        );
        return;
      }

      const store = useGameStore.getState();

      // ── resolvedChoiceEventIds ───────────────────────────────
      // Stored as a JSON array string e.g. '["pilot_overtime","storm_decision"]'
      if (data.choice_event_ids) {
        try {
          const ids = JSON.parse(data.choice_event_ids);
          if (Array.isArray(ids)) {
            store.setResolvedChoiceEventIds(ids);
          }
        } catch {
          // Malformed JSON — start fresh, non-critical
        }
      }

      // ── activeChoiceConsequence ──────────────────────────────
      // Stored as a JSON object string or null
      if (data.active_choice_consequence) {
        try {
          const consequence: ResolvedChoice = JSON.parse(
            data.active_choice_consequence,
          );
          const currentDay = store.airline?.day ?? 1;

          // Only restore if the consequence hasn't already expired.
          // If revenueMultiplierEndsDay has passed, discard it — don't
          // silently apply a stale penalty/bonus the player forgot about.
          const isStillActive =
            !consequence.revenueMultiplierEndsDay ||
            currentDay < consequence.revenueMultiplierEndsDay;

          if (isStillActive) {
            store.setActiveChoiceConsequence(consequence);
          } else {
            // Expired — clear it from DB too so it doesn't come back
            await supabase
              .from("airlines")
              .update({ active_choice_consequence: null })
              .eq("id", airlineId);
          }
        } catch {
          // Malformed JSON — discard, non-critical
        }
      }
    };

    load();
  }, [airlineId]);
}

// ─────────────────────────────────────────────────────────────────
// SAVE — persists both fields to Supabase
// Returns a stable callback so callers can await it
// ─────────────────────────────────────────────────────────────────

export function useSaveChoiceEventState() {
  return useCallback(async () => {
    const store = useGameStore.getState();
    const airlineId = store.airline?.id;
    if (!airlineId) return;

    const resolvedIds = store.resolvedChoiceEventIds ?? [];
    const consequence = store.activeChoiceConsequence;

    // Check if consequence is still valid before saving
    const currentDay = store.airline?.day ?? 1;
    const consequenceToSave =
      consequence &&
      (!consequence.revenueMultiplierEndsDay ||
        currentDay < consequence.revenueMultiplierEndsDay)
        ? consequence
        : null;

    const { error } = await supabase
      .from("airlines")
      .update({
        choice_event_ids: JSON.stringify(resolvedIds),
        active_choice_consequence: consequenceToSave
          ? JSON.stringify(consequenceToSave)
          : null,
      })
      .eq("id", airlineId);

    if (error) {
      console.warn("[useSaveChoiceEventState] failed to save:", error.message);
    }
  }, []);
}

// ─────────────────────────────────────────────────────────────────
// AUTO-SAVE — subscribes to store changes and saves automatically
// Mount this once at the game screen level alongside other loaders.
// Fires whenever resolvedChoiceEventIds or activeChoiceConsequence change.
// ─────────────────────────────────────────────────────────────────

export function useAutoSaveChoiceEventState() {
  const save = useSaveChoiceEventState();

  useEffect(() => {
    // Subscribe to resolvedChoiceEventIds changes
    const unsubIds = useGameStore.subscribe(
      (s) => s.resolvedChoiceEventIds,
      () => {
        save();
      },
    );

    // Subscribe to activeChoiceConsequence changes
    const unsubConsequence = useGameStore.subscribe(
      (s) => s.activeChoiceConsequence,
      () => {
        save();
      },
    );

    return () => {
      unsubIds();
      unsubConsequence();
    };
  }, [save]);
}
