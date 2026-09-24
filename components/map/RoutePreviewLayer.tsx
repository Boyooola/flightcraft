/**
 * Live flight-plan preview shown while the player selects route waypoints.
 */

import { Colors, Palette } from "@/constants/theme";
import { useGameStore } from "@/store";
import MapboxGL from "@rnmapbox/maps";

const ARC_STEPS = 40;

function buildArc(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number,
  steps = ARC_STEPS,
): [number, number][] {
  const points: [number, number][] = [];

  for (let index = 0; index <= steps; index++) {
    const progress = index / steps;
    const longitude = lng1 + (lng2 - lng1) * progress;
    const latitude = lat1 + (lat2 - lat1) * progress;
    const span = Math.abs(lng2 - lng1);
    const curve = Math.sin(progress * Math.PI) * span * 0.12;

    points.push([longitude, latitude + curve]);
  }

  return points;
}

function bearing(
  [lng1, lat1]: [number, number],
  [lng2, lat2]: [number, number],
) {
  const longitudeDelta = ((lng2 - lng1) * Math.PI) / 180;
  const latitude1 = (lat1 * Math.PI) / 180;
  const latitude2 = (lat2 * Math.PI) / 180;
  const y = Math.sin(longitudeDelta) * Math.cos(latitude2);
  const x =
    Math.cos(latitude1) * Math.sin(latitude2) -
    Math.sin(latitude1) *
      Math.cos(latitude2) *
      Math.cos(longitudeDelta);

  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export default function RoutePreviewLayer({
  airlineColor,
}: {
  airlineColor: string;
}) {
  const routeCreationMode = useGameStore((state) => state.routeCreationMode);
  const waypoints = useGameStore((state) => state.creationWaypoints);

  if (!routeCreationMode || waypoints.length === 0) return null;

  const arcFeatures: GeoJSON.Feature[] = [];
  const directionFeatures: GeoJSON.Feature[] = [];

  for (let index = 0; index < waypoints.length - 1; index++) {
    const from = waypoints[index];
    const to = waypoints[index + 1];
    const points = buildArc(from.lng, from.lat, to.lng, to.lat);
    const middleIndex = Math.floor(points.length / 2);
    const middle = points[middleIndex];
    const next = points[Math.min(middleIndex + 1, points.length - 1)];

    arcFeatures.push({
      type: "Feature",
      id: `preview-arc-${index}`,
      geometry: {
        type: "LineString",
        coordinates: points,
      },
      properties: {
        segment: index + 1,
      },
    });

    directionFeatures.push({
      type: "Feature",
      id: `preview-direction-${index}`,
      geometry: {
        type: "Point",
        coordinates: middle,
      },
      properties: {
        rotation: bearing(middle, next),
      },
    });
  }

  const waypointFeatures: GeoJSON.Feature[] = waypoints.map(
    (waypoint, index) => {
      const isOrigin = index === 0;
      const isDestination =
        waypoints.length > 1 && index === waypoints.length - 1;
      const isStop = !isOrigin && !isDestination;
      const role = isOrigin ? "ORIGIN" : isStop ? "STOP" : "DEST";

      return {
        type: "Feature",
        id: `preview-waypoint-${index}`,
        geometry: {
          type: "Point",
          coordinates: [waypoint.lng, waypoint.lat],
        },
        properties: {
          index,
          isOrigin,
          isStop,
          isDestination,
          displayLabel: `${index + 1}  ${role} · ${waypoint.iata}`,
        },
      };
    },
  );

  const arcGeoJSON: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: arcFeatures,
  };
  const directionGeoJSON: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: directionFeatures,
  };
  const waypointGeoJSON: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: waypointFeatures,
  };

  const roleColor: any = [
    "case",
    ["get", "isOrigin"],
    airlineColor,
    ["get", "isStop"],
    Colors.purple,
    Colors.green,
  ];
  const roleFill: any = [
    "case",
    ["get", "isOrigin"],
    Colors.surface,
    ["get", "isStop"],
    Palette.violetSoft,
    Palette.greenSoft,
  ];

  return (
    <>
      {arcFeatures.length > 0 ? (
        <>
          <MapboxGL.ShapeSource id="route-preview-arc" shape={arcGeoJSON}>
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
                  5,
                  6,
                  7,
                  10,
                  9,
                ],
                lineOpacity: 0.94,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
            <MapboxGL.LineLayer
              id="route-preview-line"
              existing={false}
              style={{
                lineColor: airlineColor,
                lineWidth: [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  1,
                  2,
                  6,
                  3,
                  10,
                  4,
                ],
                lineOpacity: 0.95,
                lineDasharray: [2, 1.6],
                lineCap: "round",
                lineJoin: "round",
              }}
            />
          </MapboxGL.ShapeSource>

          <MapboxGL.ShapeSource
            id="route-preview-directions"
            shape={directionGeoJSON}
          >
            <MapboxGL.SymbolLayer
              id="route-preview-direction-arrows"
              existing={false}
              style={{
                textField: "➤",
                textSize: [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  1,
                  11,
                  6,
                  15,
                  10,
                  18,
                ],
                textColor: airlineColor,
                textHaloColor: Colors.surface,
                textHaloWidth: 2.5,
                textHaloBlur: 0.5,
                textRotate: ["get", "rotation"],
                textRotationAlignment: "map",
                textAllowOverlap: true,
                textIgnorePlacement: true,
              }}
            />
          </MapboxGL.ShapeSource>
        </>
      ) : null}

      <MapboxGL.ShapeSource
        id="route-preview-waypoints"
        shape={waypointGeoJSON}
      >
        <MapboxGL.CircleLayer
          id="route-preview-waypoint-ring"
          existing={false}
          style={{
            circleRadius: [
              "interpolate",
              ["linear"],
              ["zoom"],
              1,
              11,
              6,
              17,
              10,
              25,
            ],
            circleColor: "transparent",
            circleOpacity: 0,
            circleStrokeColor: roleColor,
            circleStrokeWidth: 2,
            circleStrokeOpacity: 0.35,
            circlePitchAlignment: "map",
          }}
        />

        <MapboxGL.CircleLayer
          id="route-preview-waypoint-disc"
          existing={false}
          style={{
            circleRadius: [
              "interpolate",
              ["linear"],
              ["zoom"],
              1,
              5,
              6,
              8,
              10,
              12,
            ],
            circleColor: roleFill,
            circleOpacity: 1,
            circleStrokeColor: roleColor,
            circleStrokeWidth: 3,
            circleStrokeOpacity: 1,
            circlePitchAlignment: "map",
          }}
        />

        <MapboxGL.CircleLayer
          id="route-preview-waypoint-core"
          existing={false}
          style={{
            circleRadius: [
              "interpolate",
              ["linear"],
              ["zoom"],
              1,
              1.5,
              6,
              2.5,
              10,
              4,
            ],
            circleColor: roleColor,
            circleOpacity: 1,
            circlePitchAlignment: "map",
          }}
        />

        <MapboxGL.SymbolLayer
          id="route-preview-waypoint-labels"
          existing={false}
          style={{
            textField: ["get", "displayLabel"],
            textSize: ["interpolate", ["linear"], ["zoom"], 1, 9, 6, 11, 10, 12],
            textColor: roleColor,
            textHaloColor: Colors.surface,
            textHaloWidth: 3,
            textHaloBlur: 0.5,
            textOffset: [0, 1.75],
            textAnchor: "top",
            textFont: ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
            textAllowOverlap: true,
            textIgnorePlacement: true,
          }}
        />
      </MapboxGL.ShapeSource>
    </>
  );
}
