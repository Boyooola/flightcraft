import {
  Colors,
  MIN_TOUCH,
  Palette,
  Radius,
  Shadow,
  Spacing,
  Typography,
} from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import { dailyInterest, fmtCash, fmtCashShort } from "@/lib/revenue";
import type { Route } from "@/store";
import {
  useAirline,
  useCash,
  useDay,
  useGameStore,
  useLedger,
  useLoan,
  useOwnedPlanes,
  useRouteEarnings,
  useRoutes,
} from "@/store";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

function CashBar({ data, color }: { data: number[]; color: string }) {
  if (data.length === 0 || !data.some((v) => v !== 0)) return null;

  const max = Math.max(...data.map((v) => Math.abs(v)), 1);

  return (
    <View style={cb.wrap}>
      {data.map((v, i) => {
        const positive = v >= 0;
        const h = Math.max(4, Math.round((Math.abs(v) / max) * 54));
        return (
          <View key={i} style={cb.col}>
            <View
              style={[
                cb.bar,
                {
                  height: h,
                  backgroundColor: positive ? color : Colors.red,
                  opacity: 0.35 + (i / data.length) * 0.65,
                },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

function RouteRewardRow({ route, reward }: { route: Route; reward: number }) {
  return (
    <View style={rr.row}>
      <View style={rr.left}>
        <Text style={rr.route}>
          {route.demand.origin.iata}
          {route.via_iata ? ` → ${route.via_iata}` : ""}
          {` → ${route.demand.dest.iata}`}
        </Text>
        <Text style={rr.meta}>
          {route.plane.plane_model.nickname} ·{" "}
          {route.via_iata ? "Connecting" : "Direct"}
        </Text>
      </View>

      <View style={rr.rewardPill}>
        <Ionicons name="cash-outline" size={12} color={Colors.green} />
        <Text
          style={[
            rr.reward,
            { color: reward >= 0 ? Colors.green : Colors.red },
          ]}
        >
          {fmtCash(reward)}
        </Text>
      </View>
    </View>
  );
}

function LedgerRow({
  entry,
}: {
  entry: { day: number; label: string; amount: number; type: string };
}) {
  const positive = entry.amount >= 0;

  const icon =
    entry.type === "event"
      ? "flash-outline"
      : entry.type === "revenue"
        ? "airplane"
        : entry.type === "interest"
          ? "percent"
          : entry.type === "purchase"
            ? "cart-outline"
            : "cash-outline";

  return (
    <View style={lr.row}>
      <View
        style={[
          lr.icon,
          {
            backgroundColor: positive ? Colors.green + "16" : Colors.red + "16",
          },
        ]}
      >
        {entry.type === "interest" ? (
          <MaterialCommunityIcons
            name={icon as any}
            size={13}
            color={positive ? Colors.green : Colors.red}
          />
        ) : (
          <Ionicons
            name={icon as any}
            size={13}
            color={positive ? Colors.green : Colors.red}
          />
        )}
      </View>

      <View style={lr.body}>
        <Text style={lr.label} numberOfLines={1}>
          {entry.label}
        </Text>
        <Text style={lr.day}>Day {entry.day}</Text>
      </View>

      <Text
        style={[lr.amount, { color: positive ? Colors.green : Colors.red }]}
      >
        {fmtCashShort(entry.amount)}
      </Text>
    </View>
  );
}

function StatCard({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string;
  color: string;
  sub?: string;
}) {
  return (
    <View style={sc.card}>
      <Text style={sc.label}>{label}</Text>
      <Text style={[sc.value, { color }]}>{value}</Text>
      {sub && <Text style={sc.sub}>{sub}</Text>}
    </View>
  );
}

export default function FinanceSheet() {
  const airline = useAirline();
  const ledger = useLedger();
  const routes = useRoutes();
  const cash = useCash();
  const loan = useLoan();
  const day = useDay();
  const ownedPlanes = useOwnedPlanes();
  const tabBarH = useTabBarHeight();
  const routeEarnings = useRouteEarnings();
  const closeSheet = useGameStore((s) => s.closeSheet);
  const openSheet = useGameStore((s) => s.openSheet);

  const color = airline?.color ?? Colors.sky;

  const diffRates: Record<string, number> = { easy: 3, normal: 5, hard: 9 };
  const rate = diffRates[airline?.difficulty ?? "normal"] ?? 5;
  const interest = dailyInterest(loan, rate);

  const routeRewards = useMemo(() => {
    return routes
      .filter((r) => r.active)
      .map((r) => {
        return {
          route: r,
          reward: routeEarnings[r.id] ?? 0, // gross only — costs don't actually deduct cash
        };
      })
      .sort((a, b) => b.reward - a.reward);
  }, [routes, routeEarnings]);

  const recentLedger = useMemo(
    () =>
      [...ledger]
        .sort((a, b) => b.day - a.day || b.id.localeCompare(a.id))
        .slice(0, 30),
    [ledger],
  );

  const cashBars = useMemo(() => {
    const byDay: Record<number, number> = {};
    ledger.forEach((e) => {
      byDay[e.day] = (byDay[e.day] ?? 0) + e.amount;
    });
    return Array.from({ length: 18 }, (_, i) => {
      const d = Math.max(1, day - 17 + i);
      return byDay[d] ?? 0;
    });
  }, [ledger, day]);

  const totalRouteReward = routeRewards.reduce((sum, r) => sum + r.reward, 0);

  const activeRoutes = routes.filter((r) => r.active);
  const activePlaneIds = new Set(activeRoutes.map((r) => r.plane.id));
  const idlePlanes = ownedPlanes.filter((p) => !activePlaneIds.has(p.id));
  const maintenanceCost = idlePlanes.reduce((sum, p) => {
    // Idle maintenance: 15% of daily operating cost at min utilization
    const dailyOps =
      (p.plane_model.cost_per_sector ?? 500) * 2 +
      (p.plane_model.fuel_per_nm ?? 2) * 500;
    return sum + Math.round(dailyOps * 0.15);
  }, 0);
  const dailyNet = totalRouteReward - interest - maintenanceCost;
  const netWorth = cash - loan;
  const bestRoute =
    routeRewards.length > 0 && routeRewards[0].reward >= 0
      ? routeRewards[0]
      : null;

  return (
    <BottomSheetScrollView
      style={s.root}
      contentContainerStyle={[
        s.content,
        { paddingBottom: tabBarH + Spacing.xxl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.header}>
        <View
          style={[
            s.headerMark,
            { borderColor: color, backgroundColor: color + "14" },
          ]}
        >
          <Ionicons name="stats-chart-outline" size={20} color={color} />
        </View>
        <View style={s.headerCopy}>
          <Text style={s.kicker}>FINANCIAL CONTROL</Text>
          <Text style={s.title}>Airline Finances</Text>
          <Text style={s.subtitle}>Day {day} · cash flow and performance</Text>
        </View>
        <TouchableOpacity
          accessibilityLabel="Close airline finances"
          accessibilityRole="button"
          onPress={closeSheet}
          style={s.closeButton}
        >
          <Ionicons name="close" size={22} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={s.quickActions}>
        <TouchableOpacity
          accessibilityLabel="Open bank"
          accessibilityRole="button"
          style={s.quickButton}
          onPress={() => openSheet("bank")}
        >
          <View style={[s.quickIcon, { backgroundColor: Palette.orangeSoft }]}>
            <MaterialCommunityIcons
              name="bank-outline"
              size={17}
              color={Colors.amber}
            />
          </View>
          <View style={s.quickCopy}>
            <Text style={s.quickTitle}>Bank</Text>
            <Text style={s.quickSubtitle}>Loans and repayments</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.muted} />
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityLabel="Open airline rankings"
          accessibilityRole="button"
          style={s.quickButton}
          onPress={() => openSheet("leaderboard")}
        >
          <View style={[s.quickIcon, { backgroundColor: Colors.skyDim }]}>
            <MaterialCommunityIcons
              name="trophy-outline"
              size={17}
              color={Colors.sky}
            />
          </View>
          <View style={s.quickCopy}>
            <Text style={s.quickTitle}>Rankings</Text>
            <Text style={s.quickSubtitle}>Compare airline value</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.muted} />
        </TouchableOpacity>
      </View>

      <View style={[s.hero, dailyNet >= 0 ? s.heroPositive : s.heroNegative]}>
        <Text style={s.heroLabel}>TODAY&apos;S RESULT</Text>
        <Text
          style={[
            s.heroValue,
            { color: dailyNet >= 0 ? Colors.green : Colors.red },
          ]}
        >
          {fmtCash(dailyNet)}
        </Text>

        <View style={s.heroBreakdown}>
          <View style={s.heroLine}>
            <Ionicons name="airplane" size={12} color={Colors.green} />
            <Text style={s.heroLineLabel}>Routes</Text>
            <Text
              style={[
                s.heroLineValue,
                { color: totalRouteReward >= 0 ? Colors.green : Colors.red },
              ]}
            >
              {fmtCash(totalRouteReward)}
            </Text>
          </View>

          {interest > 0 && (
            <View style={s.heroLine}>
              <MaterialCommunityIcons
                name="percent"
                size={12}
                color={Colors.red}
              />
              <Text style={s.heroLineLabel}>Loan interest</Text>
              <Text style={[s.heroLineValue, { color: Colors.red }]}>
                -{fmtCash(interest)}
              </Text>
            </View>
          )}

          {maintenanceCost > 0 && (
            <View style={s.heroLine}>
              <Ionicons
                name="construct-outline"
                size={12}
                color={Colors.amber}
              />
              <Text style={s.heroLineLabel}>Idle aircraft upkeep</Text>
              <Text style={[s.heroLineValue, { color: Colors.red }]}>
                -{fmtCash(maintenanceCost)}
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={s.statsRow}>
        <StatCard
          label="Cash"
          value={fmtCash(cash)}
          color={cash < 100_000 ? Colors.red : Colors.green}
        />
        <StatCard
          label="Net worth"
          value={fmtCashShort(netWorth)}
          color={netWorth >= 0 ? Colors.green : Colors.red}
        />
        <StatCard
          label="Loan"
          value={fmtCash(loan)}
          color={loan > 0 ? Colors.red : Colors.dim}
          sub={loan > 0 ? `${fmtCash(interest)}/day` : "clear"}
        />
      </View>

      {cashBars.some((v) => v !== 0) && (
        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>Cash flow</Text>
            <Text style={s.sectionHint}>last 18 days</Text>
          </View>
          <CashBar data={cashBars} color={color} />
        </View>
      )}

      {bestRoute && (
        <View style={[s.bestCard, { borderColor: color + "44" }]}>
          <View style={s.bestIcon}>
            <Ionicons name="trophy-outline" size={18} color={color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.bestTitle}>Best cash route</Text>
            <Text style={s.bestRoute}>
              {bestRoute.route.demand.origin.iata}
              {bestRoute.route.via_iata ? ` → ${bestRoute.route.via_iata}` : ""}
              {` → ${bestRoute.route.demand.dest.iata}`}
            </Text>
          </View>
          <Text
            style={[
              s.bestCash,
              { color: bestRoute.reward >= 0 ? Colors.green : Colors.red },
            ]}
          >
            {fmtCash(bestRoute.reward)}
          </Text>
        </View>
      )}

      {routeRewards.length > 0 ? (
        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>Routes</Text>
            <Text style={s.sectionHint}>{routeRewards.length} active</Text>
          </View>

          {routeRewards.map(({ route, reward }) => (
            <RouteRewardRow key={route.id} route={route} reward={reward} />
          ))}
        </View>
      ) : (
        <View style={s.empty}>
          <View style={s.emptyIcon}>
            <MaterialCommunityIcons
              name="routes"
              size={28}
              color={Colors.sky}
            />
          </View>
          <Text style={s.emptyTitle}>No route revenue yet</Text>
          <Text style={s.emptySub}>
            Open a hub, create a route, and assign a plane to start earning.
          </Text>
        </View>
      )}

      {recentLedger.length > 0 && (
        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>Recent activity</Text>
            <Text style={s.sectionHint}>latest 30</Text>
          </View>

          {recentLedger.map((entry) => (
            <LedgerRow key={entry.id} entry={entry} />
          ))}
        </View>
      )}

      <View style={{ height: 50 }} />
    </BottomSheetScrollView>
  );
}

const cb = StyleSheet.create({
  wrap: {
    height: 62,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    paddingTop: 6,
  },
  col: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  bar: {
    width: "100%",
    borderRadius: 3,
  },
});

const rr = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    backgroundColor: Colors.panel,
    gap: Spacing.sm,
    ...Shadow.card,
  },
  left: { flex: 1, gap: 2 },
  route: {
    fontFamily: Typography.mono,
    fontSize: 12,
    color: Colors.skyDark,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  meta: {
    fontSize: 10,
    color: Colors.muted,
  },
  rewardPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: Radius.full,
    backgroundColor: Palette.greenSoft,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  reward: {
    fontFamily: Typography.mono,
    fontSize: 12,
    color: Colors.green,
    fontWeight: "700",
  },
});

const lr = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
    borderRadius: Radius.md,
    backgroundColor: Colors.panel,
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, minWidth: 0 },
  label: { fontSize: 12, color: Colors.text },
  day: { fontSize: 9, color: Colors.muted, marginTop: 1 },
  amount: { fontFamily: Typography.mono, fontSize: 12, fontWeight: "700" },
});

const sc = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.panel,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    alignItems: "center",
    gap: 3,
    ...Shadow.card,
  },
  label: {
    fontFamily: Typography.mono,
    fontSize: 8,
    color: Colors.muted,
    letterSpacing: 1.4,
  },
  value: {
    fontFamily: Typography.mono,
    fontSize: 15,
    fontWeight: "700",
  },
  sub: {
    fontSize: 9,
    color: Colors.muted,
    textAlign: "center",
  },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.surface },
  content: { paddingBottom: Spacing.xxl },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  headerMark: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: Radius.md,
  },
  headerCopy: { flex: 1 },
  kicker: {
    color: Colors.skyDark,
    fontFamily: Typography.mono,
    fontSize: 8,
    letterSpacing: 1.3,
  },
  title: {
    fontFamily: Typography.display,
    fontSize: 28,
    lineHeight: 31,
    letterSpacing: 0.4,
    color: Colors.text,
  },
  subtitle: {
    fontSize: 10,
    color: Colors.muted,
  },
  closeButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.full,
    backgroundColor: Colors.inset,
  },
  quickActions: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  quickButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    minHeight: 54,
    padding: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.panel,
    ...Shadow.card,
  },
  quickIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.md,
  },
  quickCopy: { flex: 1, minWidth: 0 },
  quickTitle: { color: Colors.text, fontSize: 11, fontWeight: "700" },
  quickSubtitle: { color: Colors.muted, fontSize: 8, marginTop: 2 },

  hero: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    ...Shadow.card,
  },
  heroPositive: {
    borderColor: Colors.green,
    backgroundColor: Palette.greenSoft,
  },
  heroNegative: { borderColor: Colors.red, backgroundColor: Palette.redSoft },
  heroLabel: {
    fontFamily: Typography.mono,
    fontSize: 9,
    color: Colors.muted,
    letterSpacing: 2,
  },
  heroValue: {
    fontFamily: Typography.mono,
    fontSize: 30,
    fontWeight: "700",
    marginTop: 4,
  },
  heroBreakdown: {
    marginTop: Spacing.sm,
    gap: 6,
  },
  heroLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  heroLineLabel: {
    flex: 1,
    fontSize: 11,
    color: Colors.muted,
  },
  heroLineValue: {
    fontFamily: Typography.mono,
    fontSize: 11,
    fontWeight: "700",
  },

  statsRow: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },

  section: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontFamily: Typography.mono,
    fontSize: 9,
    color: Colors.skyDark,
    letterSpacing: 2.2,
    fontWeight: "700",
  },
  sectionHint: {
    fontSize: 9,
    color: Colors.muted,
  },

  bestCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    backgroundColor: Colors.panel,
    padding: Spacing.md,
    ...Shadow.card,
  },
  bestIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.skyDim,
  },
  bestTitle: {
    fontSize: 10,
    color: Colors.muted,
    marginBottom: 2,
  },
  bestRoute: {
    fontFamily: Typography.mono,
    fontSize: 12,
    color: Colors.text,
    fontWeight: "700",
  },
  bestCash: {
    fontFamily: Typography.mono,
    fontSize: 14,
    fontWeight: "700",
  },

  empty: {
    alignItems: "center",
    padding: Spacing.xxl,
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.xl,
    backgroundColor: Colors.panel,
    ...Shadow.card,
  },
  emptyIcon: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.full,
    backgroundColor: Colors.skyDim,
  },
  emptyTitle: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: "700",
  },
  emptySub: {
    fontSize: 12,
    color: Colors.muted,
    textAlign: "center",
    lineHeight: 18,
  },
});
