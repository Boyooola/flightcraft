/**
 * components/map/GameMap.tsx
 *
 * Main mobile map component. Wires together:
 *   - Mapbox GL map
 *   - AirportLayer (dots + tap handling)
 *   - RouteLayer (animated planes)
 *
 * Airport tap logic:
 *   Normal mode      → open AirportSheet for that airport
 *   Route creation   → add airport as waypoint (hub first, then dest)
 *                      when 2+ waypoints, open CreateRouteSheet
 */

import type { Airport } from "@/store";
import { useAirline, useGameStore, useHubs } from "@/store";
import MapboxGL from "@rnmapbox/maps";
import { useCallback, useRef } from "react";
import { StyleSheet, View } from "react-native";
import AirportLayer from "./AirportLayer";
import RouteLayer from "./RouteLayer";

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "";
MapboxGL.setAccessToken(MAPBOX_TOKEN);

// Default camera — world view
const DEFAULT_CAMERA = {
  centerCoordinate: [114.0, 15.0],
  zoomLevel: 2.8,
  animationDuration: 0,
};

interface GameMapProps {
  airlineColor: string;
  onMapReady?: () => void;
}

export default function GameMap({ airlineColor, onMapReady }: GameMapProps) {
  const airline = useAirline();
  const hubs = useHubs();
  const mapRef = useRef<MapboxGL.MapView>(null);

  const openSheet = useGameStore((s) => s.openSheet);
  const addWaypoint = useGameStore((s) => s.addWaypoint);
  const creationWaypoints = useGameStore((s) => s.creationWaypoints);
  const routeCreationMode = useGameStore((s) => s.routeCreationMode);

  const color = airline?.color ?? "#38BDF8";
  const speed = airline?.speed ?? 1;

  // ── Airport tap handler ──────────────────────────────────────────
  const handleAirportPress = useCallback(
    (airport: Airport) => {
      if (routeCreationMode) {
        // Route creation: add waypoint
        // If no waypoints yet, first tap should be a hub the player owns
        if (creationWaypoints.length === 0) {
          const isOwnedHub = hubs.some((h) => h.airport.iata === airport.iata);
          if (!isOwnedHub) {
            // Tap on non-hub first — still add it, CreateRouteSheet will validate
            addWaypoint(airport);
            return;
          }
        }

        addWaypoint(airport);

        // After 2 waypoints open the CreateRouteSheet
        const newLength = creationWaypoints.length + 1;
        if (newLength >= 2) {
          openSheet("create-route");
        }
        return;
      }

      // Normal mode — open airport sheet
      openSheet("airport", airport);
    },
    [routeCreationMode, creationWaypoints, hubs, addWaypoint, openSheet],
  );

  const waypointIatas = creationWaypoints.map((a) => a.iata);

  return (
    <View style={s.root}>
      <MapboxGL.MapView
        ref={mapRef}
        style={s.map}
        styleURL={MapboxGL.StyleURL.Dark}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
        onDidFinishLoadingMap={onMapReady}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        <MapboxGL.Camera
          defaultSettings={DEFAULT_CAMERA}
          minZoomLevel={1.5}
          maxZoomLevel={12}
        />

        <AirportLayer
          airlineColor={color}
          onAirportPress={handleAirportPress}
          routeCreationMode={routeCreationMode}
          waypointIatas={waypointIatas}
        />

        <RouteLayer airlineColor={color} speed={speed} paused={speed === 0} />
      </MapboxGL.MapView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  map: { flex: 1 },
});
