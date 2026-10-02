/** Route path shown only while the player is planning a new service. */

import { Colors } from "@/constants/theme";
import type { Airport } from "@/store";
import { useGameStore } from "@/store";
import MapboxGL from "@rnmapbox/maps";
import { useMemo } from "react";

type Coordinate = [number, number];

type PreviewProperties = {
  routeType: "direct" | "one_stop";
  stopIata: string;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function validCoordinate(airport: Airport): boolean {
  return (
    Number.isFinite(airport.lng) &&
    Number.isFinite(airport.lat) &&
    airport.lng >= -180 &&
    airport.lng <= 180 &&
    airport.lat >= -90 &&
    airport.lat <= 90
  );
}

function shortestLongitudeDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

function linearArc(
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
  const steps = Math.max(
    12,
    Math.min(72, Math.ceil(radiansToDegrees(angle) / 3)),
  );
  const sineAngle = Math.sin(angle);

  if (angle < 0.000001 || Math.abs(sineAngle) < 0.000001) {
    return linearArc(from, to, steps);
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

/**
 * The creation store keeps [origin, destination, optional stop] because the
 * destination is selected before a stop can be added from the map.
 */
function operationalOrder(waypoints: Airport[]): Airport[] {
  if (waypoints.length !== 3) return waypoints;
  const [origin, destination, stop] = waypoints;
  return [origin, stop, destination];
}

function buildPreviewFeature(
  waypoints: Airport[],
): GeoJSON.Feature<GeoJSON.LineString, PreviewProperties> | null {
  if (
    waypoints.length < 2 ||
    waypoints.some((item) => !validCoordinate(item))
  ) {
    return null;
  }

  const ordered = operationalOrder(waypoints);
  const coordinates: Coordinate[] = [];

  for (let index = 0; index < ordered.length - 1; index++) {
    const from = ordered[index];
    const to = ordered[index + 1];
    const leg = greatCircleArc([from.lng, from.lat], [to.lng, to.lat]);
    coordinates.push(...(index === 0 ? leg : leg.slice(1)));
  }

  if (coordinates.length < 2) return null;

  return {
    type: "Feature",
    id: "route-preview",
    geometry: {
      type: "LineString",
      coordinates,
    },
    properties: {
      routeType: ordered.length === 3 ? "one_stop" : "direct",
      stopIata: ordered.length === 3 ? ordered[1].iata : "",
    },
  };
}

export default function RoutePreviewLayer() {
  const routeCreationMode = useGameStore((state) => state.routeCreationMode);
  const waypoints = useGameStore((state) => state.creationWaypoints);
  const previewGeoJSON = useMemo<
    GeoJSON.FeatureCollection<GeoJSON.LineString, PreviewProperties>
  >(() => {
    const feature = routeCreationMode ? buildPreviewFeature(waypoints) : null;
    return {
      type: "FeatureCollection",
      features: feature ? [feature] : [],
    };
  }, [routeCreationMode, waypoints]);

  if (previewGeoJSON.features.length === 0) return null;

  return (
    <MapboxGL.ShapeSource id="route-preview-source" shape={previewGeoJSON}>
      <MapboxGL.LineLayer
        id="route-preview-casing"
        existing={false}
        style={{
          lineColor: Colors.surface,
          lineWidth: [
            "interpolate",
            ["linear"],
            ["zoom"],
            1,
            3,
            6,
            4.2,
            10,
            5.4,
          ],
          lineOpacity: 0.9,
          lineCap: "round",
          lineJoin: "round",
        }}
      />

      <MapboxGL.LineLayer
        id="route-preview-line"
        existing={false}
        style={{
          lineColor: Colors.skyDark,
          lineWidth: [
            "interpolate",
            ["linear"],
            ["zoom"],
            1,
            1.2,
            6,
            2,
            10,
            2.8,
          ],
          lineOpacity: 1,
          lineDasharray: [2.5, 1.5],
          lineCap: "round",
          lineJoin: "round",
        }}
      />
    </MapboxGL.ShapeSource>
  );
}
