/**
 * Restrained map representation of simulated rival networks.
 *
 * Rival operations remain fully active in the simulation. The map shows only
 * the routes that are most relevant to the player so their own network stays
 * visually dominant and mobile rendering remains predictable.
 */

import { Colors } from "@/constants/theme";
import { buildAIRoutes } from "@/lib/AIAirline";
import { dailyFlights } from "@/lib/revenue";
import { distNm } from "@/lib/routing";
import { seedHash } from "@/lib/seed";
import type { Airport } from "@/store";
import {
  useAIAirlines,
  useAirports,
  useDayProgress,
  useGameStore,
} from "@/store";
import MapboxGL from "@rnmapbox/maps";
import { useMemo } from "react";

const MAX_VISIBLE_ROUTES = 8;
const MAX_VISIBLE_PLANES = 3;

type Coordinate = [number, number];

interface RivalMapRoute {
  id: string;
  aiId: string;
  airlineCode: string;
  airlineColor: string;
  origin: Airport;
  dest: Airport;
  points: Coordinate[];
  phaseOffset: number;
  dailyCycles: number;
  directCompetition: boolean;
  touchesPlayerHub: boolean;
  activeMarket: boolean;
  relevance: number;
}

interface RivalPlaneState {
  id: string;
  airlineCode: string;
  airlineColor: string;
  lng: number;
  lat: number;
  rotation: number;
  directCompetition: boolean;
}

type RivalRouteProperties = {
  airlineCode: string;
  airlineColor: string;
  directCompetition: boolean;
  touchesPlayerHub: boolean;
};

type RivalPlaneProperties = {
  airlineCode: string;
  airlineColor: string;
  rotation: number;
  directCompetition: boolean;
};

