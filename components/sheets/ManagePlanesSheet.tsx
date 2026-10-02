/**
 * Individual aircraft operations for one model group.
 *
 * Each aircraft exposes only actions that are valid for its current state:
 * flying aircraft can be unassigned, idle aircraft can be dispatched or sold,
 * and worn idle aircraft can be serviced.
 */

import { AirlineBrandMark } from "@/components/airline-identity";
import { GameAlert, useGameAlert } from "@/components/ui/GameAlert";
import {
  Colors,
  MIN_TOUCH,
  Radius,
  Spacing,
  Typography,
} from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import {
  useDeactivateRoute,
  useMaintenancePlane,
  useSellPlane,
} from "@/hooks/useSupabaseWrite";
import { DEFAULT_AIRLINE_LOGO_ID, getAirlinePalette } from "@/lib/airlineBrand";
import { fmtCash } from "@/lib/revenue";
import type { OwnedPlane, Route } from "@/store";
import {
  useAirline,
  useGameStore,
  useRoutes,
  useSelectedPlaneGroup,
} from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type BusyAction = "unassign" | "service" | "sell";

interface BusyState {
  planeId: string;
  action: BusyAction;
}

function InlineError({ message }: { message: string }) {
  return (
    <View accessibilityRole="alert" style={styles.errorNotice}>
      <Ionicons name="warning-outline" size={18} color={Colors.red} />
      <View style={styles.errorCopy}>
        <Text style={styles.errorTitle}>Aircraft not updated</Text>
        <Text style={styles.errorMessage}>{message}</Text>
      </View>
    </View>
  );
}

