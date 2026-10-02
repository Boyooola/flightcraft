/**
 * components/map/GameMap.tsx
 *
 * Main mobile map component. Wires together the geographic map, airports,
 * active routes, aircraft movement, and route-planning interaction.
 *
 * Airport tap logic:
 *   Normal mode: open AirportSheet for that airport.
 *   Route creation: require an owned origin, then select a destination and
 *   one optional stop before review.
 */

import {
  Colors,
  MAP_STYLE_URL,
  MIN_TOUCH,
  Spacing,
  Typography,
} from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { useHudHeight, useTabBarHeight } from "@/hooks/useSheetLayout";
import type { Airport } from "@/store";
import { useAirline, useGameStore, useHubs } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import MapboxGL from "@rnmapbox/maps";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AIRouteLayer from "./AIRouteLayer";
import AirportLayer from "./AirportLayer";
import RouteLayer from "./RouteLayer";
import RoutePreviewLayer from "./RoutePreviewLayer";

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "";
if (MAPBOX_TOKEN) {
  MapboxGL.setAccessToken(MAPBOX_TOKEN);
} else if (__DEV__) {
  console.warn(
    "[GameMap] EXPO_PUBLIC_MAPBOX_TOKEN is not set. Map will not render.",
  );
}

const DEFAULT_CENTER = [20, 20];

interface GameMapProps {
  onMapReady?: () => void;
}