function corridorKey(originIata: string, destinationIata: string): string {
  return [originIata, destinationIata].sort().join(":");
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function shortestLongitudeDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

function fallbackArc(
  from: Coordinate,
  to: Coordinate,
  steps: number,
): Coordinate[] {
  const longitudeDelta = shortestLongitudeDelta(from[0], to[0]);

  return Array.from({ length: steps + 1 }, (_, index) => {
    const progress = index / steps;
    return [
      from[0] + longitudeDelta * progress,
      from[1] + (to[1] - from[1]) * progress,
    ];
  });
}

function greatCircleArc(from: Coordinate, to: Coordinate): Coordinate[] {
  const fromLongitude = degreesToRadians(from[0]);
  const fromLatitude = degreesToRadians(from[1]);
  const toLongitude = degreesToRadians(to[0]);
  const toLatitude = degreesToRadians(to[1]);
  const fromVector = [
    Math.cos(fromLatitude) * Math.cos(fromLongitude),
    Math.cos(fromLatitude) * Math.sin(fromLongitude),
    Math.sin(fromLatitude),
  ];
  const toVector = [
    Math.cos(toLatitude) * Math.cos(toLongitude),
    Math.cos(toLatitude) * Math.sin(toLongitude),
    Math.sin(toLatitude),
  ];
  const dot = clamp(
    fromVector[0] * toVector[0] +
      fromVector[1] * toVector[1] +
      fromVector[2] * toVector[2],
    -1,
    1,
  );
  const angle = Math.acos(dot);
  const angleDegrees = radiansToDegrees(angle);
  const steps = Math.max(12, Math.min(72, Math.ceil(angleDegrees / 3)));
  const sineAngle = Math.sin(angle);

  if (angle < 0.000001 || Math.abs(sineAngle) < 0.000001) {
    return fallbackArc(from, to, steps);
  }

  const points: Coordinate[] = [];
  let previousLongitude = from[0];

  for (let index = 0; index <= steps; index++) {
    const progress = index / steps;
    const fromWeight = Math.sin((1 - progress) * angle) / sineAngle;
    const toWeight = Math.sin(progress * angle) / sineAngle;
    const x = fromWeight * fromVector[0] + toWeight * toVector[0];
    const y = fromWeight * fromVector[1] + toWeight * toVector[1];
    const z = fromWeight * fromVector[2] + toWeight * toVector[2];
    const magnitude = Math.sqrt(x * x + y * y + z * z) || 1;

    let longitude = radiansToDegrees(Math.atan2(y, x));
    const latitude = radiansToDegrees(Math.asin(clamp(z / magnitude, -1, 1)));

    while (longitude - previousLongitude > 180) longitude -= 360;
    while (longitude - previousLongitude < -180) longitude += 360;

    points.push([longitude, latitude]);
    previousLongitude = longitude;
  }

  return points;
}

function bearing(from: Coordinate, to: Coordinate): number {
  const longitudeDelta = degreesToRadians(to[0] - from[0]);
  const fromLatitude = degreesToRadians(from[1]);
  const toLatitude = degreesToRadians(to[1]);
  const y = Math.sin(longitudeDelta) * Math.cos(toLatitude);
  const x =
    Math.cos(fromLatitude) * Math.sin(toLatitude) -
    Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(longitudeDelta);

  return (radiansToDegrees(Math.atan2(y, x)) + 360) % 360;
}

function compareByRelevance(left: RivalMapRoute, right: RivalMapRoute) {
  if (left.relevance !== right.relevance) {
    return right.relevance - left.relevance;
  }

  return left.id.localeCompare(right.id);
}

function selectWithAirlineCoverage(
  routes: RivalMapRoute[],
  airlineIds: string[],
  limit: number,
): RivalMapRoute[] {
  if (routes.length <= limit) return [...routes].sort(compareByRelevance);

  const ranked = [...routes].sort(compareByRelevance);
  if (airlineIds.length >= limit) return ranked.slice(0, limit);

  const selected: RivalMapRoute[] = [];
  const selectedIds = new Set<string>();

  airlineIds.forEach((airlineId) => {
    const representative = ranked.find((route) => route.aiId === airlineId);
    if (!representative || selected.length >= limit) return;

    selected.push(representative);
    selectedIds.add(representative.id);
  });

  ranked.forEach((route) => {
    if (selected.length >= limit || selectedIds.has(route.id)) return;
    selected.push(route);
    selectedIds.add(route.id);
  });

  return selected.sort(compareByRelevance);
}

function visualCruiseSpeed(distanceNm: number): number {
  if (distanceNm < 900) return 330;
  if (distanceNm < 3_500) return 450;
  return 500;
}

function planeStateForRoute(
  route: RivalMapRoute,
  dayProgress: number,
): RivalPlaneState {
  const finalIndex = route.points.length - 1;

  if (finalIndex < 1) {
    return {
      id: route.id,
      airlineCode: route.airlineCode,
      airlineColor: route.airlineColor,
      lng: route.origin.lng,
      lat: route.origin.lat,
      rotation: 0,
      directCompetition: route.directCompetition,
    };
  }

  const rawPhase =
    (clamp(dayProgress, 0, 1) * route.dailyCycles * 2 + route.phaseOffset) % 2;
  const outbound = rawPhase <= 1;
  const progress = outbound ? rawPhase : 2 - rawPhase;
  const exactPoint = progress * finalIndex;
  const segmentIndex = Math.max(
    0,
    Math.min(finalIndex - 1, Math.floor(exactPoint)),
  );
  const segmentProgress = exactPoint - segmentIndex;
  const segmentStart = route.points[segmentIndex];
  const segmentEnd = route.points[segmentIndex + 1];

  return {
    id: route.id,
    airlineCode: route.airlineCode,
    airlineColor: route.airlineColor,
    lng: segmentStart[0] + (segmentEnd[0] - segmentStart[0]) * segmentProgress,
    lat: segmentStart[1] + (segmentEnd[1] - segmentStart[1]) * segmentProgress,
    rotation: outbound
      ? bearing(segmentStart, segmentEnd)
      : bearing(segmentEnd, segmentStart),
    directCompetition: route.directCompetition,
  };
}

export default function AIRouteLayer({
  paused = false,
}: {
  paused?: boolean;
  speed?: number;
}) {
  const aiAirlines = useAIAirlines();
  const airports = useAirports();
  const dayProgress = useDayProgress();
  const marketKey = useGameStore((state) =>
    state.demands
      .map((demand) => corridorKey(demand.origin.iata, demand.dest.iata))
      .sort()
      .join("|"),
  );
  const playerRouteKey = useGameStore((state) =>
    state.routes
      .filter((route) => route.active)
      .map((route) =>
        corridorKey(route.demand.origin.iata, route.demand.dest.iata),
      )
      .sort()
      .join("|"),
  );
  const playerHubKey = useGameStore((state) =>
    state.hubs
      .map((hub) => hub.airport.iata)
      .sort()
      .join("|"),
  );
  const routeCreationMode = useGameStore((state) => state.routeCreationMode);

  const marketCorridors = useMemo(
    () => new Set(marketKey ? marketKey.split("|") : []),
    [marketKey],
  );
  const playerRouteCorridors = useMemo(
    () => new Set(playerRouteKey ? playerRouteKey.split("|") : []),
    [playerRouteKey],
  );
  const playerHubIatas = useMemo(
    () => new Set(playerHubKey ? playerHubKey.split("|") : []),
    [playerHubKey],
  );

  const candidateRoutes = useMemo<RivalMapRoute[]>(
    () =>
      aiAirlines.flatMap((airline) =>
        buildAIRoutes(airline, airports).flatMap((route) => {
          const corridor = corridorKey(route.origin.iata, route.dest.iata);
          const directCompetition = playerRouteCorridors.has(corridor);
          const touchesPlayerHub =
            playerHubIatas.has(route.origin.iata) ||
            playerHubIatas.has(route.dest.iata);
          const activeMarket = marketCorridors.has(corridor);
          if (!directCompetition && !touchesPlayerHub && !activeMarket) {
            return [];
          }

          const distance = distNm(route.origin, route.dest);
          const cruiseSpeed = visualCruiseSpeed(distance);

          return [
            {
              id: route.id,
              aiId: airline.id,
              airlineCode: airline.code,
              airlineColor: airline.color,
              origin: route.origin,
              dest: route.dest,
              points: greatCircleArc(
                [route.origin.lng, route.origin.lat],
                [route.dest.lng, route.dest.lat],
              ),
              phaseOffset: seedHash(route.id, "map-phase") / 50_000,
              dailyCycles: dailyFlights(distance, cruiseSpeed),
              directCompetition,
              touchesPlayerHub,
              activeMarket,
              relevance: directCompetition ? 3 : touchesPlayerHub ? 2 : 1,
            },
          ];
        }),
      ),
    [
      aiAirlines,
      airports,
      marketCorridors,
      playerHubIatas,
      playerRouteCorridors,
    ],
  );

  const airlineIds = useMemo(
    () => aiAirlines.map((airline) => airline.id),
    [aiAirlines],
  );
  const visibleRoutes = useMemo(
    () =>
      selectWithAirlineCoverage(
        candidateRoutes,
        airlineIds,
        MAX_VISIBLE_ROUTES,
      ),
    [airlineIds, candidateRoutes],
  );
  const planeRoutes = useMemo(
    () =>
      selectWithAirlineCoverage(visibleRoutes, airlineIds, MAX_VISIBLE_PLANES),
    [airlineIds, visibleRoutes],
  );

  const routeGeoJSON = useMemo<
    GeoJSON.FeatureCollection<GeoJSON.LineString, RivalRouteProperties>
  >(
    () => ({
      type: "FeatureCollection",
      features: visibleRoutes.map((route) => ({
        type: "Feature",
        id: route.id,
        geometry: {
          type: "LineString",
          coordinates: route.points,
        },
        properties: {
          airlineCode: route.airlineCode,
          airlineColor: route.airlineColor,
          directCompetition: route.directCompetition,
          touchesPlayerHub: route.touchesPlayerHub,
        },
      })),
    }),
    [visibleRoutes],
  );

  const planes = useMemo(
    () =>
      routeCreationMode
        ? []
        : planeRoutes.map((route) => planeStateForRoute(route, dayProgress)),
    [dayProgress, planeRoutes, routeCreationMode],
  );

  const planeGeoJSON = useMemo<
    GeoJSON.FeatureCollection<GeoJSON.Point, RivalPlaneProperties>
  >(
    () => ({
      type: "FeatureCollection",
      features: planes.map((plane) => ({
        type: "Feature",
        id: `rival-plane-${plane.id}`,
        geometry: {
          type: "Point",
          coordinates: [plane.lng, plane.lat],
        },
        properties: {
          airlineCode: plane.airlineCode,
          airlineColor: plane.airlineColor,
          rotation: plane.rotation,
          directCompetition: plane.directCompetition,
        },
      })),
    }),
    [planes],
  );

  if (visibleRoutes.length === 0) return null;

  const subdued = paused || routeCreationMode;

  return (
    <>
      <MapboxGL.ShapeSource id="ai-routes-source" shape={routeGeoJSON}>
        <MapboxGL.LineLayer
          id="ai-competing-route-casing"
          existing={false}
          filter={["==", ["get", "directCompetition"], true]}
          style={{
            lineColor: Colors.surface,
            lineWidth: [
              "interpolate",
              ["linear"],
              ["zoom"],
              1,
              2.2,
              6,
              3,
              10,
              3.8,
            ],
            lineOpacity: subdued ? 0.28 : 0.72,
            lineCap: "round",
            lineJoin: "round",
          }}
        />

        <MapboxGL.LineLayer
          id="ai-competing-route-line"
          existing={false}
          filter={["==", ["get", "directCompetition"], true]}
          style={{
            lineColor: ["get", "airlineColor"],
            lineWidth: [
              "interpolate",
              ["linear"],
              ["zoom"],
              1,
              1,
              6,
              1.6,
              10,
              2.2,
            ],
            lineOpacity: subdued ? 0.38 : 0.82,
            lineCap: "round",
            lineJoin: "round",
          }}
        />

        <MapboxGL.LineLayer
          id="ai-context-route-line"
          existing={false}
          filter={["==", ["get", "directCompetition"], false]}
          style={{
            lineColor: ["get", "airlineColor"],
            lineWidth: [
              "interpolate",
              ["linear"],
              ["zoom"],
              1,
              0.55,
              6,
              0.9,
              10,
              1.2,
            ],
            lineOpacity: [
              "case",
              ["get", "touchesPlayerHub"],
              subdued ? 0.13 : 0.34,
              subdued ? 0.07 : 0.2,
            ],
            lineDasharray: [1, 3],
            lineCap: "round",
            lineJoin: "round",
          }}
        />
      </MapboxGL.ShapeSource>

      {planes.length > 0 ? (
        <MapboxGL.ShapeSource id="ai-planes-source" shape={planeGeoJSON}>
          <MapboxGL.SymbolLayer
            id="ai-plane-icon"
            existing={false}
            style={{
              iconImage: "airport-15",
              iconSize: [
                "interpolate",
                ["linear"],
                ["zoom"],
                1,
                0.5,
                6,
                0.72,
                10,
                0.95,
              ],
              iconColor: ["get", "airlineColor"],
              iconHaloColor: Colors.surface,
              iconHaloWidth: 0.7,
              iconOpacity: subdued ? 0.3 : 0.58,
              iconRotate: ["get", "rotation"],
              iconRotationAlignment: "map",
              iconAllowOverlap: true,
              iconIgnorePlacement: true,
              iconPitchAlignment: "map",
            }}
          />
          <MapboxGL.SymbolLayer
            id="ai-plane-airline-code"
            existing={false}
            minZoomLevel={4.5}
            style={{
              textField: ["get", "airlineCode"],
              textSize: ["interpolate", ["linear"], ["zoom"], 4.5, 8, 10, 10],
              textOffset: [0, 1.25],
              textAnchor: "top",
              textColor: Colors.text,
              textOpacity: subdued ? 0.24 : 0.72,
              textHaloColor: Colors.surface,
              textHaloWidth: 2,
              textAllowOverlap: false,
              textIgnorePlacement: false,
            }}
          />
        </MapboxGL.ShapeSource>
      ) : null}
    </>
  );
}
