/**
 * components/map/AirportLayer.tsx
 *
 * Airport dots with:
 *  - Owned hub pulsing ring animation (RN Animated → Mapbox circleRadius)
 *  - Trust ring opacity scales with hub trust %
 *  - Via airport purple highlight during connecting route selection
 *  - Selected airport amber rings
 */

import { Colors } from "@/constants/theme";
import { hubCrowdingLevel } from "@/lib/demands";
import type { Airport, OwnedHub } from "@/store";
import {
  useAirports,
  useDemands,
  useHubs,
  useRoutes,
  useSelectedAirport,
} from "@/store";
import MapboxGL from "@rnmapbox/maps";
import { useEffect, useRef } from "react";
import { Animated } from "react-native";

// ─────────────────────────────────────────────────────────────────
// GEOJSON HELPERS
// ─────────────────────────────────────────────────────────────────

function toGeoJSON(airports: Airport[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: airports.map((a) => ({
      type: "Feature",
      id: a.iata,
      geometry: { type: "Point", coordinates: [a.lng, a.lat] },
      properties: { iata: a.iata, name: a.name, city: a.city, tier: a.tier },
    })),
  };
}

function hubsToGeoJSON(
  hubs: OwnedHub[],
  demands: { hub_iata: string; pax_day: number; delivered_pax_today: number }[],
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: hubs.map((h) => {
      const crowding = hubCrowdingLevel(h.airport.iata, demands, h.airport);
      return {
        type: "Feature",
        id: h.airport.iata,
        geometry: {
          type: "Point",
          coordinates: [h.airport.lng, h.airport.lat],
        },
        properties: {
          iata: h.airport.iata,
          trust: h.trust,
          tier: h.tier,
          crowding: crowding.level, // "normal"|"busy"|"overcrowded"|"crisis"
          capPct: crowding.capacityPct,
        },
      };
    }),
  };
}

// ─────────────────────────────────────────────────────────────────
// PROPS
// ─────────────────────────────────────────────────────────────────

interface AirportLayerProps {
  routeCreationMode: boolean;
  waypointIatas: string[];
  airlineColor: string;
  onAirportPress: (airport: Airport) => void;
}

// ─────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────

