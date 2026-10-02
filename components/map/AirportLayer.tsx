/**
 * Airport markers for the operations map.
 *
 * Ordinary airports stay quiet so routes and aircraft remain dominant. Owned
 * hubs, rival hubs, route waypoints, and the current selection are promoted
 * only when they help the player make a decision.
 */

import { Colors } from "@/constants/theme";
import type { AIAirline } from "@/lib/AIAirline";
import { hubCrowdingLevel, type CrowdingLevel } from "@/lib/demands";
import type { FlowDemand } from "@/lib/passengerFlow";
import type { Airport, AirportTier, Demand, OwnedHub } from "@/store";
import {
  useAIAirlines,
  useAirports,
  useDemands,
  useHubs,
  useRoutes,
  useSelectedAirport,
} from "@/store";
import type { CircleLayerStyle } from "@rnmapbox/maps";
import MapboxGL from "@rnmapbox/maps";
import { useCallback, useMemo } from "react";

const TIER_IMPORTANCE: Record<AirportTier, number> = {
  mega: 6,
  large: 5,
  major: 4,
  regional: 3,
  minor: 2,
  local: 1,
};

type AirportProperties = {
  iata: string;
  importance: number;
};

type HubProperties = AirportProperties & {
  label: string;
  crowding: CrowdingLevel;
};

type RivalHubProperties = AirportProperties & {
  airlineCode: string;
  airlineName: string;
  color: string;
  label: string;
};

type WaypointRole = "Origin" | "Stop" | "Destination";

type WaypointProperties = AirportProperties & {
  role: WaypointRole;
  roleCode: "O" | "S" | "D";
  label: string;
};

type OpportunityProperties = AirportProperties & {
  label: string;
};

function airportFeature(
  airport: Airport,
): GeoJSON.Feature<GeoJSON.Point, AirportProperties> {
  return {
    type: "Feature",
    id: airport.iata,
    geometry: {
      type: "Point",
      coordinates: [airport.lng, airport.lat],
    },
    properties: {
      iata: airport.iata,
      importance: TIER_IMPORTANCE[airport.tier],
    },
  };
}

function airportsToGeoJSON(
  airports: Airport[],
): GeoJSON.FeatureCollection<GeoJSON.Point, AirportProperties> {
  return {
    type: "FeatureCollection",
    features: airports.map(airportFeature),
  };
}

function hubLabel(iata: string, crowding: CrowdingLevel): string {
  if (crowding === "crisis") return `${iata}  Crisis`;
  if (crowding === "overcrowded") return `${iata}  Crowded`;
  if (crowding === "busy") return `${iata}  Busy`;
  return iata;
}

function hubsToGeoJSON(
  hubs: OwnedHub[],
  demands: FlowDemand[],
): GeoJSON.FeatureCollection<GeoJSON.Point, HubProperties> {
  return {
    type: "FeatureCollection",
    features: hubs.map((hub) => {
      const airport = hub.airport;
      const crowding = hubCrowdingLevel(airport.iata, demands, airport).level;

      return {
        type: "Feature",
        id: airport.iata,
        geometry: {
          type: "Point",
          coordinates: [airport.lng, airport.lat],
        },
        properties: {
          iata: airport.iata,
          importance: TIER_IMPORTANCE[airport.tier],
          crowding,
          label: hubLabel(airport.iata, crowding),
        },
      };
    }),
  };
}

function rivalHubsToGeoJSON(
  aiAirlines: AIAirline[],
  airportByIata: Map<string, Airport>,
  visibleIatas: Set<string>,
): GeoJSON.FeatureCollection<GeoJSON.Point, RivalHubProperties> {
  const ownerByIata = new Map<string, AIAirline>();

  aiAirlines.forEach((airline) => {
    airline.hubIatas.forEach((iata) => {
      if (visibleIatas.has(iata) && !ownerByIata.has(iata)) {
        ownerByIata.set(iata, airline);
      }
    });
  });

  return {
    type: "FeatureCollection",
    features: Array.from(ownerByIata.entries()).flatMap(([iata, airline]) => {
      const airport = airportByIata.get(iata);
      if (!airport) return [];

      return [
        {
          type: "Feature" as const,
          id: `rival-hub-${airport.iata}`,
          geometry: {
            type: "Point" as const,
            coordinates: [airport.lng, airport.lat],
          },
          properties: {
            iata: airport.iata,
            importance: TIER_IMPORTANCE[airport.tier],
            airlineCode: airline.code,
            airlineName: airline.name,
            color: airline.color,
            label: `${airport.iata}  ${airline.code}`,
          },
        },
      ];
    }),
  };
}

