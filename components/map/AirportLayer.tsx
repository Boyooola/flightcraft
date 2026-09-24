/**
 * Airport markers for the daylight operations map.
 *
 * Visual priority:
 * base airport < rival hub < owned hub < waypoint < selected airport.
 */

import { Colors, Palette } from "@/constants/theme";
import { hubCrowdingLevel } from "@/lib/demands";
import { FlowDemand, hubOutboundWaitingPax } from "@/lib/passengerFlow";
import type { Airport, AirportTier, OwnedHub } from "@/store";
import {
  useAIAirlines,
  useAirports,
  useDayProgress,
  useDemands,
  useHubs,
  useSelectedAirport,
} from "@/store";
import MapboxGL from "@rnmapbox/maps";
import { useMemo } from "react";

const AI_HUB_COLOR = Colors.purple;
const VIA_COLOR = Colors.purple;

const TIER_IMPORTANCE: Record<AirportTier, number> = {
  mega: 6,
  large: 5,
  major: 4,
  regional: 3,
  minor: 2,
  local: 1,
};

function toGeoJSON(airports: Airport[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: airports.map((airport) => ({
      type: "Feature",
      id: airport.iata,
      geometry: {
        type: "Point",
        coordinates: [airport.lng, airport.lat],
      },
      properties: {
        iata: airport.iata,
        name: airport.name,
        city: airport.city,
        tier: airport.tier,
        importance: TIER_IMPORTANCE[airport.tier],
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
    features: hubs.map((hub) => {
      const crowding = hubCrowdingLevel(
        hub.airport.iata,
        demands,
        hub.airport,
      );

      return {
        type: "Feature",
        id: hub.airport.iata,
        geometry: {
          type: "Point",
          coordinates: [hub.airport.lng, hub.airport.lat],
        },
        properties: {
          iata: hub.airport.iata,
          trust: hub.trust,
          hubTier: hub.tier,
          importance: TIER_IMPORTANCE[hub.airport.tier],
          crowding: crowding.level,
          capacityPercent: crowding.capacityPct,
          waitingPax: hubOutboundWaitingPax(
            hub.airport.iata,
            demands,
            dayProgress,
          ),
        },
      };
    }),
  };
}

function zoomRadius(
  lowZoom: number | unknown[],
  midZoom: number | unknown[],
  highZoom: number | unknown[],
): any {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    1,
    lowZoom,
    5,
    midZoom,
    10,
    highZoom,
  ];
}

const BASE_RADIUS_LOW = [
  "interpolate",
  ["linear"],
  ["get", "importance"],
  1,
  0.8,
  6,
  2.8,
];

const BASE_RADIUS_MID = [
  "interpolate",
  ["linear"],
  ["get", "importance"],
  1,
  1.8,
  6,
  5.5,
];

const BASE_RADIUS_HIGH = [
  "interpolate",
  ["linear"],
  ["get", "importance"],
  1,
  3.2,
  6,
  8.5,
];

interface AirportLayerProps {
  routeCreationMode: boolean;
  waypointIatas: string[];
  airlineColor: string;
  onAirportPress: (airport: Airport) => void;
}

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
  const selectedAirport = useSelectedAirport();
  const aiAirlines = useAIAirlines();

  const allGeoJSON = useMemo(() => toGeoJSON(airports), [airports]);
  const ownedGeoJSON = useMemo(
    () => hubsToGeoJSON(hubs, demands, dayProgress),
    [dayProgress, demands, hubs],
  );
  const selectedGeoJSON = useMemo(
    () => toGeoJSON(selectedAirport ? [selectedAirport] : []),
    [selectedAirport],
  );

  const ownedHubIatas = useMemo(
    () => new Set(hubs.map((hub) => hub.airport.iata)),
    [hubs],
  );
  const aiHubIatas = useMemo(
    () => new Set(aiAirlines.flatMap((airline) => airline.hubIatas)),
    [aiAirlines],
  );
  const aiHubGeoJSON = useMemo(
    () =>
      toGeoJSON(
        airports.filter(
          (airport) =>
            aiHubIatas.has(airport.iata) &&
            !ownedHubIatas.has(airport.iata),
        ),
      ),
    [aiHubIatas, airports, ownedHubIatas],
  );

  const waypointAirports = useMemo(
    () => airports.filter((airport) => waypointIatas.includes(airport.iata)),
    [airports, waypointIatas],
  );
  const waypointGeoJSON = useMemo(
    () => toGeoJSON(waypointAirports),
    [waypointAirports],
  );

  const handlePress = (event: { features?: GeoJSON.Feature[] }) => {
    const iata = event.features?.[0]?.properties?.iata;
    if (!iata) return;

    const airport = airports.find((candidate) => candidate.iata === iata);
    if (airport) onAirportPress(airport);
  };

  if (airports.length === 0) return null;

  const baseOpacity: any = routeCreationMode
    ? [
        "interpolate",
        ["linear"],
        ["zoom"],
        1,
        ["interpolate", ["linear"], ["get", "importance"], 1, 0.08, 6, 0.3],
        6,
        ["interpolate", ["linear"], ["get", "importance"], 1, 0.2, 6, 0.45],
        10,
        0.5,
      ]
    : [
        "interpolate",
        ["linear"],
        ["zoom"],
        1,
        ["interpolate", ["linear"], ["get", "importance"], 1, 0.16, 6, 0.8],
        6,
        ["interpolate", ["linear"], ["get", "importance"], 1, 0.52, 6, 1],
        10,
        1,
      ];

  return (
    <>
      <MapboxGL.ShapeSource
        id="airports-source"
        shape={allGeoJSON}
        onPress={handlePress}
        hitbox={{ width: 30, height: 30 }}
      >
        <MapboxGL.CircleLayer
          id="airport-priority-ring"
          existing={false}
          filter={[">=", ["get", "importance"], 4]}
          style={{
            circleRadius: zoomRadius(4.5, 8, 13),
            circleColor: "transparent",
            circleOpacity: 0,
            circleStrokeColor: Colors.sky,
            circleStrokeWidth: 1,
            circleStrokeOpacity: routeCreationMode ? 0.12 : 0.28,
            circlePitchAlignment: "map",
          }}
        />

        <MapboxGL.CircleLayer
          id="airport-dot"
          existing={false}
          style={{
            circleRadius: zoomRadius(
              BASE_RADIUS_LOW,
              BASE_RADIUS_MID,
              BASE_RADIUS_HIGH,
            ),
            circleColor: [
              "case",
              [">=", ["get", "importance"], 4],
              Colors.skyDark,
              Colors.muted,
            ],
            circleOpacity: baseOpacity,
            circleStrokeColor: Colors.surface,
            circleStrokeWidth: [
              "interpolate",
              ["linear"],
              ["zoom"],
              1,
              0.5,
              6,
              1.25,
              10,
              2,
            ],
            circleStrokeOpacity: baseOpacity,
            circlePitchAlignment: "map",
          }}
        />

        <MapboxGL.SymbolLayer
          id="airport-iata-label"
          existing={false}
          minZoomLevel={3}
          style={{
            textField: ["get", "iata"],
            textSize: [
              "interpolate",
              ["linear"],
              ["zoom"],
              3,
              ["interpolate", ["linear"], ["get", "importance"], 1, 0, 6, 10],
              6,
              ["interpolate", ["linear"], ["get", "importance"], 1, 8, 6, 11],
              10,
              12,
            ] as any,
            textOffset: [0, 1.25],
            textAnchor: "top",
            textColor: routeCreationMode ? Colors.dim : Colors.text,
            textOpacity: [
              "interpolate",
              ["linear"],
              ["zoom"],
              3,
              ["interpolate", ["linear"], ["get", "importance"], 1, 0, 6, 0.75],
              6,
              ["interpolate", ["linear"], ["get", "importance"], 1, 0.35, 6, 0.9],
              9,
              routeCreationMode ? 0.45 : 0.9,
            ] as any,
            textHaloColor: Colors.surface,
            textHaloWidth: 2,
            textHaloBlur: 0.5,
            textAllowOverlap: false,
            textIgnorePlacement: false,
            symbolSortKey: ["get", "importance"],
          }}
        />
      </MapboxGL.ShapeSource>

      {aiHubGeoJSON.features.length > 0 ? (
        <MapboxGL.ShapeSource id="ai-hubs-source" shape={aiHubGeoJSON}>
          <MapboxGL.CircleLayer
            id="ai-hub-ring"
            existing={false}
            style={{
              circleRadius: zoomRadius(5.5, 9, 14),
              circleColor: Palette.violetSoft,
              circleOpacity: routeCreationMode ? 0.35 : 0.9,
              circleStrokeColor: AI_HUB_COLOR,
              circleStrokeWidth: 2,
              circleStrokeOpacity: routeCreationMode ? 0.35 : 0.85,
              circlePitchAlignment: "map",
            }}
          />
          <MapboxGL.CircleLayer
            id="ai-hub-core"
            existing={false}
            style={{
              circleRadius: zoomRadius(1.5, 2.5, 4),
              circleColor: AI_HUB_COLOR,
              circleOpacity: routeCreationMode ? 0.4 : 1,
              circlePitchAlignment: "map",
            }}
          />
          <MapboxGL.SymbolLayer
            id="ai-hub-label"
            existing={false}
            minZoomLevel={3}
            style={{
              textField: ["get", "iata"],
              textSize: ["interpolate", ["linear"], ["zoom"], 3, 9, 8, 12],
              textOffset: [0, 1.45],
              textAnchor: "top",
              textColor: AI_HUB_COLOR,
              textOpacity: routeCreationMode ? 0.4 : 0.95,
              textHaloColor: Colors.surface,
              textHaloWidth: 2,
              textHaloBlur: 0.5,
              textAllowOverlap: true,
              textIgnorePlacement: true,
            }}
          />
        </MapboxGL.ShapeSource>
      ) : null}

      {hubs.length > 0 ? (
        <MapboxGL.ShapeSource id="owned-source" shape={ownedGeoJSON}>
          <MapboxGL.CircleLayer
            id="owned-crowding-ring"
            existing={false}
            filter={["!=", ["get", "crowding"], "normal"]}
            style={{
              circleRadius: zoomRadius(13, 22, 34),
              circleColor: "transparent",
              circleOpacity: 0,
              circleStrokeColor: [
                "case",
                ["==", ["get", "crowding"], "crisis"],
                Colors.red,
                ["==", ["get", "crowding"], "overcrowded"],
                Colors.orange,
                Colors.amber,
              ],
              circleStrokeWidth: [
                "case",
                ["==", ["get", "crowding"], "crisis"],
                3,
                ["==", ["get", "crowding"], "overcrowded"],
                2.5,
                1.5,
              ],
              circleStrokeOpacity: 0.85,
              circlePitchAlignment: "map",
            }}
          />

          <MapboxGL.CircleLayer
            id="owned-waiting-ring"
            existing={false}
            filter={[">", ["get", "waitingPax"], 0]}
            style={{
              circleRadius: zoomRadius(10.5, 17, 26),
              circleColor: "transparent",
              circleOpacity: 0,
              circleStrokeColor: Colors.amber,
              circleStrokeWidth: [
                "interpolate",
                ["linear"],
                ["get", "waitingPax"],
                0,
                0,
                50,
                1,
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
                0.4,
                250,
                0.9,
              ],
              circlePitchAlignment: "map",
            }}
          />

          <MapboxGL.CircleLayer
            id="owned-trust-ring"
            existing={false}
            style={{
              circleRadius: zoomRadius(8.5, 14, 21),
              circleColor: "transparent",
              circleOpacity: 0,
              circleStrokeColor: airlineColor,
              circleStrokeWidth: [
                "interpolate",
                ["linear"],
                ["get", "hubTier"],
                1,
                1,
                3,
                1.75,
                6,
                2.5,
              ],
              circleStrokeOpacity: [
                "interpolate",
                ["linear"],
                ["get", "trust"],
                0,
                0.15,
                50,
                0.45,
                100,
                0.8,
              ],
              circlePitchAlignment: "map",
            }}
          />

          <MapboxGL.CircleLayer
            id="owned-hub-disc"
            existing={false}
            style={{
              circleRadius: zoomRadius(5, 8, 12),
              circleColor: Colors.surface,
              circleOpacity: 1,
              circleStrokeColor: airlineColor,
              circleStrokeWidth: zoomRadius(2, 2.5, 3.5),
              circleStrokeOpacity: 1,
              circlePitchAlignment: "map",
            }}
          />

          <MapboxGL.CircleLayer
            id="owned-hub-core"
            existing={false}
            style={{
              circleRadius: zoomRadius(1.8, 3, 4.5),
              circleColor: airlineColor,
              circleOpacity: 1,
              circlePitchAlignment: "map",
            }}
          />

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
              textSize: ["interpolate", ["linear"], ["zoom"], 5, 9, 10, 11],
              textOffset: [0, -1.65],
              textAnchor: "bottom",
              textColor: Colors.orange,
              textOpacity: ["case", [">", ["get", "waitingPax"], 0], 1, 0],
              textHaloColor: Colors.surface,
              textHaloWidth: 2.5,
              textHaloBlur: 0.5,
              textAllowOverlap: true,
              textIgnorePlacement: true,
            }}
          />

          <MapboxGL.SymbolLayer
            id="owned-hub-label"
            existing={false}
            minZoomLevel={2.5}
            style={{
              textField: ["get", "iata"],
              textSize: ["interpolate", ["linear"], ["zoom"], 2.5, 10, 6, 13, 10, 15],
              textOffset: [0, 1.45],
              textAnchor: "top",
              textColor: Colors.text,
              textOpacity: 1,
              textHaloColor: Colors.surface,
              textHaloWidth: 3,
              textHaloBlur: 0.5,
              textAllowOverlap: true,
              textIgnorePlacement: true,
            }}
          />
        </MapboxGL.ShapeSource>
      ) : null}

      {routeCreationMode && waypointAirports.length > 0 ? (
        <MapboxGL.ShapeSource id="waypoint-source" shape={waypointGeoJSON}>
          <MapboxGL.CircleLayer
            id="waypoint-outer-ring"
            existing={false}
            style={{
              circleRadius: zoomRadius(12, 20, 30),
              circleColor: "transparent",
              circleOpacity: 0,
              circleStrokeColor: [
                "case",
                ["==", ["get", "iata"], waypointIatas[1] ?? ""],
                VIA_COLOR,
                airlineColor,
              ],
              circleStrokeWidth: 2,
              circleStrokeOpacity: 0.4,
              circlePitchAlignment: "map",
            }}
          />
          <MapboxGL.CircleLayer
            id="waypoint-disc"
            existing={false}
            style={{
              circleRadius: zoomRadius(5, 8, 12),
              circleColor: [
                "case",
                ["==", ["get", "iata"], waypointIatas[1] ?? ""],
                VIA_COLOR,
                airlineColor,
              ],
              circleOpacity: 1,
              circleStrokeColor: Colors.surface,
              circleStrokeWidth: 3,
              circleStrokeOpacity: 1,
              circlePitchAlignment: "map",
            }}
          />
          <MapboxGL.SymbolLayer
            id="waypoint-label"
            existing={false}
            style={{
              textField: ["get", "iata"],
              textSize: 12,
              textOffset: [0, 1.5],
              textAnchor: "top",
              textColor: [
                "case",
                ["==", ["get", "iata"], waypointIatas[1] ?? ""],
                VIA_COLOR,
                Colors.text,
              ],
              textOpacity: 1,
              textHaloColor: Colors.surface,
              textHaloWidth: 3,
              textHaloBlur: 0.5,
              textAllowOverlap: true,
              textIgnorePlacement: true,
            }}
          />
        </MapboxGL.ShapeSource>
      ) : null}

      {selectedAirport ? (
        <MapboxGL.ShapeSource id="selected-source" shape={selectedGeoJSON}>
          <MapboxGL.CircleLayer
            id="selected-airport-outer"
            existing={false}
            style={{
              circleRadius: zoomRadius(13, 22, 34),
              circleColor: "transparent",
              circleOpacity: 0,
              circleStrokeColor: Colors.orange,
              circleStrokeWidth: 2,
              circleStrokeOpacity: 0.45,
              circlePitchAlignment: "map",
            }}
          />
          <MapboxGL.CircleLayer
            id="selected-airport-inner"
            existing={false}
            style={{
              circleRadius: zoomRadius(8, 13, 20),
              circleColor: "transparent",
              circleOpacity: 0,
              circleStrokeColor: Colors.orange,
              circleStrokeWidth: 3,
              circleStrokeOpacity: 1,
              circlePitchAlignment: "map",
            }}
          />
        </MapboxGL.ShapeSource>
      ) : null}
    </>
  );
}
