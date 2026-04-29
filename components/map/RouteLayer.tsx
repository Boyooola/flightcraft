/**
 * components/map/RouteLayer.tsx
 *
 * Route arcs + animated planes + revenue pops.
 *
 * Revenue uses calcRouteRevenue() from lib/revenue.ts — same
 * function used by useRevenueTick, RoutesSheet, TopHUD.
 * No inline math here.
 *
 * Pax delivery: only on OUTBOUND arrival (raw crosses 1.0).
 * Pax capped at pax_day — never over-delivers.
 * Revenue pop: green (+) for profit, red (-) for loss.
 */

import { gameSounds } from "@/hooks/useGameSounds";
import { calcRouteRevenue } from "@/lib/revenue";
import type { Airport, Route } from "@/store";
import { useGameStore, useRoutes } from "@/store";
import MapboxGL from "@rnmapbox/maps";
import { useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────

const ARC_STEPS = 40;
const ANIM_INTERVAL_MS = 60;
const LEG_DURATION_MS = 9_000;
const POP_DURATION_MS = 1_500;
const POP_FRAMES = Math.ceil(POP_DURATION_MS / 33);

// ─────────────────────────────────────────────────────────────────
// GEOMETRY
// ─────────────────────────────────────────────────────────────────

function greatCircleArc(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number,
  steps = ARC_STEPS,
): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lng = lng1 + (lng2 - lng1) * t;
    const lat = lat1 + (lat2 - lat1) * t;
    const span = Math.abs(lng2 - lng1);
    const arc = Math.sin(t * Math.PI) * span * 0.12;
    pts.push([lng, lat + arc]);
  }
  return pts;
}