function ActionButton({
  label,
  icon,
  kind,
  loading,
  disabled,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  kind: "primary" | "secondary" | "danger";
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const primary = kind === "primary";
  const danger = kind === "danger";
  const color = primary
    ? Colors.textOnColor
    : danger
      ? Colors.red
      : Colors.skyDark;

  return (
    <TouchableOpacity
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled }}
      activeOpacity={0.7}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.actionButton,
        primary && styles.actionButtonPrimary,
        disabled && styles.actionButtonDisabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <>
          <Ionicons name={icon} size={17} color={color} />
          <Text
            style={[
              styles.actionButtonText,
              primary && styles.actionButtonTextPrimary,
              danger && styles.actionButtonTextDanger,
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

function AircraftRow({
  plane,
  index,
  airlineCode,
  route,
  busy,
  onAssign,
  onMaintain,
  onSell,
  onUnassign,
}: {
  plane: OwnedPlane;
  index: number;
  airlineCode: string;
  route: Route | null;
  busy: BusyState | null;
  onAssign: () => void;
  onMaintain: () => void;
  onSell: () => void;
  onUnassign: () => void;
}) {
  const condition = Math.round(plane.condition ?? 100);
  const needsMaintenance = condition <= 40;
  const conditionColor =
    condition <= 15
      ? Colors.red
      : condition <= 40
        ? Colors.amber
        : Colors.green;
  const isFlying = Boolean(route);
  const isBusy = busy?.planeId === plane.id;
  const maintenanceCost = 5_000 + plane.plane_model.pax_capacity * 50;
  const salePrice = Math.round(plane.plane_model.price * 0.4);
  const routeLabel = route
    ? `${route.demand.origin.iata}${route.via_iata ? ` to ${route.via_iata}` : ""} to ${route.demand.dest.iata}`
    : "Not assigned";

  return (
    <View style={styles.aircraftRow}>
      <View style={styles.aircraftHeader}>
        <View style={styles.aircraftIdentity}>
          <Text style={styles.aircraftNumber}>
            Aircraft {index + 1} · {airlineCode}
          </Text>
          <Text numberOfLines={1} style={styles.routeLabel}>
            {routeLabel}
          </Text>
        </View>
        <View style={styles.operatingStatus}>
          <Ionicons
            name={isFlying ? "airplane-outline" : "pause-circle-outline"}
            size={15}
            color={isFlying ? Colors.green : Colors.muted}
          />
          <Text
            style={[
              styles.operatingStatusText,
              { color: isFlying ? Colors.green : Colors.muted },
            ]}
          >
            {isFlying ? "Flying" : "Idle"}
          </Text>
        </View>
      </View>

      <View style={styles.conditionHeader}>
        <Text style={styles.conditionLabel}>Aircraft condition</Text>
        <Text style={[styles.conditionValue, { color: conditionColor }]}>
          {condition}%
        </Text>
      </View>
      <View style={styles.conditionTrack}>
        <View
          style={[
            styles.conditionFill,
            {
              width: `${condition}%` as `${number}%`,
              backgroundColor: conditionColor,
            },
          ]}
        />
      </View>

      {needsMaintenance ? (
        <Text style={styles.conditionHelp}>
          {isFlying
            ? "Unassign this aircraft before servicing it."
            : `Service restores condition to 100% for ${fmtCash(maintenanceCost)}.`}
        </Text>
      ) : null}

      <View style={styles.actions}>
        {isFlying ? (
          <ActionButton
            disabled={Boolean(busy)}
            icon="close-circle-outline"
            kind="danger"
            label="Unassign route"
            loading={isBusy && busy?.action === "unassign"}
            onPress={onUnassign}
          />
        ) : (
          <>
            {needsMaintenance ? (
              <ActionButton
                disabled={Boolean(busy)}
                icon="construct-outline"
                kind="primary"
                label={`Service ${fmtCash(maintenanceCost)}`}
                loading={isBusy && busy?.action === "service"}
                onPress={onMaintain}
              />
            ) : (
              <ActionButton
                disabled={Boolean(busy)}
                icon="airplane-outline"
                kind="primary"
                label="Assign route"
                onPress={onAssign}
              />
            )}
            <ActionButton
              disabled={Boolean(busy)}
              icon="cash-outline"
              kind="secondary"
              label={`Sell ${fmtCash(salePrice)}`}
              loading={isBusy && busy?.action === "sell"}
              onPress={onSell}
            />
          </>
        )}
      </View>
    </View>
  );
}

export default function ManagePlanesSheet() {
  const tabBarHeight = useTabBarHeight();
  const deactivateRoute = useDeactivateRoute();
  const maintainPlane = useMaintenancePlane();
  const sellPlane = useSellPlane();
  const haptics = useHaptics();
  const gameAlert = useGameAlert();
  const routes = useRoutes();
  const group = useSelectedPlaneGroup();
  const airline = useAirline();
  const openSheet = useGameStore((state) => state.openSheet);
  const closeSheet = useGameStore((state) => state.closeSheet);
  const [busy, setBusy] = useState<BusyState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const defaultPalette = getAirlinePalette("aviation-blue");
  const airlineName = airline?.name ?? "Your airline";
  const airlineCode = airline?.airline_code ?? "AIR";
  const airlineLogoId = airline?.logo_id ?? DEFAULT_AIRLINE_LOGO_ID;
  const airlinePrimaryColor = airline?.color ?? defaultPalette.primary;
  const airlineSecondaryColor =
    airline?.secondary_color ?? defaultPalette.secondary;

  const routesByPlane = useMemo(() => {
    const map = new Map<string, Route>();
    routes
      .filter((route) => route.active)
      .forEach((route) => map.set(route.plane.id, route));
    return map;
  }, [routes]);

  const handleUnassign = useCallback(
    async (plane: OwnedPlane) => {
      const route = routesByPlane.get(plane.id);
      if (!route || busy) return;

      haptics.confirm();
      setBusy({ planeId: plane.id, action: "unassign" });
      setError(null);

      try {
        const result = await deactivateRoute(route.id);
        if (result.error) {
          setError(result.error);
          haptics.error();
          return;
        }
        haptics.success();
      } catch {
        setError("Unable to unassign this aircraft. Try again.");
        haptics.error();
      } finally {
        setBusy(null);
      }
    },
    [busy, deactivateRoute, haptics, routesByPlane],
  );

  const handleMaintain = useCallback(
    async (plane: OwnedPlane) => {
      if (busy) return;

      haptics.confirm();
      setBusy({ planeId: plane.id, action: "service" });
      setError(null);

      try {
        const result = await maintainPlane(plane.id);
        if (result.error) {
          setError(result.error);
          haptics.error();
          return;
        }
        haptics.success();
      } catch {
        setError("Unable to service this aircraft. Try again.");
        haptics.error();
      } finally {
        setBusy(null);
      }
    },
    [busy, haptics, maintainPlane],
  );

  const sellConfirmed = useCallback(
    async (plane: OwnedPlane) => {
      if (busy) return;

      setBusy({ planeId: plane.id, action: "sell" });
      setError(null);

      try {
        const result = await sellPlane(plane.id);
        if (result.error) {
          setError(result.error);
          haptics.error();
          return;
        }

        haptics.success();
        const remaining = group?.planes.filter(
          (candidate) => candidate.id !== plane.id,
        );
        if (remaining?.length === 0) closeSheet();
      } catch {
        setError("Unable to sell this aircraft. Try again.");
        haptics.error();
      } finally {
        setBusy(null);
      }
    },
    [busy, closeSheet, group?.planes, haptics, sellPlane],
  );

  const confirmSale = useCallback(
    (plane: OwnedPlane) => {
      const salePrice = Math.round(plane.plane_model.price * 0.4);
      haptics.confirm();
      gameAlert.show({
        icon: "cash-outline",
        title: "Sell aircraft",
        message: `Sell this ${plane.plane_model.nickname} for ${fmtCash(salePrice)}? This cannot be undone.`,
        buttons: [
          { label: "Keep aircraft", style: "cancel" },
          {
            label: "Sell aircraft",
            style: "destructive",
            onPress: () => sellConfirmed(plane),
          },
        ],
      });
    },
    [gameAlert, haptics, sellConfirmed],
  );

  if (!group) {
    return (
      <View style={[styles.missingState, { paddingBottom: tabBarHeight }]}>
        <Text style={styles.missingTitle}>Aircraft unavailable</Text>
        <Text style={styles.missingText}>
          Return to Fleet and select an aircraft group again.
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.7}
          onPress={closeSheet}
          style={styles.closeWideButton}
        >
          <Text style={styles.closeWideButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { model, planes } = group;
  const flyingCount = planes.filter((plane) =>
    routesByPlane.has(plane.id),
  ).length;
  const idleCount = planes.length - flyingCount;

  return (
    <>
      <BottomSheetScrollView
        style={styles.root}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: tabBarHeight + Spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <AirlineBrandMark
            accessibilityLabel={`${airlineName} aircraft livery`}
            logoId={airlineLogoId}
            primary={airlinePrimaryColor}
            secondary={airlineSecondaryColor}
            size={42}
            variant="tail"
          />
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{model.nickname}</Text>
            <Text numberOfLines={1} style={styles.subtitle}>
              {airlineCode} livery · {planes.length} aircraft · {flyingCount}{" "}
              flying · {idleCount} idle
            </Text>
          </View>
          <TouchableOpacity
            accessibilityLabel="Close aircraft management"
            accessibilityRole="button"
            activeOpacity={0.7}
            onPress={closeSheet}
            style={styles.closeButton}
          >
            <Ionicons name="close" size={22} color={Colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.modelSummary}>
          <View>
            <Text style={styles.modelSummaryLabel}>Seats</Text>
            <Text style={styles.modelSummaryValue}>
              {model.pax_capacity.toLocaleString()}
            </Text>
          </View>
          <View style={styles.modelSummaryCenter}>
            <Text style={styles.modelSummaryLabel}>Range</Text>
            <Text style={styles.modelSummaryValue}>
              {model.range_nm.toLocaleString()} nm
            </Text>
          </View>
          <View style={styles.modelSummaryRight}>
            <Text style={styles.modelSummaryLabel}>New price</Text>
            <Text style={styles.modelSummaryValue}>{fmtCash(model.price)}</Text>
          </View>
        </View>

        {error ? (
          <View style={styles.errorContainer}>
            <InlineError message={error} />
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Individual aircraft</Text>
            <Text style={styles.sectionDetail}>{planes.length}</Text>
          </View>
          <View style={styles.aircraftList}>
            {planes.map((plane, index) => (
              <AircraftRow
                key={plane.id}
                airlineCode={airlineCode}
                busy={busy}
                index={index}
                onAssign={() => {
                  setError(null);
                  openSheet(
                    "assign-route",
                    undefined,
                    undefined,
                    undefined,
                    plane,
                  );
                }}
                onMaintain={() => handleMaintain(plane)}
                onSell={() => confirmSale(plane)}
                onUnassign={() => handleUnassign(plane)}
                plane={plane}
                route={routesByPlane.get(plane.id) ?? null}
              />
            ))}
          </View>
        </View>
      </BottomSheetScrollView>
      <GameAlert ref={gameAlert.ref} />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.surface },
  content: { backgroundColor: Colors.surface },
  header: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  title: {
    color: Colors.text,
    fontSize: Typography.size.title,
    lineHeight: Typography.lineHeight.title,
    fontWeight: Typography.weight.bold,
  },
  subtitle: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  closeButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.md,
  },
  modelSummary: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.borderSection,
  },
  modelSummaryCenter: { alignItems: "center" },
  modelSummaryRight: { alignItems: "flex-end" },
  modelSummaryLabel: {
    color: Colors.muted,
    fontSize: 10,
    lineHeight: 14,
  },
  modelSummaryValue: {
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    fontWeight: Typography.weight.bold,
  },
  errorContainer: {
    marginHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  errorNotice: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.borderSection,
  },
  errorCopy: { flex: 1 },
  errorTitle: {
    color: Colors.red,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    fontWeight: Typography.weight.semibold,
  },
  errorMessage: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: 17,
    marginTop: Spacing.xxs,
  },
  section: {
    marginHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
  },
  sectionHeader: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  sectionTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: Typography.weight.bold,
  },
  sectionDetail: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: Typography.size.caption,
  },
  aircraftList: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.borderSection,
  },
  aircraftRow: {
    paddingVertical: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  aircraftHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  aircraftIdentity: { flex: 1, minWidth: 0 },
  aircraftNumber: {
    color: Colors.text,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    fontWeight: Typography.weight.semibold,
  },
  routeLabel: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: 10,
    lineHeight: 14,
    marginTop: Spacing.xxs,
  },
  operatingStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  operatingStatusText: {
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
    fontWeight: Typography.weight.semibold,
  },
  conditionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  conditionLabel: { color: Colors.muted, fontSize: 10, lineHeight: 14 },
  conditionValue: {
    fontFamily: Typography.mono,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: Typography.weight.bold,
  },
  conditionTrack: {
    height: 3,
    overflow: "hidden",
    backgroundColor: Colors.inset,
  },
  conditionFill: { height: 3 },
  conditionHelp: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: 17,
    marginTop: Spacing.sm,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  actionButton: {
    flex: 1,
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.borderSection,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
  },
  actionButtonPrimary: {
    borderColor: Colors.sky,
    backgroundColor: Colors.sky,
  },
  actionButtonDisabled: { opacity: 0.55 },
  actionButtonText: {
    color: Colors.skyDark,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    fontWeight: Typography.weight.semibold,
    textAlign: "center",
  },
  actionButtonTextPrimary: { color: Colors.textOnColor },
  actionButtonTextDanger: { color: Colors.red },
  missingState: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    backgroundColor: Colors.surface,
  },
  missingTitle: {
    color: Colors.text,
    fontSize: Typography.size.title,
    lineHeight: Typography.lineHeight.title,
    fontWeight: Typography.weight.bold,
  },
  missingText: {
    color: Colors.muted,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
    marginTop: Spacing.sm,
  },
  closeWideButton: {
    minHeight: MIN_TOUCH,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.lg,
    borderRadius: Radius.md,
    backgroundColor: Colors.sky,
  },
  closeWideButtonText: {
    color: Colors.textOnColor,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.semibold,
  },
});
