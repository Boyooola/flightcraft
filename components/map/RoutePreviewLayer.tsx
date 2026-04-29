/**
 * components/map/RoutePreviewLayer.tsx
 *
 * Renders a live preview arc on the map during route creation.
 * Shows as the player taps airports — updates in real time.
 *
 * Visual design:
 *   - Dashed arc between waypoints (white, pulsing opacity)
 *   - Glowing dot at each selected waypoint
 *   - Direction arrow midpoint
 *   - Distinct colours: origin = airline colour, via = purple, dest = white
 */

import { Colors } from "@/constants/theme";
import { useGameStore } from "@/store";
import MapboxGL from "@rnmapbox/maps";
import { useEffect, useRef } from "react";
import { Animated } from "react-native";

// ─────────────────────────────────────────────────────────────────
// GREAT CIRCLE ARC
// ─────────────────────────────────────────────────────────────────

function buildArc(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number,
  steps = 40,
): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lng = lng1 + (lng2 - lng1) * t;
    const lat = lat1 + (lat2 - lat1) * t;
    // Gentle arc — peaks at midpoint
    const span = Math.abs(lng2 - lng1);
    const arc = Math.sin(t * Math.PI) * span * 0.12;
    pts.push([lng, lat + arc]);
  }
  return pts;
}

// ─────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────

export default function RoutePreviewLayer({
  airlineColor,
}: {
  airlineColor: string;
}) {
  const routeCreationMode = useGameStore((s) => s.routeCreationMode);
  const waypoints = useGameStore((s) => s.creationWaypoints);

  // Pulse animation for the arc
  const pulseAnim = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    if (!routeCreationMode) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 900,
          useNativeDriver: false,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 900,
          useNativeDriver: false,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [routeCreationMode]);

  if (!routeCreationMode || waypoints.length === 0) return null;

  // Build arc segments between consecutive waypoints
  const arcFeatures: GeoJSON.Feature[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i];
    const to = waypoints[i + 1];
    arcFeatures.push({
      type: "Feature",
      id: `preview-arc-${i}`,
      geometry: {
        type: "LineString",
        coordinates: buildArc(from.lng, from.lat, to.lng, to.lat),
      },
      properties: {},
    });
  }

  // Waypoint dots
  const dotFeatures: GeoJSON.Feature[] = waypoints.map((wp, i) => ({
    type: "Feature",
    id: `preview-dot-${i}`,
    geometry: { type: "Point", coordinates: [wp.lng, wp.lat] },
    properties: {
      index: i,
      isOrigin: i === 0,
      isVia: i > 0 && i < waypoints.length - 1,
      isDest: i === waypoints.length - 1,
      label: wp.iata,
    },
  }));

  const arcGeoJSON: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: arcFeatures,
  };

  const dotGeoJSON: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: dotFeatures,
  };

  return (
    <>
      {/* Arc glow */}
      {arcFeatures.length > 0 && (
        <MapboxGL.ShapeSource id="route-preview-arc" shape={arcGeoJSON}>
          <MapboxGL.LineLayer
            id="route-preview-glow"
            style={{
              lineColor: "#ffffff",
              lineWidth: 8,
              lineOpacity: 0.08,
              lineBlur: 6,
              lineCap: "round",
            }}
          />
          <MapboxGL.LineLayer
            id="route-preview-line"
            style={{
              lineColor: "#ffffff",
              lineWidth: 2,
              lineOpacity: 0.7,
              lineDasharray: [3, 4],
              lineCap: "round",
            }}
          />
        </MapboxGL.ShapeSource>
      )}

      {/* Waypoint dots */}
      <MapboxGL.ShapeSource id="route-preview-dots" shape={dotGeoJSON}>
        {/* Outer glow ring */}
        <MapboxGL.CircleLayer
          id="route-preview-dot-glow"
          style={{
            circleRadius: [
              "case",
              ["get", "isOrigin"],
              18,
              ["get", "isVia"],
              14,
              14,
            ],
            circleColor: [
              "case",
              ["get", "isOrigin"],
              airlineColor,
              ["get", "isVia"],
              Colors.purple,
              "#ffffff",
            ],
            circleOpacity: 0.15,
            circleBlur: 1.5,
            circlePitchAlignment: "map",
          }}
        />
        {/* Inner dot */}
        <MapboxGL.CircleLayer
          id="route-preview-dot-inner"
          style={{
            circleRadius: [
              "case",
              ["get", "isOrigin"],
              8,
              ["get", "isVia"],
              6,
              6,
            ],
            circleColor: [
              "case",
              ["get", "isOrigin"],
              airlineColor,
              ["get", "isVia"],
              Colors.purple,
              "#ffffff",
            ],
            circleStrokeColor: "rgba(0,0,0,0.5)",
            circleStrokeWidth: 1.5,
            circleOpacity: 0.95,
            circlePitchAlignment: "map",
          }}
        />
        {/* IATA label */}
        <MapboxGL.SymbolLayer
          id="route-preview-labels"
          style={{
            textField: ["get", "label"],
            textSize: 11,
            textColor: "#ffffff",
            textHaloColor: "rgba(0,0,0,0.8)",
            textHaloWidth: 1.5,
            textOffset: [0, 1.6],
            textAnchor: "top",
            textFont: ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
            textAllowOverlap: true,
          }}
        />
      </MapboxGL.ShapeSource>
    </>
  );
}