function bearing(
  [lng1, lat1]: [number, number],
  [lng2, lat2]: [number, number],
): number {
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const lat1R = (lat1 * Math.PI) / 180;
  const lat2R = (lat2 * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2R);
  const x =
    Math.cos(lat1R) * Math.sin(lat2R) -
    Math.sin(lat1R) * Math.cos(lat2R) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function buildRoutePoints(
  route: Route,
  airports: Airport[],
): [number, number][] {
  const via = route.via_iata
    ? airports.find((a) => a.iata === route.via_iata)
    : null;
  if (via) {
    const leg1 = greatCircleArc(
      route.demand.origin.lng,
      route.demand.origin.lat,
      via.lng,
      via.lat,
    );
    const leg2 = greatCircleArc(
      via.lng,
      via.lat,
      route.demand.dest.lng,
      route.demand.dest.lat,
    );
    return [...leg1, ...leg2.slice(1)];
  }
  return greatCircleArc(
    route.demand.origin.lng,
    route.demand.origin.lat,
    route.demand.dest.lng,
    route.demand.dest.lat,
  );
}

function fmtPop(amount: number): string {
  const abs = Math.abs(amount);
  const pfx = amount >= 0 ? "+" : "-";
  if (abs >= 1_000_000) return `${pfx}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${pfx}$${Math.round(abs / 1_000)}K`;
  return `${pfx}$${Math.round(abs)}`;
}

// ─────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────

interface PlaneState {
  routeId: string;
  lng: number;
  lat: number;
  rotation: number;
}

interface RevenuePop {
  id: string;
  lng: number;
  lat: number;
  amount: number;
  opacity: number;
  offsetY: number;
}

// ─────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────

export default function RouteLayer({
  airlineColor,
  speed = 1,
  paused = false,
}: {
  airlineColor: string;
  speed?: number;
  paused?: boolean;
}) {
  const routes = useRoutes();
  const airports = useGameStore((s) => s.airports);

  const [planes, setPlanes] = useState<PlaneState[]>([]);
  const [revPops, setRevPops] = useState<RevenuePop[]>([]);

  const phaseRef = useRef<Record<string, number>>({});
  const lastRawRef = useRef<Record<string, number>>({});

  const active = routes.filter((r) => r.active);

  // ── Animation loop ─────────────────────────────────────────────
  useEffect(() => {
    if (active.length === 0) {
      setPlanes([]);
      return;
    }

    const routePoints: Record<string, [number, number][]> = {};
    active.forEach((r, idx) => {
      routePoints[r.id] = buildRoutePoints(r, airports);
      if (phaseRef.current[r.id] === undefined) {
        phaseRef.current[r.id] = idx / active.length;
      }
    });

    const tick = () => {
      if (paused) return;

      const now = Date.now();
      const scaledMs = LEG_DURATION_MS / Math.max(1, speed);
      const store = useGameStore.getState();

      const newPlanes: PlaneState[] = active.map((r) => {
        const pts = routePoints[r.id];
        const total = pts.length - 1;
        const phase = phaseRef.current[r.id] ?? 0;

        const raw = (now / scaledMs + phase) % 2;
        const outbound = raw <= 1;
        const progress = outbound ? raw : 2 - raw;

        const idx = Math.floor(progress * total);
        const safeIdx = Math.max(0, Math.min(total - 1, idx));
        const nextIdx = outbound
          ? Math.min(total, safeIdx + 1)
          : Math.max(0, safeIdx - 1);

        const [lng, lat] = pts[safeIdx];
        const rot = bearing(
          pts[safeIdx],
          pts[Math.max(0, Math.min(total, nextIdx))],
        );

        // ── Outbound arrival at DESTINATION ───────────────────────
        const lastRaw = lastRawRef.current[r.id];
        if (lastRaw !== undefined && lastRaw < 1 && raw >= 1) {
          const demand =
            store.demands.find((d) => d.id === r.demand.id) ?? r.demand;
          const distNm = r.total_dist_nm ?? r.demand.dist_nm;
          const plane = r.plane.plane_model;

          // Pax — never exceed daily quota
          const delivered = demand.delivered_pax_today ?? 0;
          const remaining = Math.max(0, demand.pax_day - delivered);

          if (remaining > 0) {
            const flights = Math.max(
              1,
              Math.floor(24 / ((distNm / plane.speed_kts) * 2)),
            );
            const perFlight = Math.round(
              (demand.pax_day / flights) * (0.65 + Math.random() * 0.35),
            );
            const actualPax = Math.min(remaining, Math.max(1, perFlight));

            store.addPaxDelivered(r.demand.id, actualPax);

            // ── Leg demand credit — real O&D split ────────────────
            // For DOH→AYT→BUD:
            //   leg_pax    = simulatePaxDay(DOH, AYT)   e.g. 120
            //   through_pax = r.demand.pax_day           e.g. 80  (DOH→BUD)
            //   via_ratio  = 120 / (120 + 80) = 0.60
            //   leg passengers = actualPax × 0.60
            //
            // This mirrors real O&D modelling: passengers split between
            // those deplaning at the via stop vs continuing to final dest.
            if (r.via_iata) {
              const legDemand = store.demands.find(
                (d) =>
                  d.origin.iata === r.demand.origin.iata &&
                  d.dest.iata === r.via_iata,
              );
              if (legDemand) {
                const legRemaining = Math.max(
                  0,
                  legDemand.pax_day - (legDemand.delivered_pax_today ?? 0),
                );
                if (legRemaining > 0) {
                  // Use stored O&D ratio (computed at route creation from gravity model)
                  // Falls back to leg_pax / (leg_pax + through_pax) if not stored
                  const viaRatio =
                    r.via_pax_ratio ??
                    legDemand.pax_day /
                      Math.max(1, legDemand.pax_day + demand.pax_day);
                  const legPax = Math.min(
                    legRemaining,
                    Math.round(actualPax * viaRatio),
                  );
                  if (legPax > 0) store.addPaxDelivered(legDemand.id, legPax);
                }
              }
            }

            // Revenue — use shared calcRouteRevenue (same as all other components)
            const hub = store.hubs.find((h) => h.airport.iata === r.hub_iata);
            const res = calcRouteRevenue({
              distNm,
              speedKts: plane.speed_kts,
              trustPct: hub?.trust ?? 0,
              deliveredPax: actualPax,
              paxDay: demand.pax_day,
              costPerSector: plane.cost_per_sector ?? 500,
              fuelPerNm: plane.fuel_per_nm ?? 2.0,
            });

            store.earnCash(res.net);
            gameSounds.play(
              res.net >= 0 ? "revenuePositive" : "revenueNegative",
            );

            // Revenue pop at destination
            const popId = `pop-${r.id}-${Date.now()}`;
            setRevPops((prev) => [
              ...prev,
              {
                id: popId,
                lng: r.demand.dest.lng,
                lat: r.demand.dest.lat,
                amount: res.net,
                opacity: 1.0,
                offsetY: 0,
              },
            ]);

            // Fade + float over POP_DURATION_MS
            let frame = 0;
            const fadeId = setInterval(() => {
              frame++;
              const t = frame / POP_FRAMES;
              if (t >= 1) {
                clearInterval(fadeId);
                setRevPops((prev) => prev.filter((p) => p.id !== popId));
                return;
              }
              setRevPops((prev) =>
                prev.map((p) =>
                  p.id === popId
                    ? { ...p, opacity: 1 - t, offsetY: t * 40 }
                    : p,
                ),
              );
            }, 33);
          }
        }

        lastRawRef.current[r.id] = raw;
        return { routeId: r.id, lng, lat, rotation: rot };
      });

      setPlanes(newPlanes);
    };

    const id = setInterval(tick, ANIM_INTERVAL_MS);
    return () => clearInterval(id);
  }, [active.length, airports, speed, paused]);

  // ── Build GeoJSON ───────────────────────────────────────────────
  const lineFeatures: GeoJSON.Feature[] = [];
  const viaPoints: GeoJSON.Feature[] = [];

  active.forEach((r) => {
    const via = r.via_iata ? airports.find((a) => a.iata === r.via_iata) : null;
    if (via) {
      lineFeatures.push({
        type: "Feature",
        id: `${r.id}-leg1`,
        geometry: {
          type: "LineString",
          coordinates: greatCircleArc(
            r.demand.origin.lng,
            r.demand.origin.lat,
            via.lng,
            via.lat,
          ),
        },
        properties: { routeId: r.id },
      });
      lineFeatures.push({
        type: "Feature",
        id: `${r.id}-leg2`,
        geometry: {
          type: "LineString",
          coordinates: greatCircleArc(
            via.lng,
            via.lat,
            r.demand.dest.lng,
            r.demand.dest.lat,
          ),
        },
        properties: { routeId: r.id },
      });
      viaPoints.push({
        type: "Feature",
        id: `${r.id}-via`,
        geometry: { type: "Point", coordinates: [via.lng, via.lat] },
        properties: { iata: via.iata },
      });
    } else {
      lineFeatures.push({
        type: "Feature",
        id: r.id,
        geometry: {
          type: "LineString",
          coordinates: greatCircleArc(
            r.demand.origin.lng,
            r.demand.origin.lat,
            r.demand.dest.lng,
            r.demand.dest.lat,
          ),
        },
        properties: { routeId: r.id },
      });
    }
  });

  const lineGeoJSON: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: lineFeatures,
  };
  const viaGeoJSON: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: viaPoints,
  };
  const planeGeoJSON: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: planes.map((p) => ({
      type: "Feature",
      id: `plane-${p.routeId}`,
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: { rotation: p.rotation },
    })),
  };
  const popsGeoJSON: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: revPops.map((p) => ({
      type: "Feature",
      id: p.id,
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: {
        label: fmtPop(p.amount),
        opacity: p.opacity,
        offsetY: -p.offsetY,
        color: p.amount >= 0 ? "#22c55e" : "#ef4444",
      },
    })),
  };

  return (
    <>
      {/* Route arcs */}
      <MapboxGL.ShapeSource id="routes-source" shape={lineGeoJSON}>
        <MapboxGL.LineLayer
          id="route-glow"
          style={{
            lineColor: airlineColor,
            lineWidth: ["interpolate", ["linear"], ["zoom"], 1, 3, 6, 7],
            lineOpacity: 0.12,
            lineBlur: 4,
            lineCap: "round",
            lineJoin: "round",
          }}
        />
        <MapboxGL.LineLayer
          id="route-line"
          style={{
            lineColor: airlineColor,
            lineWidth: ["interpolate", ["linear"], ["zoom"], 1, 1, 6, 2.5],
            lineOpacity: 0.8,
            lineDasharray: [2, 3],
            lineCap: "round",
            lineJoin: "round",
          }}
        />
      </MapboxGL.ShapeSource>

      {/* Animated planes */}
      {planes.length > 0 && (
        <MapboxGL.ShapeSource id="planes-source" shape={planeGeoJSON}>
          <MapboxGL.SymbolLayer
            id="plane-icon"
            existing={false}
            style={{
              iconImage: "airport-15",
              iconSize: [
                "interpolate",
                ["linear"],
                ["zoom"],
                1,
                1.2,
                5,
                1.8,
                10,
                2.5,
              ],
              iconColor: "#ffffff",
              iconRotate: ["get", "rotation"],
              iconRotationAlignment: "map",
              iconAllowOverlap: true,
              iconIgnorePlacement: true,
              iconPitchAlignment: "map",
            }}
          />
        </MapboxGL.ShapeSource>
      )}

      {/* Revenue pops */}
      {revPops.length > 0 && (
        <MapboxGL.ShapeSource id="revenue-pops-source" shape={popsGeoJSON}>
          <MapboxGL.SymbolLayer
            id="revenue-pops-layer"
            existing={false}
            style={{
              textField: ["get", "label"],
              textSize: 13,
              textColor: ["get", "color"],
              textHaloColor: "rgba(0,0,0,0.75)",
              textHaloWidth: 1.5,
              textOpacity: ["get", "opacity"],
              textOffset: [0, 1.2],
              textAnchor: "bottom",
              textFont: ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
              textAllowOverlap: true,
              textIgnorePlacement: true,
            }}
          />
        </MapboxGL.ShapeSource>
      )}

      {/* Via stop dots */}
      {viaPoints.length > 0 && (
        <MapboxGL.ShapeSource id="via-stops-source" shape={viaGeoJSON}>
          <MapboxGL.CircleLayer
            id="via-stop-ring"
            existing={false}
            style={{
              circleRadius: [
                "interpolate",
                ["linear"],
                ["zoom"],
                1,
                5,
                5,
                9,
                10,
                14,
              ],
              circleColor: "transparent",
              circleStrokeColor: airlineColor,
              circleStrokeWidth: 1.5,
              circleStrokeOpacity: 0.7,
              circlePitchAlignment: "map",
            }}
          />
          <MapboxGL.CircleLayer
            id="via-stop-dot"
            existing={false}
            style={{
              circleRadius: [
                "interpolate",
                ["linear"],
                ["zoom"],
                1,
                2.5,
                5,
                4.5,
                10,
                7,
              ],
              circleColor: airlineColor,
              circleOpacity: 0.9,
              circlePitchAlignment: "map",
            }}
          />
          <MapboxGL.SymbolLayer
            id="via-stop-label"
            existing={false}
            minZoomLevel={5}
            style={{
              textField: ["get", "iata"],
              textSize: 10,
              textOffset: [0, 1.4],
              textAnchor: "top",
              textColor: airlineColor,
              textOpacity: 0.8,
              textHaloColor: "rgba(4,9,15,0.9)",
              textHaloWidth: 1.5,
              textAllowOverlap: false,
            }}
          />
        </MapboxGL.ShapeSource>
      )}
    </>
  );
}
