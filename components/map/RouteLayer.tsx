/**
 * components/map/RouteLayer.tsx
 *
 * Route arcs + animated plane icons that follow the arc curve.
 *
 * Arc: great-circle interpolation (curved, like a real flight path)
 * Plane: a GeoJSON Point that advances along the arc points each frame.
 *        Bearing is computed from current→next point so the icon
 *        rotates to face the direction of travel.
 *
 * Connecting routes: two legs chained into one sequence.
 * Each route has its own phase offset so planes don't all
 * move in sync — staggered based on route index.
 *
 * Animation is real-time (not game-clock) — planes move at a
 * fixed pace regardless of game speed so the map always feels alive.
 */

import type { Airport, Route } from "@/store";
import { useGameStore, useRoutes } from "@/store";
import MapboxGL from "@rnmapbox/maps";
import { useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────

const ARC_STEPS = 40; // points along each arc leg
const ANIM_INTERVAL_MS = 60; // ~16fps update rate
const LEG_DURATION_MS = 9000; // time to fly one leg (real time)

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
    // Arc height scales with longitudinal span — short routes stay flatter
    const span = Math.abs(lng2 - lng1);
    const arc = Math.sin(t * Math.PI) * span * 0.12;
    pts.push([lng, lat + arc]);
  }
  return pts;
}

/** Bearing in degrees from pointA → pointB (for icon-rotate) */
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

// ─────────────────────────────────────────────────────────────────
// BUILD FULL POINT SEQUENCE FOR A ROUTE
// Chains legs for connecting routes into one sequence
// ─────────────────────────────────────────────────────────────────

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
    // Remove duplicate mid-point
    return [...leg1, ...leg2.slice(1)];
  }

  return greatCircleArc(
    route.demand.origin.lng,
    route.demand.origin.lat,
    route.demand.dest.lng,
    route.demand.dest.lat,
  );
}

// ─────────────────────────────────────────────────────────────────
// PLANE POSITION STATE
// ─────────────────────────────────────────────────────────────────

interface PlaneState {
  routeId: string;
  lng: number;
  lat: number;
  rotation: number;
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
  const phaseRef = useRef<Record<string, number>>({});
  // Track which "half" of the cycle each plane was on last tick
  // to detect arrivals (crossing raw=1 = outbound arrival at dest)
  const lastRawRef = useRef<Record<string, number>>({});

  const active = routes.filter((r) => r.active);

  // ── Animation loop ───────────────────────────────────────────
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
      const { addPaxDelivered } = useGameStore.getState();

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

        // ── Arrival detection ────────────────────────────────────
        // Only credit pax on OUTBOUND arrival (raw crosses 1.0 going up).
        // NOT on return — avoids double-counting pax per round trip.
        const lastRaw = lastRawRef.current[r.id];
        if (lastRaw !== undefined) {
          const justArrivedAtDest = lastRaw < 1 && raw >= 1;

          if (justArrivedAtDest) {
            const distNm = r.total_dist_nm ?? r.demand.dist_nm;
            const flightH = distNm / r.plane.plane_model.speed_kts;
            const flights = Math.max(1, Math.floor(24 / (flightH * 2)));
            const paxPerFlight = Math.round(
              (r.demand.pax_day / flights) * (0.65 + Math.random() * 0.35),
            );
            const actualPax = Math.max(1, paxPerFlight);
            addPaxDelivered(r.demand.id, actualPax);

            // Credit revenue LIVE so cash ticks up as planes land
            // yieldPerPax from revenue lib based on haul
            const yieldTable: Record<string, number> = {
              short: 120,
              medium: 280,
              long: 550,
            };
            const ypp = yieldTable[r.demand.haul] ?? 120;
            const liveRev = Math.round(actualPax * ypp);
            const { earnCash } = useGameStore.getState();
            earnCash(liveRev);
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

  if (active.length === 0) return null;

  // ── Build GeoJSON ─────────────────────────────────────────────
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

  // Plane GeoJSON — one Point per active route
  const planeGeoJSON: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: planes.map((p) => ({
      type: "Feature",
      id: `plane-${p.routeId}`,
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: { rotation: p.rotation },
    })),
  };

  return (
    <>
      {/* ── Route arcs ── */}
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

      {/* ── Animated planes ── */}
      {planes.length > 0 && (
        <MapboxGL.ShapeSource id="planes-source" shape={planeGeoJSON}>
          {/* Glow halo behind the plane */}
          <MapboxGL.CircleLayer
            id="plane-glow"
            existing={false}
            style={{
              circleRadius: [
                "interpolate",
                ["linear"],
                ["zoom"],
                1,
                6,
                5,
                10,
                10,
                16,
              ],
              circleColor: airlineColor,
              circleOpacity: 0.25,
              circleBlur: 1.5,
              circlePitchAlignment: "map",
            }}
          />
          {/* Plane body — solid coloured circle */}
          <MapboxGL.CircleLayer
            id="plane-body"
            existing={false}
            style={{
              circleRadius: [
                "interpolate",
                ["linear"],
                ["zoom"],
                1,
                4,
                5,
                7,
                10,
                11,
              ],
              circleColor: airlineColor,
              circleStrokeColor: "#ffffff",
              circleStrokeWidth: 1.5,
              circleStrokeOpacity: 0.9,
              circlePitchAlignment: "map",
            }}
          />
          {/* Plane icon on top — larger size */}
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

      {/* ── Via stop dots ── */}
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