function waypointRole(index: number, count: number): WaypointRole {
  if (index === 0) return "Origin";

  // creationWaypoints stores [origin, destination, optional stop]. The route
  // itself flies [origin, stop, destination], so selection numbers are unsafe.
  if (count === 3 && index === 2) return "Stop";
  return "Destination";
}

function roleCode(role: WaypointRole): "O" | "S" | "D" {
  if (role === "Origin") return "O";
  if (role === "Stop") return "S";
  return "D";
}

function waypointsToGeoJSON(
  airports: Airport[],
  waypointIatas: string[],
): GeoJSON.FeatureCollection<GeoJSON.Point, WaypointProperties> {
  const airportByIata = new Map(
    airports.map((airport) => [airport.iata, airport]),
  );

  return {
    type: "FeatureCollection",
    features: waypointIatas.flatMap((iata, index) => {
      const airport = airportByIata.get(iata);
      if (!airport) return [];

      const role = waypointRole(index, waypointIatas.length);
      return [
        {
          type: "Feature" as const,
          id: airport.iata,
          geometry: {
            type: "Point" as const,
            coordinates: [airport.lng, airport.lat],
          },
          properties: {
            iata: airport.iata,
            importance: TIER_IMPORTANCE[airport.tier],
            role,
            roleCode: roleCode(role),
            label: `${role}  ${airport.iata}`,
          },
        },
      ];
    }),
  };
}

function opportunitiesToGeoJSON(
  demands: Demand[],
  activeDemandIds: Set<string>,
  hiddenIatas: Set<string>,
): GeoJSON.FeatureCollection<GeoJSON.Point, OpportunityProperties> {
  const destinations = new Map<string, Airport>();

  demands.forEach((demand) => {
    if (activeDemandIds.has(demand.id) || hiddenIatas.has(demand.dest.iata)) {
      return;
    }

    destinations.set(demand.dest.iata, demand.dest);
  });

  return {
    type: "FeatureCollection",
    features: Array.from(destinations.values()).map((airport) => ({
      type: "Feature",
      id: `opportunity-${airport.iata}`,
      geometry: {
        type: "Point",
        coordinates: [airport.lng, airport.lat],
      },
      properties: {
        iata: airport.iata,
        importance: TIER_IMPORTANCE[airport.tier],
        label: `${airport.iata}  Route available`,
      },
    })),
  };
}

const AIRPORT_RADIUS = [
  "interpolate",
  ["linear"],
  ["zoom"],
  2,
  ["interpolate", ["linear"], ["get", "importance"], 1, 0.7, 6, 2.2],
  6,
  ["interpolate", ["linear"], ["get", "importance"], 1, 1.4, 6, 4],
  10,
  ["interpolate", ["linear"], ["get", "importance"], 1, 2.4, 6, 6.5],
] as CircleLayerStyle["circleRadius"];

const HUB_RADIUS = [
  "interpolate",
  ["linear"],
  ["zoom"],
  2,
  5,
  6,
  8,
  10,
  12,
] as CircleLayerStyle["circleRadius"];

const WAYPOINT_RADIUS = [
  "interpolate",
  ["linear"],
  ["zoom"],
  2,
  7,
  6,
  10,
  10,
  13,
] as CircleLayerStyle["circleRadius"];

const OPPORTUNITY_RADIUS = [
  "interpolate",
  ["linear"],
  ["zoom"],
  2,
  5,
  6,
  8,
  10,
  11,
] as CircleLayerStyle["circleRadius"];

interface AirportLayerProps {
  routeCreationMode: boolean;
  waypointIatas: string[];
  onAirportPress: (airport: Airport) => void;
}

