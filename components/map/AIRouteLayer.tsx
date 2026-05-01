/**
 * components/map/AIRouteLayer.tsx
 *
 * Renders AI airline routes + animated planes on the map.
 * Lighter than RouteLayer — no pax tracking, no revenue, no sound.
 * All AI routes visible (no cap).
 */

import { buildAIRoutes } from "@/lib/AIAirline";
import type { Airport } from "@/store";
import { useAIAirlines, useAirports, useGameStore } from "@/store";
import MapboxGL from "@rnmapbox/maps";
import { useEffect, useMemo, useState } from "react";

const ANIM_INTERVAL_MS = 80; // lighter than player (60ms)
const LEG_DURATION_MS = 12_000; // slightly slower than player planes

function buildArc(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number,
  steps = 30,
): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lng = lng1 + (lng2 - lng1) * t;
    const lat = lat1 + (lat2 - lat1) * t;
    const arc = Math.sin(t * Math.PI) * Math.abs(lng2 - lng1) * 0.1;
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

interface AIRoute {
  id: string;
  origin: Airport;
  dest: Airport;
  color: string;
  pts: [number, number][];
  phase: number;
}

interface AIPlaneState {
  id: string;
  lng: number;
  lat: number;
  rotation: number;
  color: string;
}

export default function AIRouteLayer() {
  const aiAirlines = useAIAirlines();
  const airports = useAirports();
  const airline = useGameStore((s) => s.airline);
  const speed = airline?.speed ?? 1;

  const [planes, setPlanes] = useState<AIPlaneState[]>([]);

  // Build all AI routes (memoised — only recomputes when AI state changes)
  const allRoutes = useMemo((): AIRoute[] => {
    return aiAirlines.flatMap((ai) => {
      const routes = buildAIRoutes(ai, airports);
      return routes.map((route) => {
        let phHash = 0;
        for (let i = 0; i < route.id.length; i++) {
          phHash = (phHash * 31 + route.id.charCodeAt(i)) % 100_000;
        }
        return {
          ...route,
          pts: buildArc(
            route.origin.lng,
            route.origin.lat,
            route.dest.lng,
            route.dest.lat,
          ),
          phase: phHash / 100_000,
        };
      });
    });
  }, [aiAirlines, airports]);

  // GeoJSON for static arcs
  const arcGeoJSON = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: allRoutes.map((r) => ({
        type: "Feature",
        id: r.id,
        geometry: { type: "LineString", coordinates: r.pts },
        properties: { color: r.color },
      })),
    }),
    [allRoutes],
  );

  // GeoJSON for hub dots
  const hubGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => {
    const seen = new Set<string>();
    const features: GeoJSON.Feature[] = [];
    aiAirlines.forEach((ai) => {
      ai.hubIatas.forEach((iata) => {
        if (seen.has(iata)) return;
        const ap = airports.find((a) => a.iata === iata);
        if (!ap) return;
        seen.add(iata);
        features.push({
          type: "Feature",
          id: `ai-hub-${iata}`,
          geometry: { type: "Point", coordinates: [ap.lng, ap.lat] },
          properties: { color: ai.color, label: ai.name.charAt(0) },
        });
      });
    });
    return { type: "FeatureCollection", features };
  }, [aiAirlines, airports]);

  // Animation loop — lighter interval
  useEffect(() => {
    if (allRoutes.length === 0) {
      setPlanes([]);
      return;
    }

    const tick = () => {
      const now = Date.now();
      const scaledMs = LEG_DURATION_MS / Math.max(1, speed);

      const newPlanes: AIPlaneState[] = allRoutes.map((r) => {
        const total = r.pts.length - 1;
        const raw = (now / scaledMs + r.phase) % 2;
        const outbound = raw <= 1;
        const progress = outbound ? raw : 2 - raw;
        const idx = Math.max(
          0,
          Math.min(total - 1, Math.floor(progress * total)),
        );
        const nextIdx = outbound
          ? Math.min(total, idx + 1)
          : Math.max(0, idx - 1);

        const [lng, lat] = r.pts[idx];
        const rot = bearing(
          r.pts[idx],
          r.pts[Math.max(0, Math.min(total, nextIdx))],
        );

        return { id: r.id, lng, lat, rotation: rot, color: r.color };
      });

      setPlanes(newPlanes);
    };

    const id = setInterval(tick, ANIM_INTERVAL_MS);
    return () => clearInterval(id);
  }, [allRoutes, speed]);

  const planeGeoJSON = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: planes.map((p) => ({
        type: "Feature",
        id: `ai-plane-${p.id}`,
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        properties: { rotation: p.rotation, color: p.color },
      })),
    }),
    [planes],
  );

  if (aiAirlines.length === 0) return null;

  return (
    <>
      {/* Route arcs */}
      {allRoutes.length > 0 && (
        <MapboxGL.ShapeSource id="ai-routes-source" shape={arcGeoJSON}>
          <MapboxGL.LineLayer
            id="ai-routes-glow"
            style={{
              lineColor: ["get", "color"],
              lineWidth: 4,
              lineOpacity: 0.04,
              lineBlur: 4,
              lineCap: "round",
            }}
          />
          <MapboxGL.LineLayer
            id="ai-routes-line"
            style={{
              lineColor: ["get", "color"],
              lineWidth: 1,
              lineOpacity: 0.2,
              lineDasharray: [2, 5],
              lineCap: "round",
            }}
          />
        </MapboxGL.ShapeSource>
      )}

      {/* Animated AI planes — icon */}
      {planes.length > 0 && (
        <MapboxGL.ShapeSource id="ai-planes-source" shape={planeGeoJSON}>
          <MapboxGL.SymbolLayer
            id="ai-plane-icon"
            style={{
              iconImage: "airport-15",
              iconSize: 0.8,
              iconColor: ["get", "color"],
              iconOpacity: 0.7,
              iconRotate: ["get", "rotation"],
              iconRotationAlignment: "map",
              iconAllowOverlap: true,
              iconIgnorePlacement: true,
              iconPitchAlignment: "map",
            }}
          />
        </MapboxGL.ShapeSource>
      )}

      {/* AI hub dots */}
      {aiAirlines.length > 0 && (
        <MapboxGL.ShapeSource id="ai-hubs-source" shape={hubGeoJSON}>
          <MapboxGL.CircleLayer
            id="ai-hubs-glow"
            style={{
              circleRadius: 8,
              circleColor: ["get", "color"],
              circleOpacity: 0.12,
              circleBlur: 1,
              circlePitchAlignment: "map",
            }}
          />
          <MapboxGL.CircleLayer
            id="ai-hubs-dot"
            style={{
              circleRadius: 4,
              circleColor: ["get", "color"],
              circleOpacity: 0.5,
              circleStrokeColor: "rgba(0,0,0,0.4)",
              circleStrokeWidth: 1,
              circlePitchAlignment: "map",
            }}
          />
        </MapboxGL.ShapeSource>
      )}
    </>
  );
}