export default function GameMap({ onMapReady }: GameMapProps) {
  const airline = useAirline();
  const hubs = useHubs();
  const hudHeight = useHudHeight();
  const tabBarHeight = useTabBarHeight();
  const { tap, warning } = useHaptics();
  const cameraRef = useRef<MapboxGL.Camera>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mapNotice, setMapNotice] = useState<string | null>(null);
  const [mapLoadFailed, setMapLoadFailed] = useState(!MAPBOX_TOKEN);
  const [mapAttempt, setMapAttempt] = useState(0);
  const routeCreationMode = useGameStore((s) => s.routeCreationMode);
  const creationWaypoints = useGameStore((s) => s.creationWaypoints);

  const speed = airline?.speed ?? 1;
  const cameraPadding = useMemo(
    () => ({
      paddingTop: hudHeight + Spacing.md,
      paddingRight: Spacing.md,
      paddingBottom: tabBarHeight + Spacing.md,
      paddingLeft: Spacing.md,
    }),
    [hudHeight, tabBarHeight],
  );
  const defaultCamera = useMemo(
    () => ({
      centerCoordinate: DEFAULT_CENTER,
      zoomLevel: 2.5,
      padding: cameraPadding,
      animationDuration: 0,
    }),
    [cameraPadding],
  );

  const prevHubCount = useRef(0);
  useEffect(() => {
    if (hubs.length > 0 && prevHubCount.current === 0) {
      const hub = hubs[0].airport;
      cameraRef.current?.setCamera({
        centerCoordinate: [hub.lng, hub.lat],
        zoomLevel: 4.5,
        padding: cameraPadding,
        animationDuration: 800,
        animationMode: "flyTo",
      });
    }
    prevHubCount.current = hubs.length;
  }, [cameraPadding, hubs]);

  useEffect(() => {
    if (!MAPBOX_TOKEN) onMapReady?.();
  }, [onMapReady]);

  const showMapNotice = useCallback((message: string) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setMapNotice(message);
    noticeTimer.current = setTimeout(() => {
      setMapNotice(null);
      noticeTimer.current = null;
    }, 2800);
  }, []);

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  const handleAirportPress = useCallback(
    (airport: Airport) => {
      const {
        routeCreationMode: isCreating,
        creationWaypoints: waypoints,
        hubs: currentHubs,
        selectedPlane,
        addWaypoint,
        clearRouteCreation,
        openSheet,
      } = useGameStore.getState();

      if (isCreating) {
        const alreadySelected = waypoints.some(
          (waypoint) => waypoint.iata === airport.iata,
        );
        if (alreadySelected) {
          warning();
          showMapNotice(`${airport.iata} is already part of this route.`);
          return;
        }

        if (waypoints.length === 0) {
          if (currentHubs.length === 0) {
            warning();
            clearRouteCreation();
            openSheet("airport", airport);
            showMapNotice(
              `Build your first hub at ${airport.iata} before opening a route.`,
            );
            return;
          }

          const isOwnedHub = currentHubs.some(
            (hub) => hub.airport.iata === airport.iata,
          );
          if (!isOwnedHub) {
            warning();
            showMapNotice(
              `Choose one of your hubs as the origin. ${airport.iata} is not owned.`,
            );
            return;
          }
        }

        if (waypoints.length >= 3) {
          warning();
          showMapNotice(
            "A route can use one optional stop. Review or remove an airport first.",
          );
          openSheet(
            "create-route",
            undefined,
            undefined,
            undefined,
            selectedPlane,
          );
          return;
        }

        tap();
        addWaypoint(airport);

        if (waypoints.length + 1 >= 2) {
          openSheet(
            "create-route",
            undefined,
            undefined,
            undefined,
            selectedPlane,
          );
        }
        return;
      }

      tap();
      openSheet("airport", airport);
    },
    [showMapNotice, tap, warning],
  );

  const waypointIatas = useMemo(
    () => creationWaypoints.map((airport) => airport.iata),
    [creationWaypoints],
  );

  const handleMapReady = useCallback(() => {
    setMapLoadFailed(false);
    onMapReady?.();
  }, [onMapReady]);

  const handleMapError = useCallback(() => {
    setMapLoadFailed(true);
    onMapReady?.();
  }, [onMapReady]);

  const retryMap = useCallback(() => {
    if (!MAPBOX_TOKEN) return;
    setMapLoadFailed(false);
    setMapAttempt((attempt) => attempt + 1);
  }, []);

  return (
    <View style={s.root}>
      {MAPBOX_TOKEN ? (
        <MapboxGL.MapView
          key={`operations-map-${mapAttempt}`}
          style={s.map}
          styleURL={MAP_STYLE_URL}
          projection="mercator"
          tintColor={Colors.sky}
          logoEnabled={false}
          attributionEnabled={false}
          compassEnabled={false}
          scaleBarEnabled={false}
          onDidFinishLoadingMap={handleMapReady}
          onMapLoadingError={handleMapError}
          rotateEnabled={false}
          pitchEnabled={false}
        >
          <MapboxGL.Camera
            ref={cameraRef}
            defaultSettings={defaultCamera}
            minZoomLevel={2.2}
            maxZoomLevel={12}
          />

          <AirportLayer
            onAirportPress={handleAirportPress}
            routeCreationMode={routeCreationMode}
            waypointIatas={waypointIatas}
          />

          <AIRouteLayer paused={speed === 0} />

          <RouteLayer paused={speed === 0} />

          <RoutePreviewLayer />
        </MapboxGL.MapView>
      ) : (
        <View style={s.map} />
      )}

      {mapLoadFailed ? (
        <View accessibilityRole="alert" style={s.mapError}>
          <Ionicons name="map-outline" size={24} color={Colors.skyDark} />
          <Text style={s.mapErrorTitle}>Map unavailable</Text>
          <Text style={s.mapErrorMessage}>
            {MAPBOX_TOKEN
              ? "Check your connection, then try loading the map again."
              : "The map service has not been configured for this build."}
          </Text>
          {MAPBOX_TOKEN ? (
            <TouchableOpacity
              accessibilityLabel="Retry loading the operations map"
              accessibilityRole="button"
              activeOpacity={0.72}
              onPress={retryMap}
              style={s.retryButton}
            >
              <Text style={s.retryButtonText}>Retry map</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {mapNotice ? (
        <View
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          pointerEvents="none"
          style={[s.notice, { bottom: tabBarHeight + Spacing.md }]}
        >
          <Ionicons
            name="alert-circle-outline"
            size={18}
            color={Colors.amber}
          />
          <Text style={s.noticeText}>{mapNotice}</Text>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  map: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  mapError: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
    backgroundColor: Colors.bg,
  },
  mapErrorTitle: {
    marginTop: Spacing.sm,
    color: Colors.text,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
    fontWeight: "700",
  },
  mapErrorMessage: {
    maxWidth: 320,
    marginTop: Spacing.xs,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    textAlign: "center",
  },
  retryButton: {
    minWidth: 132,
    minHeight: MIN_TOUCH,
    marginTop: Spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.skyDark,
    borderRadius: 4,
  },
  retryButtonText: {
    color: Colors.textOnColor,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    fontWeight: "700",
  },
  notice: {
    position: "absolute",
    left: Spacing.lg,
    right: Spacing.lg,
    zIndex: 40,
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.borderSection,
  },
  noticeText: {
    flex: 1,
    color: Colors.text,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
  },
});
