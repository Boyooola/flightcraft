import { AirlineBrandMark } from "@/components/airline-identity";
import {
  Colors,
  MIN_TOUCH,
  Radius,
  Spacing,
  Typography,
} from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import { DEFAULT_AIRLINE_LOGO_ID, getAirlinePalette } from "@/lib/airlineBrand";
import { dailyInterest, fmtCash } from "@/lib/revenue";
import type { LedgerEntry, Route } from "@/store";
import {
  useAirline,
  useCash,
  useDay,
  useGameStore,
  useLedger,
  useLoan,
  useRouteEarnings,
  useRoutes,
} from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

function signedCash(value: number): string {
  if (Math.abs(value) < 0.5) return "$0";
  return value > 0 ? `+${fmtCash(value)}` : fmtCash(value);
}

function SectionHeader({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
    </View>
  );
}

function FinancialRow({
  label,
  value,
  valueColor = Colors.text,
  strong = false,
  last = false,
}: {
  label: string;
  value: string;
  valueColor?: string;
  strong?: boolean;
  last?: boolean;
}) {
  return (
    <View style={[styles.financialRow, last && styles.lastRow]}>
      <Text style={[styles.rowLabel, strong && styles.strongText]}>
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={[
          styles.rowValue,
          strong && styles.strongText,
          { color: valueColor },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function routeLabel(route: Route): string {
  const origin = route.demand.origin.iata;
  const destination = route.demand.dest.iata;
  return route.via_iata
    ? `${origin} → ${route.via_iata} → ${destination}`
    : `${origin} → ${destination}`;
}

function RouteResultRow({
  route,
  result,
  last,
}: {
  route: Route;
  result: number;
  last: boolean;
}) {
  const resultColor =
    result > 0 ? Colors.green : result < 0 ? Colors.red : Colors.muted;

  return (
    <View style={[styles.routeRow, last && styles.lastRow]}>
      <View style={styles.routeCopy}>
        <Text style={styles.routeName}>{routeLabel(route)}</Text>
        <Text numberOfLines={1} style={styles.routeMeta}>
          {route.plane.plane_model.nickname} ·{" "}
          {route.active ? "Active" : "Paused"}
        </Text>
      </View>
      <View style={styles.routeResult}>
        <Text style={[styles.routeValue, { color: resultColor }]}>
          {signedCash(result)}
        </Text>
        <Text style={styles.routeResultLabel}>Today net</Text>
      </View>
    </View>
  );
}

function LedgerRow({ entry, last }: { entry: LedgerEntry; last: boolean }) {
  const amountColor =
    entry.amount > 0
      ? Colors.green
      : entry.amount < 0
        ? Colors.red
        : Colors.muted;

  return (
    <View style={[styles.ledgerRow, last && styles.lastRow]}>
      <View style={styles.ledgerCopy}>
        <Text numberOfLines={1} style={styles.ledgerLabel}>
          {entry.label}
        </Text>
        <Text style={styles.ledgerDay}>Day {entry.day}</Text>
      </View>
      <Text style={[styles.ledgerAmount, { color: amountColor }]}>
        {signedCash(entry.amount)}
      </Text>
    </View>
  );
}

export default function FinanceSheet() {
  const airline = useAirline();
  const cash = useCash();
  const loan = useLoan();
  const day = useDay();
  const routes = useRoutes();
  const routeEarnings = useRouteEarnings();
  const ledger = useLedger();
  const tabBarHeight = useTabBarHeight();
  const closeSheet = useGameStore((state) => state.closeSheet);
  const openSheet = useGameStore((state) => state.openSheet);

  const defaultPalette = getAirlinePalette("aviation-blue");
  const airlineName = airline?.name ?? "Your airline";
  const airlineCode = airline?.airline_code ?? "AIR";
  const airlineLogoId = airline?.logo_id ?? DEFAULT_AIRLINE_LOGO_ID;
  const airlinePrimaryColor = airline?.color ?? defaultPalette.primary;
  const airlineSecondaryColor =
    airline?.secondary_color ?? defaultPalette.secondary;
  const interestRate = airline?.loan_rate ?? 5;
  const projectedInterest = dailyInterest(loan, interestRate);

  const routeResults = useMemo(
    () =>
      routes
        .filter((route) => route.active)
        .map((route) => ({
          route,
          result: routeEarnings[route.id] ?? 0,
        }))
        .sort((a, b) => b.result - a.result),
    [routeEarnings, routes],
  );

  const recentLedger = useMemo(
    () => [...ledger].sort((a, b) => b.day - a.day).slice(0, 12),
    [ledger],
  );

  const routeOperatingResult = routeResults.reduce(
    (total, item) => total + item.result,
    0,
  );
  const projectedDayResult = routeOperatingResult - projectedInterest;
  const netPosition = cash - loan;
  const resultColor =
    projectedDayResult > 0
      ? Colors.green
      : projectedDayResult < 0
        ? Colors.red
        : Colors.muted;

  return (
    <BottomSheetScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: tabBarHeight + Spacing.xxl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <AirlineBrandMark
          accessibilityLabel={`${airlineName} identity`}
          logoId={airlineLogoId}
          primary={airlinePrimaryColor}
          secondary={airlineSecondaryColor}
          size={42}
          variant="leaderboard"
        />
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Finance</Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {airlineName} · {airlineCode} · Day {day} operating statement
          </Text>
        </View>
        <TouchableOpacity
          accessibilityLabel="Close finance"
          accessibilityRole="button"
          activeOpacity={0.7}
          onPress={closeSheet}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={22} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.resultSection}>
        <Text style={styles.resultLabel}>Projected result today</Text>
        <Text style={[styles.resultValue, { color: resultColor }]}>
          {signedCash(projectedDayResult)}
        </Text>
        <Text style={styles.resultHelp}>
          Route earnings so far, less today&apos;s projected loan interest.
        </Text>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Position" />
        <View style={styles.dataTable}>
          <FinancialRow label="Available cash" value={fmtCash(cash)} />
          <FinancialRow
            label="Outstanding loan"
            value={fmtCash(loan)}
            valueColor={loan > 0 ? Colors.red : Colors.muted}
          />
          <FinancialRow
            label="Net position"
            value={signedCash(netPosition)}
            valueColor={netPosition >= 0 ? Colors.green : Colors.red}
            strong
            last
          />
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Today" />
        <View style={styles.dataTable}>
          <FinancialRow
            label="Route operating result"
            value={signedCash(routeOperatingResult)}
            valueColor={routeOperatingResult >= 0 ? Colors.green : Colors.red}
          />
          <FinancialRow
            label="Projected loan interest"
            value={
              projectedInterest > 0 ? `-${fmtCash(projectedInterest)}` : "$0"
            }
            valueColor={projectedInterest > 0 ? Colors.red : Colors.muted}
          />
          <FinancialRow
            label="Projected day result"
            value={signedCash(projectedDayResult)}
            valueColor={resultColor}
            strong
            last
          />
        </View>
      </View>

      <TouchableOpacity
        accessibilityHint="Opens borrowing and repayment controls"
        accessibilityLabel="Open bank"
        accessibilityRole="button"
        activeOpacity={0.7}
        onPress={() => openSheet("bank")}
        style={styles.bankRow}
      >
        <Ionicons name="business-outline" size={24} color={Colors.skyDark} />
        <View style={styles.bankCopy}>
          <Text style={styles.bankTitle}>Bank</Text>
          <Text style={styles.bankMeta}>
            {interestRate}% annual rate · {fmtCash(projectedInterest)} interest
            per day
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.muted} />
      </TouchableOpacity>

      <View style={styles.section}>
        <SectionHeader
          title="Route results"
          detail={`${routeResults.length} active ${routeResults.length === 1 ? "market" : "markets"}`}
        />
        {routeResults.length > 0 ? (
          <View style={styles.routeList}>
            {routeResults.map((item, index) => (
              <RouteResultRow
                key={item.route.id}
                route={item.route}
                result={item.result}
                last={index === routeResults.length - 1}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No route results yet</Text>
            <Text style={styles.emptyText}>
              Open a route and assign an aircraft to begin earning revenue.
            </Text>
          </View>
        )}
      </View>

      {recentLedger.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="Recent activity" detail="Latest 12 entries" />
          <View style={styles.ledgerList}>
            {recentLedger.map((entry, index) => (
              <LedgerRow
                key={entry.id}
                entry={entry}
                last={index === recentLedger.length - 1}
              />
            ))}
          </View>
        </View>
      ) : null}
    </BottomSheetScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  content: {
    backgroundColor: Colors.surface,
  },
  header: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: Colors.text,
    fontSize: Typography.size.title,
    lineHeight: Typography.lineHeight.title,
    fontWeight: Typography.weight.bold,
  },
  subtitle: {
    marginTop: Spacing.xxs,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
  },
  closeButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.md,
  },
  resultSection: {
    marginHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  resultLabel: {
    color: Colors.muted,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
  },
  resultValue: {
    marginTop: Spacing.xs,
    fontFamily: Typography.mono,
    fontSize: Typography.size.display,
    lineHeight: Typography.lineHeight.display,
    fontWeight: Typography.weight.bold,
  },
  resultHelp: {
    marginTop: Spacing.sm,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.body,
  },
  section: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  sectionHeader: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: Typography.weight.bold,
  },
  sectionDetail: {
    flexShrink: 1,
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    textAlign: "right",
  },
  dataTable: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  financialRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    flex: 1,
    color: Colors.muted,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
  },
  rowValue: {
    flexShrink: 0,
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
    textAlign: "right",
  },
  strongText: {
    color: Colors.text,
    fontWeight: Typography.weight.bold,
  },
  bankRow: {
    minHeight: 70,
    marginTop: Spacing.xl,
    marginHorizontal: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  bankCopy: {
    flex: 1,
    minWidth: 0,
  },
  bankTitle: {
    color: Colors.text,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
    fontWeight: Typography.weight.bold,
  },
  bankMeta: {
    marginTop: Spacing.xxs,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
  },
  routeList: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  routeRow: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  routeCopy: {
    flex: 1,
    minWidth: 0,
  },
  routeName: {
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
    fontWeight: Typography.weight.bold,
  },
  routeMeta: {
    marginTop: Spacing.xxs,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
  },
  routeResult: {
    flexShrink: 0,
    alignItems: "flex-end",
  },
  routeValue: {
    fontFamily: Typography.mono,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
    fontWeight: Typography.weight.bold,
  },
  routeResultLabel: {
    marginTop: Spacing.xxs,
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  emptyState: {
    paddingVertical: Spacing.xl,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
    fontWeight: Typography.weight.semibold,
  },
  emptyText: {
    marginTop: Spacing.xs,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.body,
  },
  ledgerList: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  ledgerRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  ledgerCopy: {
    flex: 1,
    minWidth: 0,
  },
  ledgerLabel: {
    color: Colors.text,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
  },
  ledgerDay: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  ledgerAmount: {
    flexShrink: 0,
    fontFamily: Typography.mono,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
    fontWeight: Typography.weight.semibold,
  },
});
