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
import { useAirline, useGameStore } from "@/store";
import MapboxGL from "@rnmapbox/maps";
import { useCallback, useRef } from "react";
import { StyleSheet, View } from "react-native";
import AIRouteLayer from "./AIRouteLayer";
import AirportLayer from "./AirportLayer";
import RouteLayer from "./RouteLayer";
import RoutePreviewLayer from "./RoutePreviewLayer";

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
  const mapRef = useRef<MapboxGL.MapView>(null);
  const routeCreationMode = useGameStore((s) => s.routeCreationMode);
  const creationWaypoints = useGameStore((s) => s.creationWaypoints);

  const color = airline?.color ?? "#38BDF8";
  const speed = airline?.speed ?? 1;

  // ── Airport tap handler ──────────────────────────────────────────
  const handleAirportPress = useCallback((airport: Airport) => {
    // Read fresh from store — never use closure state inside callbacks
    // that trigger store updates (causes infinite re-render loops)
    const {
      routeCreationMode: isCreating,
      creationWaypoints: waypoints,
      hubs: currentHubs,
      addWaypoint: addWpt,
      openSheet: open,
    } = useGameStore.getState();

    if (isCreating) {
      if (waypoints.length === 0) {
        const isOwnedHub = currentHubs.some(
          (h) => h.airport.iata === airport.iata,
        );
        if (!isOwnedHub) {
          addWpt(airport);
          return;
        }
      }
      addWpt(airport);
      // Check new length after adding
      if (waypoints.length + 1 >= 2) {
        open("create-route");
      }
      return;
    }

    // Normal mode
    useGameStore.getState().openSheet("airport", airport);
  }, []); // no deps — always reads fresh from store

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

        {/* Hide Mapbox default city/place dots and labels */}
        {[
          "settlement-label",
          "settlement-subdivision-label",
          "place-label",
          "place-city-label",
          "place-town-label",
          "place-village-label",
          "poi-label",
          "transit-label",
          "airport-label",
          "water-point-label",
          "natural-point-label",
          "settlement-minor-label",
          "settlement-major-label",
        ].map((id) => (
          <MapboxGL.SymbolLayer
            key={id}
            id={`hide-${id}`}
            sourceID="composite"
            sourceLayerID={id}
            existing
            style={{ visibility: "none" }}
          />
        ))}

        {/* AI routes — rendered behind player routes */}
        <AIRouteLayer />

        <RouteLayer airlineColor={color} speed={speed} paused={speed === 0} />

        {/* Preview arc during route creation */}
        <RoutePreviewLayer airlineColor={color} />
      </MapboxGL.MapView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  map: { flex: 1 },
});
