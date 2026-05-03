/**
 * components/map/RouteLayer.tsx
 *
 * Route arcs + animated plane icons.
 *
 * Multi-plane safe:
 * - Multiple active routes can share the same demand_id.
 * - Each plane can still animate independently.
 * - Passenger delivery is capped against the live demand in store.
 * - Revenue uses calcInstantDeliveryReward instead of old inline formula.
 */

import { computePlayerMarketShare } from "@/lib/AIAirline";
import { boardPassengers } from "@/lib/passengerFlow";
import { calcInstantDeliveryReward } from "@/lib/revenue";
import type { Airport, Route } from "@/store";
import { useDayProgress, useGameStore, useRoutes } from "@/store";
import MapboxGL from "@rnmapbox/maps";
import { useEffect, useMemo, useRef, useState } from "react";

const ARC_STEPS = 40;
const ANIM_INTERVAL_MS = 60;
const LEG_DURATION_MS = 9000;

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
    ? airports.find((airport) => airport.iata === route.via_iata)
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
  const dayProgress = useDayProgress();
  const updateDemand = useGameStore((s) => s.updateDemand);

  const [planes, setPlanes] = useState<PlaneState[]>([]);
  const [revPops, setRevPops] = useState<RevenuePop[]>([]);

  const phaseRef = useRef<Record<string, number>>({});
  const lastRawRef = useRef<Record<string, number>>({});

  const active = useMemo(
    () => routes.filter((route) => route.active),
    [routes],
  );

  useEffect(() => {
    if (active.length === 0) {
      setPlanes([]);
      return;
    }

    const routePoints: Record<string, [number, number][]> = {};

    active.forEach((route, index) => {
      routePoints[route.id] = buildRoutePoints(route, airports);

      if (phaseRef.current[route.id] === undefined) {
        phaseRef.current[route.id] = index / Math.max(1, active.length);
      }
    });

    const tick = () => {
      if (paused) return;

      const now = Date.now();
      const scaledMs = LEG_DURATION_MS / Math.max(1, speed);

      const { demands, hubs, addPaxDelivered, earnCash } =
        useGameStore.getState();

      const newPlanes: PlaneState[] = active.map((route) => {
        const pts = routePoints[route.id];

        if (!pts || pts.length < 2) {
          return {
            routeId: route.id,
            lng: route.demand.origin.lng,
            lat: route.demand.origin.lat,
            rotation: 0,
          };
        }

        const total = pts.length - 1;
        const phase = phaseRef.current[route.id] ?? 0;

        const raw = (now / scaledMs + phase) % 2;
        const outbound = raw <= 1;
        const progress = outbound ? raw : 2 - raw;

        const idx = Math.floor(progress * total);
        const safeIdx = Math.max(0, Math.min(total - 1, idx));
        const nextIdx = outbound
          ? Math.min(total, safeIdx + 1)
          : Math.max(0, safeIdx - 1);

        const [lng, lat] = pts[safeIdx];
        const rotation = bearing(
          pts[safeIdx],
          pts[Math.max(0, Math.min(total, nextIdx))],
        );

        const lastRaw = lastRawRef.current[route.id];

        if (lastRaw !== undefined) {
          const justArrivedAtDest = lastRaw < 1 && raw >= 1;

          if (justArrivedAtDest) {
            const liveDemand =
              demands.find((demand) => demand.id === route.demand.id) ??
              route.demand;

            const delieveredPax = boardPassengers({
              demand: liveDemand,
              planeCapacity: route.plane.plane_model.pax_capacity,
              dayProgress,
              loadFactorMin: 0.65,
              loadFactorMax: 1,
            });

            const aiAirlines = useGameStore.getState().aiAirlines;

            if (delieveredPax > 0) {
              const hub = hubs.find((h) => h.airport.iata === route.hub_iata);

              const share = computePlayerMarketShare(
                hub?.trust ?? 0,
                aiAirlines,
                liveDemand.dest.iata,
              );

              const effective = Math.floor(delieveredPax * share);
              const lost = delieveredPax - effective;

              if (effective > 0) {
                addPaxDelivered(liveDemand.id, effective, lost);
              }

              if (lost > 0) {
                updateDemand(liveDemand.id, {
                  ai_stolen_pax: (liveDemand.ai_stolen_pax ?? 0) + lost,
                });
              }

              const reward = calcInstantDeliveryReward({
                distNm: route.total_dist_nm ?? liveDemand.dist_nm,
                trustPct: hub?.trust ?? 0,
                deliveredPax: effective,
              });

              earnCash(reward);

              const popId = `pop-${route.id}-${Date.now()}`;

              setRevPops((prev) => [
                ...prev,
                {
                  id: popId,
                  lng: liveDemand.dest.lng,
                  lat: liveDemand.dest.lat,
                  amount: reward,
                  opacity: 1,
                  offsetY: 0,
                },
              ]);

              let frame = 0;
              const totalFrames = 45;

              const fadeInterval = setInterval(() => {
                frame++;
                const t = frame / totalFrames;

                if (t >= 1) {
                  clearInterval(fadeInterval);
                  setRevPops((prev) => prev.filter((pop) => pop.id !== popId));
                  return;
                }

                setRevPops((prev) =>
                  prev.map((pop) =>
                    pop.id === popId
                      ? {
                          ...pop,
                          opacity: 1 - t,
                          offsetY: t * 40,
                        }
                      : pop,
                  ),
                );
              }, 33);
            }
          }
        }

        lastRawRef.current[route.id] = raw;

        return {
          routeId: route.id,
          lng,
          lat,
          rotation,
        };
      });

      setPlanes(newPlanes);
    };

    const id = setInterval(tick, ANIM_INTERVAL_MS);
    return () => clearInterval(id);
  }, [active, airports, dayProgress, speed, paused]);

  if (active.length === 0) return null;

  const lineFeatures: GeoJSON.Feature[] = [];
  const viaPoints: GeoJSON.Feature[] = [];

  active.forEach((route) => {
    const via = route.via_iata
      ? airports.find((airport) => airport.iata === route.via_iata)
      : null;

    if (via) {
      lineFeatures.push({
        type: "Feature",
        id: `${route.id}-leg1`,
        geometry: {
          type: "LineString",
          coordinates: greatCircleArc(
            route.demand.origin.lng,
            route.demand.origin.lat,
            via.lng,
            via.lat,
          ),
        },
        properties: { routeId: route.id },
      });

      lineFeatures.push({
        type: "Feature",
        id: `${route.id}-leg2`,
        geometry: {
          type: "LineString",
          coordinates: greatCircleArc(
            via.lng,
            via.lat,
            route.demand.dest.lng,
            route.demand.dest.lat,
          ),
        },
        properties: { routeId: route.id },
      });

      viaPoints.push({
        type: "Feature",
        id: `${route.id}-via`,
        geometry: {
          type: "Point",
          coordinates: [via.lng, via.lat],
        },
        properties: {
          iata: via.iata,
        },
      });
    } else {
      lineFeatures.push({
        type: "Feature",
        id: route.id,
        geometry: {
          type: "LineString",
          coordinates: greatCircleArc(
            route.demand.origin.lng,
            route.demand.origin.lat,
            route.demand.dest.lng,
            route.demand.dest.lat,
          ),
        },
        properties: {
          routeId: route.id,
        },
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
    features: planes.map((plane) => ({
      type: "Feature",
      id: `plane-${plane.routeId}`,
      geometry: {
        type: "Point",
        coordinates: [plane.lng, plane.lat],
      },
      properties: {
        rotation: plane.rotation,
      },
    })),
  };

  return (
    <>
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

      {revPops.length > 0 &&
        (() => {
          const popsGeoJSON: GeoJSON.FeatureCollection = {
            type: "FeatureCollection",
            features: revPops.map((pop) => ({
              type: "Feature",
              id: pop.id,
              geometry: {
                type: "Point",
                coordinates: [pop.lng, pop.lat],
              },
              properties: {
                label:
                  pop.amount >= 0
                    ? `+${
                        pop.amount >= 1000
                          ? `$${Math.round(pop.amount / 1000)}K`
                          : `$${pop.amount}`
                      }`
                    : `-${
                        Math.abs(pop.amount) >= 1000
                          ? `$${Math.round(Math.abs(pop.amount) / 1000)}K`
                          : `$${Math.abs(pop.amount)}`
                      }`,
                opacity: pop.opacity,
                offsetY: -pop.offsetY,
                color: pop.amount >= 0 ? "#22c55e" : "#ef4444",
              },
            })),
          };

          return (
            <MapboxGL.ShapeSource id="revenue-pops-source" shape={popsGeoJSON}>
              <MapboxGL.SymbolLayer
                id="revenue-pops-layer"
                existing={false}
                style={{
                  textField: ["get", "label"],
                  textSize: 13,
                  textColor: ["get", "color"],
                  textHaloColor: "rgba(0,0,0,0.7)",
                  textHaloWidth: 1.5,
                  textOpacity: ["get", "opacity"],
                  textOffset: [0, 1.2],
                  textAnchor: "bottom",
                  textFont: ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
                  symbolSortKey: 1,
                  textAllowOverlap: true,
                  textIgnorePlacement: true,
                }}
              />
            </MapboxGL.ShapeSource>
          );
        })()}

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
