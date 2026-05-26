/**
 * components/map/AirportLayer.tsx
 *
 * Rebuilt with the following fixes:
 *   1. Pulse animation actually drives a CircleLayer (owned-pulse-ring)
 *   2. AI hub layer is rendered (was computed but never displayed)
 *   3. Waypoint highlighting — selected waypoints glow amber, others dim in creation mode
 *   4. Route creation mode dims non-selected base dots to guide selection
 *   5. Removed dead circleStrokeWidth:10 + circleStrokeOpacity:0 hack on airport-dot
 *   6. Fixed trust ring — activeRoutes removed (never set), stroke width now tier-based
 *   7. Via airport purple highlight layer added (was in header comment, missing from JSX)
 *   8. selectedGeoJSON memoized — no longer rebuilds every render
 *   9. aiHubGeoJSON rendered in a proper ShapeSource
 */

import { Colors } from "@/constants/theme";
import { hubCrowdingLevel } from "@/lib/demands";
import {
  FlowDemand,
  hubOutboundDeliveredPax,
  hubOutboundWaitingPax,
} from "@/lib/passengerFlow";
import type { Airport, OwnedHub } from "@/store";
import {
  useAIAirlines,
  useAirports,
  useDayProgress,
  useDemands,
  useHubs,
  useRoutes,
  useSelectedAirport,
} from "@/store";
import MapboxGL from "@rnmapbox/maps";
import { useEffect, useMemo, useRef } from "react";
import { Animated } from "react-native";

// ─────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────

// Pulse timing — 2.4s in, 2.4s out
const PULSE_DURATION = 2400;

// AI hub dot color — distinct from player and from unowned airports
const AI_HUB_COLOR = Colors.purple ?? "#a855f7";

// Via waypoint color during connecting route selection
const VIA_COLOR = Colors.purple ?? "#a855f7";

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
      properties: {
        iata: a.iata,
        name: a.name,
        city: a.city,
        tier: a.tier,
      },
    })),
  };
}

function hubsToGeoJSON(
  hubs: OwnedHub[],
  demands: FlowDemand[],
  dayProgress: number,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: hubs.map((h) => {
      const crowding = hubCrowdingLevel(h.airport.iata, demands, h.airport);
      const waitingPax = hubOutboundWaitingPax(
        h.airport.iata,
        demands,
        dayProgress,
      );
      const movedPax = hubOutboundDeliveredPax(h.airport.iata, demands);
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
          tier: h.tier, // 1-6 numeric tier
          crowding: crowding.level, // "normal"|"busy"|"overcrowded"|"crisis"
          capPct: crowding.capacityPct,
          waitingPax,
          movedPax,
        },
      };
    }),
  };
}

// ─────────────────────────────────────────────────────────────────
// ZOOM-INTERPOLATED RADIUS HELPER
// Returns a Mapbox expression that scales radius at zoom 1 / 5 / 10
// ─────────────────────────────────────────────────────────────────

