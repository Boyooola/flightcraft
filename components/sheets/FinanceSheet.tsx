/**
 * components/sheets/FinanceSheet.tsx
 *
 * Worldwide Rush-style finance sheet.
 *
 * Focus:
 *   - cash earned from moving passengers
 *   - best earning routes
 *   - recent rewards/events
 *   - quick Bank / Rankings buttons
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import {
  calcRouteRevenue,
  dailyInterest,
  fmtCash,
  fmtCashShort,
} from "@/lib/revenue";
import {
  useAirline,
  useCash,
  useDay,
  useGameStore,
  useHubs,
  useLedger,
  useLoan,
  useOwnedPlanes,
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

function RouteRewardRow({ route, reward }: { route: any; reward: number }) {
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
        <Text style={rr.reward}>{fmtCash(reward)}</Text>
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
  const hubs = useHubs();
  const cash = useCash();
  const loan = useLoan();
  const day = useDay();
  const ownedPlanes = useOwnedPlanes();
  const tabBarH = useTabBarHeight();
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
        const hub = hubs.find((h) => h.airport.iata === r.hub_iata);
        const p = r.plane.plane_model;
        const dist = r.total_dist_nm ?? r.demand.dist_nm;

        const result = calcRouteRevenue({
          distNm: dist,
          speedKts: p.speed_kts,
          trustPct: hub?.trust ?? 0,
          deliveredPax: r.demand.delivered_pax_today ?? r.demand.base_pax_day,
          paxDay: r.demand.base_pax_day,
          costPerSector: p.cost_per_sector ?? 500,
          fuelPerNm: p.fuel_per_nm ?? 2,
          priceStrategy: (r as any).price_strategy ?? "standard",
          priceElasticity: r.demand.price_elasticity ?? 1,
          businessPct: r.demand.business_pct ?? 0.25,
          leisurePct: r.demand.leisure_pct ?? 0.75,
        });

        return {
          route: r,
          reward: result.gross, // gross only — costs don't actually deduct cash
        };
      })
      .sort((a, b) => b.reward - a.reward);
  }, [routes, hubs, day]);

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

  if (routeRewards.length === 0) {
    return (
      <BottomSheetScrollView contentContainerStyle={es.wrap}>
        <View style={es.empty}>
          <Ionicons name="cash-outline" size={48} color={Colors.dim} />
          <Text style={es.emptyTitle}>No revenue yet</Text>
          <Text style={es.emptySub}>
            Create routes and assign planes to start earning. Your daily summary
            will appear here.
          </Text>
        </View>
      </BottomSheetScrollView>
    );
  }

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

  const bestRoute = routeRewards[0];

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
        <View style={s.hdrL}>
          <Ionicons name="flash-outline" size={21} color={color} />
          <View>
            <Text style={s.title}>Finances</Text>
            <Text style={s.subtitle}>Earnings and history</Text>
          </View>
        </View>

        <View style={s.hdrRight}>
          <TouchableOpacity
            style={[s.smallBtn, { borderColor: Colors.amber + "55" }]}
            onPress={() => openSheet("bank")}
          >
            <MaterialCommunityIcons
              name="bank-outline"
              size={14}
              color={Colors.amber}
            />
            <Text style={[s.smallBtnTxt, { color: Colors.amber }]}>Bank</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.smallBtn, { borderColor: color + "55" }]}
            onPress={() => openSheet("leaderboard")}
          >
            <MaterialCommunityIcons
              name="trophy-outline"
              size={14}
              color={color}
            />
            <Text style={[s.smallBtnTxt, { color }]}>Rank</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={closeSheet}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={22} color={Colors.dim} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.hero}>
        <Text style={s.heroLabel}>Today&apos;s earnings</Text>
        <Text
          style={[
            s.heroValue,
            { color: dailyNet >= 0 ? Colors.green : Colors.red },
          ]}
        >
          {fmtCashShort(dailyNet)}
        </Text>

        <View style={s.heroBreakdown}>
          <View style={s.heroLine}>
            <Ionicons name="airplane" size={12} color={Colors.green} />
            <Text style={s.heroLineLabel}>Routes</Text>
            <Text style={[s.heroLineValue, { color: Colors.green }]}>
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
          <Text style={[s.bestCash, { color: Colors.green }]}>
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
          <MaterialCommunityIcons name="routes" size={36} color={Colors.dim} />
          <Text style={s.emptyTitle}>No cash flow yet</Text>
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
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  left: { flex: 1, gap: 2 },
  route: {
    fontSize: 13,
    color: Colors.sky,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  meta: {
    fontSize: 10,
    color: Colors.dim,
  },
  rewardPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.green + "14",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  reward: {
    fontSize: 12,
    color: Colors.green,
    fontWeight: "900",
  },
});

const lr = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
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
  day: { fontSize: 9, color: Colors.dim, marginTop: 1 },
  amount: { fontSize: 13, fontWeight: "900" },
});

const sc = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,.035)",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    alignItems: "center",
    gap: 3,
  },
  label: {
    fontSize: 8,
    color: Colors.dim,
    letterSpacing: 1.4,
    fontWeight: "900",
  },
  value: {
    fontSize: 18,
    fontWeight: "900",
  },
  sub: {
    fontSize: 9,
    color: Colors.dim,
    textAlign: "center",
  },
});

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingBottom: Spacing.xxl },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  hdrL: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  title: {
    fontSize: 20,
    color: Colors.text,
    fontWeight: "900",
  },
  subtitle: {
    fontSize: 10,
    color: Colors.dim,
  },
  hdrRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  smallBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  smallBtnTxt: {
    fontSize: 11,
    fontWeight: "800",
  },

  hero: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.green + "30",
    backgroundColor: "rgba(34,197,94,0.055)",
    padding: Spacing.lg,
  },
  heroLabel: {
    fontSize: 9,
    color: Colors.dim,
    letterSpacing: 2,
    fontWeight: "900",
  },
  heroValue: {
    fontSize: 34,
    fontWeight: "900",
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
    fontSize: 12,
    fontWeight: "900",
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
    fontSize: 9,
    color: Colors.dim,
    letterSpacing: 2.2,
    fontWeight: "900",
  },
  sectionHint: {
    fontSize: 9,
    color: Colors.dim,
  },

  bestCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,.035)",
    padding: Spacing.md,
  },
  bestIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,.05)",
  },
  bestTitle: {
    fontSize: 10,
    color: Colors.dim,
    marginBottom: 2,
  },
  bestRoute: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: "900",
  },
  bestCash: {
    fontSize: 14,
    fontWeight: "900",
  },

  empty: {
    alignItems: "center",
    padding: Spacing.xxl,
    gap: Spacing.sm,
  },
  emptyTitle: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: "900",
  },
  emptySub: {
    fontSize: 12,
    color: Colors.dim,
    textAlign: "center",
    lineHeight: 18,
  },
});

const es = StyleSheet.create({
  wrap: { flex: 1, padding: Spacing.lg },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.text,
    textAlign: "center",
  },
  emptySub: {
    fontSize: 13,
    color: Colors.muted,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 280,
  },
});