export default function AirportLayer({
  airlineColor,
  onAirportPress,

  routeCreationMode,
  waypointIatas,
}: AirportLayerProps) {
  const airports = useAirports();
  const hubs = useHubs();
  const demands = useDemands();
  const routes = useRoutes();
  const selectedAirport = useSelectedAirport();

  // Pulse animation — loops 0→1→0
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: false,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);

  // Mapbox can't read Animated values directly, so we drive a JS state
  // by adding a listener and re-rendering with updated pulse radius
  const pulseRadius = useRef(0);
  const pulseOpacity = useRef(0);

  useEffect(() => {
    const id = pulse.addListener(({ value }) => {
      pulseRadius.current = value;
      pulseOpacity.current = 1 - value;
    });
    return () => pulse.removeListener(id);
  }, [pulse]);

  const allGeoJSON = toGeoJSON(airports);
  const ownedGeoJSON = hubsToGeoJSON(hubs, demands);
  const selectedGeoJSON = toGeoJSON(selectedAirport ? [selectedAirport] : []);

  const handlePress = (e: { features?: GeoJSON.Feature[] }) => {
    const feature = e.features?.[0];
    if (!feature?.properties?.iata) return;
    const ap = airports.find((a) => a.iata === feature.properties!.iata);
    if (ap) onAirportPress(ap);
  };

  if (airports.length === 0) return null;

  return (
    <>
      {/* ── All airports ── */}
      <MapboxGL.ShapeSource
        id="airports-source"
        shape={allGeoJSON}
        onPress={handlePress}
        hitbox={{ width: 20, height: 20 }}
      >
        <MapboxGL.CircleLayer
          id="airport-glow"
          existing={false}
          style={{
            circleRadius: [
              "interpolate",
              ["linear"],
              ["zoom"],
              1,
              ["case", ["==", ["get", "tier"], "major"], 6, 3],
              5,
              ["case", ["==", ["get", "tier"], "major"], 14, 7],
              10,
              ["case", ["==", ["get", "tier"], "major"], 22, 12],
            ],
            circleColor: Colors.sky,
            circleOpacity: [
              "interpolate",
              ["linear"],
              ["zoom"],
              1,
              0.06,
              5,
              0.14,
              10,
              0.22,
            ],
            circleBlur: 1.2,
            circlePitchAlignment: "map",
          }}
        />
        <MapboxGL.CircleLayer
          id="airport-dot"
          existing={false}
          style={{
            circleRadius: [
              "interpolate",
              ["linear"],
              ["zoom"],
              1,
              ["case", ["==", ["get", "tier"], "major"], 2.5, 1.2],
              5,
              ["case", ["==", ["get", "tier"], "major"], 5, 2.5],
              10,
              ["case", ["==", ["get", "tier"], "major"], 9, 5],
            ],
            circleColor: [
              "case",
              ["==", ["get", "tier"], "major"],
              Colors.sky,
              "#2a7fa8",
            ],
            circleOpacity: [
              "interpolate",
              ["linear"],
              ["zoom"],
              1,
              ["case", ["==", ["get", "tier"], "major"], 0.9, 0.35],
              4,
              ["case", ["==", ["get", "tier"], "major"], 1.0, 0.6],
              8,
              1.0,
            ],
            circleStrokeWidth: 10,
            circleStrokeOpacity: 0,
            circlePitchAlignment: "map",
          }}
        />
        <MapboxGL.SymbolLayer
          id="airport-label"
          existing={false}
          minZoomLevel={4}
          style={{
            textField: ["get", "iata"],
            textSize: [
              "interpolate",
              ["linear"],
              ["zoom"],
              4,
              ["case", ["==", ["get", "tier"], "major"], 9, 0],
              6,
              ["case", ["==", ["get", "tier"], "major"], 12, 9],
              10,
              13,
            ],
            textOffset: [0, 1.4],
            textAnchor: "top",
            textColor: Colors.sky,
            textOpacity: [
              "interpolate",
              ["linear"],
              ["zoom"],
              4,
              ["case", ["==", ["get", "tier"], "major"], 0.7, 0],
              6,
              0.85,
              8,
              1.0,
            ],
            textHaloColor: "rgba(4,9,15,0.9)",
            textHaloWidth: 1.5,
            textAllowOverlap: false,
            textIgnorePlacement: false,
            symbolSortKey: ["case", ["==", ["get", "tier"], "major"], 1, 0],
          }}
        />
      </MapboxGL.ShapeSource>

      {/* ── Owned hubs ── */}
      {hubs.length > 0 && (
        <MapboxGL.ShapeSource id="owned-source" shape={ownedGeoJSON}>
          {/* Trust ring — opacity driven by trust property (0-100) */}
          <MapboxGL.CircleLayer
            id="owned-trust-ring"
            existing={false}
            style={{
              circleRadius: [
                "interpolate",
                ["linear"],
                ["zoom"],
                1,
                10,
                5,
                18,
                10,
                28,
              ],
              circleColor: "transparent",
              circleStrokeColor: airlineColor,
              circleStrokeWidth: [
                "interpolate",
                ["linear"],
                ["get", "activeRoutes"],
                0,
                1,
                1,
                2,
                5,
                3,
              ],
              circleStrokeOpacity: [
                "interpolate",
                ["linear"],
                ["get", "trust"],
                0,
                0.15,
                100,
                0.8,
              ],
              circleOpacity: 0,
              circlePitchAlignment: "map",
            }}
          />

          {/* Overcrowding ring — colour + opacity driven by crowding level */}
          <MapboxGL.CircleLayer
            id="owned-crowding-ring"
            existing={false}
            style={{
              circleRadius: [
                "interpolate",
                ["linear"],
                ["zoom"],
                1,
                20,
                5,
                34,
                10,
                52,
              ],
              circleColor: "transparent",
              // Colour: amber for busy, orange for overcrowded, red for crisis
              circleStrokeColor: [
                "case",
                ["==", ["get", "crowding"], "crisis"],
                "#ef4444",
                ["==", ["get", "crowding"], "overcrowded"],
                "#f97316",
                ["==", ["get", "crowding"], "busy"],
                "#f59e0b",
                "transparent",
              ],
              circleStrokeWidth: [
                "case",
                ["==", ["get", "crowding"], "crisis"],
                3,
                ["==", ["get", "crowding"], "overcrowded"],
                2.5,
                ["==", ["get", "crowding"], "busy"],
                1.5,
                0,
              ],
              circleStrokeOpacity: [
                "case",
                ["==", ["get", "crowding"], "normal"],
                0,
                0.75,
              ],
              circleOpacity: 0,
              circlePitchAlignment: "map",
            }}
          />

          {/* Hub glow */}
          <MapboxGL.CircleLayer
            id="owned-activity-glow"
            existing={false}
            style={{
              circleRadius: [
                "interpolate",
                ["linear"],
                ["zoom"],
                1,
                10,
                5,
                20,
                10,
                32,
              ],
              circleColor: airlineColor,
              circleOpacity: 0.15,
              circleBlur: 1.5,
              circlePitchAlignment: "map",
            }}
          />

          {/* Hub dot */}
          <MapboxGL.CircleLayer
            id="owned-dot"
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
                12,
              ],
              circleColor: airlineColor,
              circleOpacity: 1,
              circleStrokeWidth: 2,
              circleStrokeColor: "rgba(255,255,255,0.4)",
              circlePitchAlignment: "map",
            }}
          />

          {/* Hub label — shows at zoom 3+ for owned hubs */}
          <MapboxGL.SymbolLayer
            id="owned-label"
            existing={false}
            minZoomLevel={3}
            style={{
              textField: ["get", "iata"],
              textSize: [
                "interpolate",
                ["linear"],
                ["zoom"],
                3,
                9,
                6,
                13,
                10,
                15,
              ],
              textOffset: [0, 1.6],
              textAnchor: "top",
              textColor: airlineColor,
              textOpacity: [
                "interpolate",
                ["linear"],
                ["zoom"],
                3,
                0.8,
                5,
                1.0,
              ],
              textHaloColor: "rgba(4,9,15,0.95)",
              textHaloWidth: 2,
              textAllowOverlap: true,
              textIgnorePlacement: true,
            }}
          />
        </MapboxGL.ShapeSource>
      )}

      {/* ── Selected airport ── */}
      {selectedAirport && (
        <MapboxGL.ShapeSource id="selected-source" shape={selectedGeoJSON}>
          <MapboxGL.CircleLayer
            id="selected-ring-outer"
            existing={false}
            style={{
              circleRadius: [
                "interpolate",
                ["linear"],
                ["zoom"],
                1,
                12,
                5,
                22,
                10,
                34,
              ],
              circleColor: "transparent",
              circleStrokeColor: Colors.amber,
              circleStrokeWidth: 1,
              circleOpacity: 0,
              circleStrokeOpacity: 0.4,
              circlePitchAlignment: "map",
            }}
          />
          <MapboxGL.CircleLayer
            id="selected-ring-inner"
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
              circleColor: "transparent",
              circleStrokeColor: Colors.amber,
              circleStrokeWidth: 1.5,
              circleOpacity: 0,
              circleStrokeOpacity: 0.9,
              circlePitchAlignment: "map",
            }}
          />
          <MapboxGL.CircleLayer
            id="selected-dot"
            existing={false}
            style={{
              circleRadius: [
                "interpolate",
                ["linear"],
                ["zoom"],
                1,
                3,
                5,
                6,
                10,
                10,
              ],
              circleColor: Colors.amber,
              circleOpacity: 1,
              circlePitchAlignment: "map",
            }}
          />
        </MapboxGL.ShapeSource>
      )}
    </>
  );
}