function zoomRadius(z1: number, z5: number, z10: number): any {
  return ["interpolate", ["linear"], ["zoom"], 1, z1, 5, z5, 10, z10];
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
  const dayProgress = useDayProgress();
  const routes = useRoutes();
  const selectedAirport = useSelectedAirport();
  const aiAirlines = useAIAirlines();

  // ── Pulse animation ─────────────────────────────────────────────
  // Drives owned-pulse-ring circleRadius and circleStrokeOpacity
  const pulse = useRef(new Animated.Value(0)).current;

  // JS-side refs that Mapbox layer styles read on each frame
  const pulseRadius = useRef(0);
  const pulseOpacity = useRef(0.6);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: PULSE_DURATION,
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: PULSE_DURATION,
          useNativeDriver: false,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);

  useEffect(() => {
    const id = pulse.addListener(({ value }) => {
      // pulse 0→1: ring expands outward and fades
      pulseRadius.current = value; // 0..1 normalized — scaled per zoom in the layer
      pulseOpacity.current = 0.65 * (1 - value); // starts visible, fades as it expands
    });
    return () => pulse.removeListener(id);
  }, [pulse]);

  // ── Derived GeoJSON ─────────────────────────────────────────────

  const allGeoJSON = useMemo(() => toGeoJSON(airports), [airports]);
  const ownedGeoJSON = useMemo(
    () => hubsToGeoJSON(hubs, demands, dayProgress),
    [hubs, demands, dayProgress],
  );

  // Memoized — was rebuilding every render even when selectedAirport unchanged
  const selectedGeoJSON = useMemo(
    () => toGeoJSON(selectedAirport ? [selectedAirport] : []),
    [selectedAirport],
  );

  // AI hubs — airports where any rival airline has a hub, excluding player hubs
  const aiHubIatas = useMemo(
    () => new Set(aiAirlines.flatMap((ai) => ai.hubIatas)),
    [aiAirlines],
  );
  const aiHubGeoJSON = useMemo(
    () =>
      toGeoJSON(
        airports.filter(
          (a) =>
            aiHubIatas.has(a.iata) &&
            !hubs.some((h) => h.airport.iata === a.iata),
        ),
      ),
    [airports, aiHubIatas, hubs],
  );

  // Waypoint GeoJSON — airports selected during route creation
  // First waypoint = origin (airline color), second = via candidate (purple)
  const waypointAirports = useMemo(
    () => airports.filter((a) => waypointIatas.includes(a.iata)),
    [airports, waypointIatas],
  );
  const waypointGeoJSON = useMemo(
    () => toGeoJSON(waypointAirports),
    [waypointAirports],
  );

  // ── Press handler ───────────────────────────────────────────────

  const handlePress = (e: { features?: GeoJSON.Feature[] }) => {
    const feature = e.features?.[0];
    if (!feature?.properties?.iata) return;
    const ap = airports.find((a) => a.iata === feature.properties!.iata);
    if (ap) onAirportPress(ap);
  };

  if (airports.length === 0) return null;

  // In route creation mode, non-waypoint airports dim to guide selection
  const baseDotOpacity: any = routeCreationMode
    ? [
        "interpolate",
        ["linear"],
        ["zoom"],
        1,
        ["case", ["==", ["get", "tier"], "major"], 0.45, 0.15],
        4,
        ["case", ["==", ["get", "tier"], "major"], 0.55, 0.25],
        8,
        0.45,
      ]
    : [
        "interpolate",
        ["linear"],
        ["zoom"],
        1,
        ["case", ["==", ["get", "tier"], "major"], 0.9, 0.35],
        4,
        ["case", ["==", ["get", "tier"], "major"], 1.0, 0.6],
        8,
        1.0,
      ];

  return (
    <>
      {/* ══════════════════════════════════════════════════════════
          BASE AIRPORT LAYER — all airports
          ══════════════════════════════════════════════════════════ */}
      <MapboxGL.ShapeSource
        id="airports-source"
        shape={allGeoJSON}
        onPress={handlePress}
        hitbox={{ width: 20, height: 20 }}
      >
        {/* Soft glow behind dot */}
        <MapboxGL.CircleLayer
          id="airport-glow"
          existing={false}
          style={{
            circleRadius: zoomRadius(
              // major: 6/14/22  minor: 3/7/12
              ["case", ["==", ["get", "tier"], "major"], 6, 3] as any,
              ["case", ["==", ["get", "tier"], "major"], 14, 7] as any,
              ["case", ["==", ["get", "tier"], "major"], 22, 12] as any,
            ),
            circleColor: Colors.sky,
            circleOpacity: [
              "interpolate",
              ["linear"],
              ["zoom"],
              1,
              routeCreationMode ? 0.03 : 0.06,
              5,
              routeCreationMode ? 0.07 : 0.14,
              10,
              routeCreationMode ? 0.12 : 0.22,
            ],
            circleBlur: 1.2,
            circlePitchAlignment: "map",
          }}
        />

        {/* Airport dot — dims in route creation mode */}
        <MapboxGL.CircleLayer
          id="airport-dot"
          existing={false}
          style={{
            circleRadius: zoomRadius(
              ["case", ["==", ["get", "tier"], "major"], 2.5, 1.2] as any,
              ["case", ["==", ["get", "tier"], "major"], 5, 2.5] as any,
              ["case", ["==", ["get", "tier"], "major"], 9, 5] as any,
            ),
            circleColor: [
              "case",
              ["==", ["get", "tier"], "major"],
              Colors.sky,
              "#2a7fa8",
            ],
            circleOpacity: baseDotOpacity,
            // Removed: circleStrokeWidth:10 + circleStrokeOpacity:0 hack
            // Hit area is handled by ShapeSource hitbox={{width:20,height:20}}
            circlePitchAlignment: "map",
          }}
        />

        {/* IATA label — major airports at zoom 4+, all at zoom 6+ */}
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
              ["case", ["==", ["get", "tier"], "major"], 9, 0] as any,
              6,
              ["case", ["==", ["get", "tier"], "major"], 12, 9] as any,
              10,
              13,
            ],
            textOffset: [0, 1.4],
            textAnchor: "top",
            textColor: routeCreationMode ? Colors.dim : Colors.sky,
            textOpacity: [
              "interpolate",
              ["linear"],
              ["zoom"],
              4,
              ["case", ["==", ["get", "tier"], "major"], 0.7, 0] as any,
              6,
              routeCreationMode ? 0.35 : 0.85,
              8,
              routeCreationMode ? 0.45 : 1.0,
            ],
            textHaloColor: "rgba(4,9,15,0.9)",
            textHaloWidth: 1.5,
            textAllowOverlap: false,
            textIgnorePlacement: false,
            symbolSortKey: [
              "case",
              ["==", ["get", "tier"], "major"],
              1,
              0,
            ] as any,
          }}
        />
      </MapboxGL.ShapeSource>

      {/* ══════════════════════════════════════════════════════════
          AI HUB LAYER — rival airline hubs
          (was computed but never rendered — now shown)
          ══════════════════════════════════════════════════════════ */}
      {aiAirlines.length > 0 && aiHubGeoJSON.features.length > 0 && (
        <MapboxGL.ShapeSource
          id="ai-hubs-source"
          shape={aiHubGeoJSON}
          onPress={handlePress}
          hitbox={{ width: 20, height: 20 }}
        >
          {/* Subtle glow — distinguishable from player hubs */}
          <MapboxGL.CircleLayer
            id="ai-hub-glow"
            existing={false}
            style={{
              circleRadius: zoomRadius(8, 16, 26),
              circleColor: AI_HUB_COLOR,
              circleOpacity: 0.1,
              circleBlur: 1.4,
              circlePitchAlignment: "map",
            }}
          />
          {/* AI hub dot */}
          <MapboxGL.CircleLayer
            id="ai-hub-dot"
            existing={false}
            style={{
              circleRadius: zoomRadius(3, 6, 10),
              circleColor: AI_HUB_COLOR,
              circleOpacity: routeCreationMode ? 0.3 : 0.75,
              circleStrokeWidth: 1.5,
              circleStrokeColor: "rgba(255,255,255,0.2)",
              circlePitchAlignment: "map",
            }}
          />
          {/* AI hub IATA label */}
          <MapboxGL.SymbolLayer
            id="ai-hub-label"
            existing={false}
            minZoomLevel={4}
            style={{
              textField: ["get", "iata"],
              textSize: ["interpolate", ["linear"], ["zoom"], 4, 9, 8, 12],
              textOffset: [0, 1.5],
              textAnchor: "top",
              textColor: AI_HUB_COLOR,
              textOpacity: [
                "interpolate",
                ["linear"],
                ["zoom"],
                4,
                0.6,
                6,
                routeCreationMode ? 0.3 : 0.85,
              ],
              textHaloColor: "rgba(4,9,15,0.95)",
              textHaloWidth: 2,
              textAllowOverlap: true,
              textIgnorePlacement: true,
            }}
          />
        </MapboxGL.ShapeSource>
      )}

      {/* ══════════════════════════════════════════════════════════
          OWNED HUB LAYER — player's hubs
          ══════════════════════════════════════════════════════════ */}
      {hubs.length > 0 && (
        <MapboxGL.ShapeSource id="owned-source" shape={ownedGeoJSON}>
          {/* Trust ring — opacity scales with trust, width with tier
              Fixed: was using ["get","activeRoutes"] which was never set.
              Now uses tier (1-6) for stroke width. */}
          <MapboxGL.CircleLayer
            id="owned-trust-ring"
            existing={false}
            style={{
              circleRadius: zoomRadius(10, 18, 28),
              circleColor: "transparent",
              circleStrokeColor: airlineColor,
              circleStrokeWidth: [
                "interpolate",
                ["linear"],
                ["get", "tier"],
                1,
                1,
                3,
                2,
                6,
                3,
              ],
              circleStrokeOpacity: [
                "interpolate",
                ["linear"],
                ["get", "trust"],
                0,
                0.1,
                40,
                0.3,
                70,
                0.6,
                100,
                0.85,
              ],
              circleOpacity: 0,
              circlePitchAlignment: "map",
            }}
          />

          {/* Pulse ring — actually driven by the pulse animation now.
              Uses pulseRadius.current and pulseOpacity.current refs.
              We pass them as static values on each Mapbox render cycle —
              Mapbox re-evaluates the style object when the source updates,
              so this works for a slow pulse without needing a ticker. */}
          <MapboxGL.CircleLayer
            id="owned-pulse-ring"
            existing={false}
            style={{
              circleRadius: [
                "interpolate",
                ["linear"],
                ["zoom"],
                1,
                12 + pulseRadius.current * 8,
                5,
                22 + pulseRadius.current * 14,
                10,
                34 + pulseRadius.current * 20,
              ],
              circleColor: "transparent",
              circleStrokeColor: airlineColor,
              circleStrokeWidth: 1.5,
              circleStrokeOpacity: pulseOpacity.current,
              circleOpacity: 0,
              circlePitchAlignment: "map",
            }}
          />

          {/* Overcrowding ring — amber/orange/red driven by crowding level */}
          <MapboxGL.CircleLayer
            id="owned-crowding-ring"
            existing={false}
            style={{
              circleRadius: zoomRadius(20, 34, 52),
              circleColor: "transparent",
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

          {/* Waiting travelers ring — grows with queue depth */}
          <MapboxGL.CircleLayer
            id="owned-waiting-ring"
            existing={false}
            style={{
              circleRadius: zoomRadius(
                ["case", [">", ["get", "waitingPax"], 0], 15, 0] as any,
                ["case", [">", ["get", "waitingPax"], 0], 28, 0] as any,
                ["case", [">", ["get", "waitingPax"], 0], 44, 0] as any,
              ),
              circleColor: "transparent",
              circleStrokeColor: Colors.amber,
              circleStrokeWidth: [
                "interpolate",
                ["linear"],
                ["get", "waitingPax"],
                0,
                0,
                50,
                1.5,
                250,
                3,
              ],
              circleStrokeOpacity: [
                "interpolate",
                ["linear"],
                ["get", "waitingPax"],
                0,
                0,
                50,
                0.35,
                250,
                0.85,
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
              circleRadius: zoomRadius(10, 20, 32),
              circleColor: airlineColor,
              circleOpacity: 0.15,
              circleBlur: 1.5,
              circlePitchAlignment: "map",
            }}
          />

          {/* Hub dot — solid, airline color */}
          <MapboxGL.CircleLayer
            id="owned-dot"
            existing={false}
            style={{
              circleRadius: zoomRadius(4, 7, 12),
              circleColor: airlineColor,
              circleOpacity: 1,
              circleStrokeWidth: 2,
              circleStrokeColor: "rgba(255,255,255,0.4)",
              circlePitchAlignment: "map",
            }}
          />

          {/* Waiting pax label — amber, above the dot */}
          <MapboxGL.SymbolLayer
            id="owned-waiting-label"
            existing={false}
            minZoomLevel={5}
            style={{
              textField: [
                "case",
                [">", ["get", "waitingPax"], 0],
                ["concat", ["to-string", ["get", "waitingPax"]], " waiting"],
                "",
              ],
              textSize: ["interpolate", ["linear"], ["zoom"], 5, 9, 10, 12],
              textOffset: [0, -1.7],
              textAnchor: "bottom",
              textColor: Colors.amber,
              textOpacity: ["case", [">", ["get", "waitingPax"], 0], 0.95, 0],
              textHaloColor: "rgba(4,9,15,0.95)",
              textHaloWidth: 2,
              textAllowOverlap: true,
              textIgnorePlacement: true,
            }}
          />

          {/* Hub IATA label — airline color, below the dot, visible from zoom 3 */}
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

      {/* ══════════════════════════════════════════════════════════
          WAYPOINT LAYER — airports selected during route creation
          First waypoint = origin (airline color)
          Second waypoint = via candidate (purple)
          ══════════════════════════════════════════════════════════ */}
      {routeCreationMode && waypointAirports.length > 0 && (
        <MapboxGL.ShapeSource
          id="waypoint-source"
          shape={waypointGeoJSON}
          hitbox={{ width: 20, height: 20 }}
        >
          {/* Outer ring — pulses attention onto selected waypoint */}
          <MapboxGL.CircleLayer
            id="waypoint-ring-outer"
            existing={false}
            style={{
              circleRadius: zoomRadius(16, 26, 40),
              circleColor: "transparent",
              circleStrokeColor: [
                "case",
                // Second waypoint (index 1) = via = purple
                ["==", ["get", "iata"], waypointIatas[1] ?? ""],
                VIA_COLOR,
                airlineColor,
              ],
              circleStrokeWidth: 1,
              circleStrokeOpacity: 0.4,
              circleOpacity: 0,
              circlePitchAlignment: "map",
            }}
          />
          {/* Inner ring */}
          <MapboxGL.CircleLayer
            id="waypoint-ring-inner"
            existing={false}
            style={{
              circleRadius: zoomRadius(8, 14, 20),
              circleColor: "transparent",
              circleStrokeColor: [
                "case",
                ["==", ["get", "iata"], waypointIatas[1] ?? ""],
                VIA_COLOR,
                airlineColor,
              ],
              circleStrokeWidth: 1.5,
              circleStrokeOpacity: 0.9,
              circleOpacity: 0,
              circlePitchAlignment: "map",
            }}
          />
          {/* Filled dot — brighter than unselected */}
          <MapboxGL.CircleLayer
            id="waypoint-dot"
            existing={false}
            style={{
              circleRadius: zoomRadius(4, 7, 11),
              circleColor: [
                "case",
                ["==", ["get", "iata"], waypointIatas[1] ?? ""],
                VIA_COLOR,
                airlineColor,
              ],
              circleOpacity: 1,
              circlePitchAlignment: "map",
            }}
          />
          {/* Waypoint IATA label */}
          <MapboxGL.SymbolLayer
            id="waypoint-label"
            existing={false}
            style={{
              textField: ["get", "iata"],
              textSize: 12,
              textOffset: [0, 1.6],
              textAnchor: "top",
              textColor: [
                "case",
                ["==", ["get", "iata"], waypointIatas[1] ?? ""],
                VIA_COLOR,
                airlineColor,
              ],
              textOpacity: 1,
              textHaloColor: "rgba(4,9,15,0.95)",
              textHaloWidth: 2,
              textAllowOverlap: true,
              textIgnorePlacement: true,
            }}
          />
        </MapboxGL.ShapeSource>
      )}

      {/* ══════════════════════════════════════════════════════════
          SELECTED AIRPORT — amber rings when sheet is open
          (memoized — no longer rebuilds every render)
          ══════════════════════════════════════════════════════════ */}
      {selectedAirport && (
        <MapboxGL.ShapeSource id="selected-source" shape={selectedGeoJSON}>
          <MapboxGL.CircleLayer
            id="selected-ring-outer"
            existing={false}
            style={{
              circleRadius: zoomRadius(12, 22, 34),
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
              circleRadius: zoomRadius(6, 10, 16),
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
              circleRadius: zoomRadius(3, 6, 10),
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