export default function AirportLayer({
  onAirportPress,
  routeCreationMode,
  waypointIatas,
}: AirportLayerProps) {
  const airports = useAirports();
  const hubs = useHubs();
  const demands = useDemands();
  const routes = useRoutes();
  const selectedAirport = useSelectedAirport();
  const aiAirlines = useAIAirlines();

  const airportByIata = useMemo(
    () => new Map(airports.map((airport) => [airport.iata, airport])),
    [airports],
  );
  const ownedHubIatas = useMemo(
    () => new Set(hubs.map((hub) => hub.airport.iata)),
    [hubs],
  );
  const activeDemandIds = useMemo(
    () =>
      new Set(
        routes.filter((route) => route.active).map((route) => route.demand.id),
      ),
    [routes],
  );
  const opportunityIatas = useMemo(
    () =>
      new Set(
        demands
          .filter((demand) => !activeDemandIds.has(demand.id))
          .map((demand) => demand.dest.iata),
      ),
    [activeDemandIds, demands],
  );
  const relevantMarketIatas = useMemo(
    () =>
      new Set(
        demands.flatMap((demand) => [demand.origin.iata, demand.dest.iata]),
      ),
    [demands],
  );
  const rivalHubIatas = useMemo(
    () =>
      new Set(
        aiAirlines
          .flatMap((airline) => airline.hubIatas)
          .filter(
            (iata) =>
              !routeCreationMode &&
              !ownedHubIatas.has(iata) &&
              !opportunityIatas.has(iata) &&
              relevantMarketIatas.has(iata),
          ),
      ),
    [
      aiAirlines,
      opportunityIatas,
      ownedHubIatas,
      relevantMarketIatas,
      routeCreationMode,
    ],
  );
  const waypointIataSet = useMemo(
    () => new Set(waypointIatas),
    [waypointIatas],
  );
  const hiddenOpportunityIatas = useMemo(() => {
    const hidden = new Set(waypointIatas);
    if (selectedAirport) hidden.add(selectedAirport.iata);
    return hidden;
  }, [selectedAirport, waypointIatas]);
  const promotedIatas = useMemo(
    () =>
      new Set([
        ...ownedHubIatas,
        ...rivalHubIatas,
        ...opportunityIatas,
        ...waypointIataSet,
      ]),
    [opportunityIatas, ownedHubIatas, rivalHubIatas, waypointIataSet],
  );

  const hitGeoJSON = useMemo(() => airportsToGeoJSON(airports), [airports]);
  const regularGeoJSON = useMemo(
    () =>
      airportsToGeoJSON(
        airports.filter((airport) => !promotedIatas.has(airport.iata)),
      ),
    [airports, promotedIatas],
  );
  const ownedGeoJSON = useMemo(
    () => hubsToGeoJSON(hubs, demands),
    [demands, hubs],
  );
  const rivalGeoJSON = useMemo(
    () => rivalHubsToGeoJSON(aiAirlines, airportByIata, rivalHubIatas),
    [aiAirlines, airportByIata, rivalHubIatas],
  );
  const waypointGeoJSON = useMemo(
    () => waypointsToGeoJSON(airports, waypointIatas),
    [airports, waypointIatas],
  );
  const opportunityGeoJSON = useMemo(
    () =>
      opportunitiesToGeoJSON(demands, activeDemandIds, hiddenOpportunityIatas),
    [activeDemandIds, demands, hiddenOpportunityIatas],
  );
  const selectedGeoJSON = useMemo(
    () =>
      airportsToGeoJSON(
        selectedAirport && !waypointIataSet.has(selectedAirport.iata)
          ? [selectedAirport]
          : [],
      ),
    [selectedAirport, waypointIataSet],
  );

  const handlePress = useCallback(
    (event: { features?: GeoJSON.Feature[] }) => {
      const value = event.features?.[0]?.properties?.iata;
      if (typeof value !== "string") return;

      const airport = airportByIata.get(value);
      if (airport) onAirportPress(airport);
    },
    [airportByIata, onAirportPress],
  );

  if (airports.length === 0) return null;

  return (
    <>
      <MapboxGL.ShapeSource
        id="airport-hit-source"
        shape={hitGeoJSON}
        onPress={handlePress}
        hitbox={{ width: 44, height: 44 }}
      >
        <MapboxGL.CircleLayer
          id="airport-hit-target"
          existing={false}
          style={{
            circleRadius: 5,
            circleColor: Colors.surface,
            circleOpacity: 0.01,
            circleStrokeWidth: 0,
            circlePitchAlignment: "map",
          }}
        />
      </MapboxGL.ShapeSource>

      {regularGeoJSON.features.length > 0 ? (
        <MapboxGL.ShapeSource
          id="regular-airports-source"
          shape={regularGeoJSON}
        >
          <MapboxGL.CircleLayer
            id="regular-airport-dot"
            existing={false}
            style={{
              circleRadius: AIRPORT_RADIUS,
              circleColor: Colors.muted,
              circleOpacity: routeCreationMode ? 0.68 : 0.5,
              circleStrokeColor: Colors.surface,
              circleStrokeWidth: 1,
              circleStrokeOpacity: 0.82,
              circlePitchAlignment: "map",
            }}
          />

          <MapboxGL.SymbolLayer
            id="priority-airport-label"
            existing={false}
            minZoomLevel={routeCreationMode ? 3.25 : 4.75}
            filter={[">=", ["get", "importance"], 4]}
            style={{
              textField: ["get", "iata"],
              textSize: ["interpolate", ["linear"], ["zoom"], 3.25, 9, 9, 11],
              textOffset: [0, 1.1],
              textAnchor: "top",
              textColor: Colors.text,
              textOpacity: routeCreationMode ? 0.78 : 0.86,
              textHaloColor: Colors.surface,
              textHaloWidth: 2,
              textAllowOverlap: false,
              textIgnorePlacement: false,
              symbolSortKey: ["get", "importance"],
            }}
          />

          <MapboxGL.SymbolLayer
            id="local-airport-label"
            existing={false}
            minZoomLevel={routeCreationMode ? 6.5 : 8}
            filter={["<", ["get", "importance"], 4]}
            style={{
              textField: ["get", "iata"],
              textSize: 10,
              textOffset: [0, 1.05],
              textAnchor: "top",
              textColor: Colors.muted,
              textOpacity: routeCreationMode ? 0.74 : 0.8,
              textHaloColor: Colors.surface,
              textHaloWidth: 2,
              textAllowOverlap: false,
              textIgnorePlacement: false,
              symbolSortKey: ["get", "importance"],
            }}
          />
        </MapboxGL.ShapeSource>
      ) : null}

      {rivalGeoJSON.features.length > 0 ? (
        <MapboxGL.ShapeSource id="rival-hubs-source" shape={rivalGeoJSON}>
          <MapboxGL.CircleLayer
            id="rival-hub-marker"
            existing={false}
            style={{
              circleRadius: HUB_RADIUS,
              circleColor: ["get", "color"],
              circleOpacity: routeCreationMode ? 0.55 : 1,
              circleStrokeColor: Colors.surface,
              circleStrokeWidth: 2.5,
              circleStrokeOpacity: routeCreationMode ? 0.6 : 1,
              circlePitchAlignment: "map",
            }}
          />
          <MapboxGL.SymbolLayer
            id="rival-hub-airline-code"
            existing={false}
            style={{
              textField: ["get", "airlineCode"],
              textSize: ["interpolate", ["linear"], ["zoom"], 2, 7, 10, 10],
              textColor: Colors.textOnColor,
              textOpacity: routeCreationMode ? 0.62 : 1,
              textHaloWidth: 0,
              textAllowOverlap: true,
              textIgnorePlacement: true,
            }}
          />
          <MapboxGL.SymbolLayer
            id="rival-hub-label"
            existing={false}
            minZoomLevel={4.5}
            style={{
              textField: ["get", "label"],
              textSize: ["interpolate", ["linear"], ["zoom"], 3.5, 9, 9, 11],
              textOffset: [0, 1.35],
              textAnchor: "top",
              textColor: Colors.text,
              textOpacity: routeCreationMode ? 0.52 : 0.9,
              textHaloColor: Colors.surface,
              textHaloWidth: 2,
              textAllowOverlap: false,
              textIgnorePlacement: false,
            }}
          />
        </MapboxGL.ShapeSource>
      ) : null}

      {opportunityGeoJSON.features.length > 0 ? (
        <MapboxGL.ShapeSource
          id="route-opportunities-source"
          shape={opportunityGeoJSON}
        >
          <MapboxGL.CircleLayer
            id="route-opportunity-marker"
            existing={false}
            style={{
              circleRadius: OPPORTUNITY_RADIUS,
              circleColor: Colors.surface,
              circleOpacity: 1,
              circleStrokeColor: Colors.sky,
              circleStrokeWidth: 2,
              circleStrokeOpacity: 1,
              circlePitchAlignment: "map",
            }}
          />
          <MapboxGL.CircleLayer
            id="route-opportunity-center"
            existing={false}
            style={{
              circleRadius: [
                "interpolate",
                ["linear"],
                ["zoom"],
                2,
                1.5,
                10,
                3,
              ],
              circleColor: Colors.sky,
              circleOpacity: 1,
              circlePitchAlignment: "map",
            }}
          />
          <MapboxGL.SymbolLayer
            id="route-opportunity-label"
            existing={false}
            minZoomLevel={3.25}
            style={{
              textField: ["get", "label"],
              textSize: ["interpolate", ["linear"], ["zoom"], 3.25, 9, 9, 11],
              textOffset: [0, 1.35],
              textAnchor: "top",
              textColor: Colors.skyDark,
              textOpacity: 1,
              textHaloColor: Colors.surface,
              textHaloWidth: 2.5,
              textAllowOverlap: false,
              textIgnorePlacement: false,
            }}
          />
        </MapboxGL.ShapeSource>
      ) : null}

      {ownedGeoJSON.features.length > 0 ? (
        <MapboxGL.ShapeSource id="owned-hubs-source" shape={ownedGeoJSON}>
          <MapboxGL.CircleLayer
            id="owned-hub-status"
            existing={false}
            filter={["!=", ["get", "crowding"], "normal"]}
            style={{
              circleRadius: [
                "interpolate",
                ["linear"],
                ["zoom"],
                2,
                8,
                6,
                13,
                10,
                19,
              ],
              circleColor: "transparent",
              circleOpacity: 0,
              circleStrokeColor: [
                "case",
                ["==", ["get", "crowding"], "crisis"],
                Colors.red,
                Colors.amber,
              ],
              circleStrokeWidth: [
                "case",
                ["==", ["get", "crowding"], "crisis"],
                2.5,
                ["==", ["get", "crowding"], "overcrowded"],
                2,
                1.5,
              ],
              circleStrokeOpacity: 0.92,
              circlePitchAlignment: "map",
            }}
          />
          <MapboxGL.CircleLayer
            id="owned-hub-marker"
            existing={false}
            style={{
              circleRadius: HUB_RADIUS,
              circleColor: Colors.sky,
              circleOpacity: 1,
              circleStrokeColor: Colors.surface,
              circleStrokeWidth: 2.5,
              circleStrokeOpacity: 1,
              circlePitchAlignment: "map",
            }}
          />
          <MapboxGL.SymbolLayer
            id="owned-hub-label"
            existing={false}
            minZoomLevel={2.5}
            style={{
              textField: ["get", "label"],
              textSize: ["interpolate", ["linear"], ["zoom"], 2.5, 10, 9, 12],
              textOffset: [0, 1.35],
              textAnchor: "top",
              textColor: Colors.text,
              textOpacity: 1,
              textHaloColor: Colors.surface,
              textHaloWidth: 2.5,
              textAllowOverlap: true,
              textIgnorePlacement: true,
            }}
          />
        </MapboxGL.ShapeSource>
      ) : null}

      {routeCreationMode && waypointGeoJSON.features.length > 0 ? (
        <MapboxGL.ShapeSource
          id="route-waypoints-source"
          shape={waypointGeoJSON}
        >
          <MapboxGL.CircleLayer
            id="route-waypoint-marker"
            existing={false}
            style={{
              circleRadius: WAYPOINT_RADIUS,
              circleColor: Colors.skyDark,
              circleOpacity: 1,
              circleStrokeColor: Colors.surface,
              circleStrokeWidth: 2.5,
              circleStrokeOpacity: 1,
              circlePitchAlignment: "map",
            }}
          />
          <MapboxGL.SymbolLayer
            id="route-waypoint-role-code"
            existing={false}
            style={{
              textField: ["get", "roleCode"],
              textSize: ["interpolate", ["linear"], ["zoom"], 2, 9, 9, 12],
              textColor: Colors.textOnColor,
              textOpacity: 1,
              textAllowOverlap: true,
              textIgnorePlacement: true,
            }}
          />
          <MapboxGL.SymbolLayer
            id="route-waypoint-label"
            existing={false}
            style={{
              textField: ["get", "label"],
              textSize: ["interpolate", ["linear"], ["zoom"], 2, 10, 9, 12],
              textOffset: [0, 1.55],
              textAnchor: "top",
              textColor: Colors.skyDark,
              textOpacity: 1,
              textHaloColor: Colors.surface,
              textHaloWidth: 3,
              textAllowOverlap: true,
              textIgnorePlacement: true,
            }}
          />
        </MapboxGL.ShapeSource>
      ) : null}

      {selectedGeoJSON.features.length > 0 ? (
        <MapboxGL.ShapeSource
          id="selected-airport-source"
          shape={selectedGeoJSON}
        >
          <MapboxGL.CircleLayer
            id="selected-airport-marker"
            existing={false}
            style={{
              circleRadius: [
                "interpolate",
                ["linear"],
                ["zoom"],
                2,
                8,
                6,
                12,
                10,
                17,
              ],
              circleColor: "transparent",
              circleOpacity: 0,
              circleStrokeColor: Colors.sky,
              circleStrokeWidth: 3,
              circleStrokeOpacity: 1,
              circlePitchAlignment: "map",
            }}
          />
          <MapboxGL.SymbolLayer
            id="selected-airport-label"
            existing={false}
            style={{
              textField: ["get", "iata"],
              textSize: 12,
              textOffset: [0, 1.55],
              textAnchor: "top",
              textColor: Colors.skyDark,
              textOpacity: 1,
              textHaloColor: Colors.surface,
              textHaloWidth: 3,
              textAllowOverlap: true,
              textIgnorePlacement: true,
            }}
          />
        </MapboxGL.ShapeSource>
      ) : null}
    </>
  );
}
