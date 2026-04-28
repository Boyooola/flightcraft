import { useTabBarHeight } from "@/hooks/useSheetLayout";
/**
 * components/sheets/FinanceSheet.tsx
 *
 * Airline financial overview:
 *   - Net worth summary (cash, loan, net)
 *   - 30-day revenue sparkline
 *   - Per-route daily revenue breakdown
 *   - Loan repayment info
 *   - Ledger history (last 30 days)
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
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
  useRoutes,
} from "@/store";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

// ─────────────────────────────────────────────────────────────────
// MINI SPARKLINE
// Pure SVG-free bar chart using Views
// ─────────────────────────────────────────────────────────────────

function Sparkline({
  data,
  color,
  height = 36,
}: {
  data: number[];
  color: string;
  height?: number;
}) {
  if (data.length === 0) return null;
  const max = Math.max(...data, 1);
  return (
    <View style={[sp.wrap, { height }]}>
      {data.map((v, i) => (
        <View key={i} style={sp.barCol}>
          <View
            style={[
              sp.bar,
              {
                height: `${Math.max(4, Math.round((v / max) * 100))}%` as any,
                backgroundColor: v >= 0 ? color : Colors.red,
                opacity:
                  i === data.length - 1 ? 1 : 0.45 + (i / data.length) * 0.55,
              },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

const sp = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "flex-end", gap: 2 },
  barCol: { flex: 1, justifyContent: "flex-end", height: "100%" },
  bar: { borderRadius: 2, minHeight: 4 },
});

// ─────────────────────────────────────────────────────────────────
// LEDGER ROW
// ─────────────────────────────────────────────────────────────────

function LedgerRow({
  entry,
}: {
  entry: { day: number; label: string; amount: number; type: string };
}) {
  const isPos = entry.amount >= 0;
  const icon =
    entry.type === "revenue"
      ? "airplane"
      : entry.type === "interest"
        ? "percent"
        : entry.type === "purchase"
          ? "cart-outline"
          : "cash";

  return (
    <View style={lr.row}>
      <View
        style={[
          lr.iconWrap,
          { backgroundColor: isPos ? Colors.green + "14" : Colors.red + "14" },
        ]}
      >
        {entry.type === "interest" ? (
          <MaterialCommunityIcons
            name={icon as any}
            size={13}
            color={isPos ? Colors.green : Colors.red}
          />
        ) : (
          <Ionicons
            name={icon as any}
            size={13}
            color={isPos ? Colors.green : Colors.red}
          />
        )}
      </View>
      <View style={lr.info}>
        <Text style={lr.label} numberOfLines={1}>
          {entry.label}
        </Text>
        <Text style={lr.day}>Day {entry.day}</Text>
      </View>
      <Text style={[lr.amount, { color: isPos ? Colors.green : Colors.red }]}>
        {fmtCashShort(entry.amount)}
      </Text>
    </View>
  );
}

const lr = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  info: { flex: 1, minWidth: 0 },
  label: { fontSize: 12, color: Colors.text },
  day: { fontSize: 9, color: Colors.dim, marginTop: 1 },
  amount: { fontSize: 13, fontWeight: "700", flexShrink: 0 },
});

// ─────────────────────────────────────────────────────────────────
// STAT BOX
// ─────────────────────────────────────────────────────────────────

function StatBox({
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
    <View style={sb.box}>
      <Text style={sb.lbl}>{label}</Text>
      <Text style={[sb.val, { color }]}>{value}</Text>
      {sub && <Text style={sb.sub}>{sub}</Text>}
    </View>
  );
}
const sb = StyleSheet.create({
  box: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,.04)",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    alignItems: "center",
    gap: 3,
  },
  lbl: { fontSize: 8, color: Colors.dim, letterSpacing: 1.5 },
  val: { fontSize: 19, fontWeight: "700" },
  sub: { fontSize: 9, color: Colors.dim, textAlign: "center" },
});

// ─────────────────────────────────────────────────────────────────
// FINANCE SHEET
// ─────────────────────────────────────────────────────────────────

export default function FinanceSheet() {
  const airline = useAirline();
  const ledger = useLedger();
  const routes = useRoutes();
  const hubs = useHubs();
  const cash = useCash();
  const loan = useLoan();
  const day = useDay();
  const tabBarH = useTabBarHeight();
  const closeSheet = useGameStore((s) => s.closeSheet);
  const openSheet = useGameStore((s) => s.openSheet);

  const color = airline?.color ?? Colors.sky;

  // ── Computed values ──────────────────────────────────────────────

  const netWorth = cash - loan;
  const netColor = netWorth >= 0 ? Colors.green : Colors.red;

  // Interest per day
  const diffRates: Record<string, number> = { easy: 3, normal: 5, hard: 9 };
  const rate = diffRates[airline?.difficulty ?? "normal"] ?? 5;
  const interest = dailyInterest(loan, rate);

  // Total daily revenue from active routes
  const totalDailyRev = useMemo(() => {
    return routes
      .filter((r) => r.active)
      .reduce((sum, r) => {
        const hub = hubs.find((h) => h.airport.iata === r.hub_iata);
        const p = r.plane.plane_model;
        const dist = r.total_dist_nm ?? r.demand.dist_nm;
        const res = calcRouteRevenue({
          distNm: dist,
          speedKts: p.speed_kts,
          trustPct: hub?.trust ?? 0,
          deliveredPax: r.demand.pax_day,
          paxDay: r.demand.pax_day,
          costPerSector: p.cost_per_sector ?? 500,
          fuelPerNm: p.fuel_per_nm ?? 2.0,
        });
        return sum + res.net;
      }, 0);
  }, [routes, hubs, day]);

  const dailyNet = totalDailyRev - interest;

  // 30-day revenue sparkline from ledger
  const sparkData = useMemo(() => {
    const byDay: Record<number, number> = {};
    ledger.forEach((e) => {
      byDay[e.day] = (byDay[e.day] ?? 0) + e.amount;
    });
    const days = Array.from({ length: 30 }, (_, i) => day - 29 + i);
    return days.map((d) => byDay[d] ?? 0);
  }, [ledger, day]);

  // Per-route revenue breakdown
  const routeRevenues = useMemo(() => {
    return routes
      .filter((r) => r.active)
      .map((r) => {
        const hub = hubs.find((h) => h.airport.iata === r.hub_iata);
        const p = r.plane.plane_model;
        const dist = r.total_dist_nm ?? r.demand.dist_nm;
        const res = calcRouteRevenue({
          distNm: dist,
          speedKts: p.speed_kts,
          trustPct: hub?.trust ?? 0,
          deliveredPax: r.demand.pax_day,
          paxDay: r.demand.pax_day,
          costPerSector: p.cost_per_sector ?? 500,
          fuelPerNm: p.fuel_per_nm ?? 2.0,
        });
        return { route: r, rev: res.net };
      })
      .sort((a, b) => b.rev - a.rev);
  }, [routes, hubs, day]);

  // Last 30 ledger entries (most recent first)
  const recentLedger = useMemo(
    () =>
      [...ledger]
        .sort((a, b) => b.day - a.day || b.id.localeCompare(a.id))
        .slice(0, 30),
    [ledger],
  );

  return (
    <BottomSheetScrollView
      style={s.root}
      contentContainerStyle={[s.content, { paddingBottom: tabBarH }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={s.header}>
        <View style={s.hdrL}>
          <MaterialCommunityIcons name="chart-line" size={20} color={color} />
          <Text style={s.title}>Finance</Text>
        </View>
        <View style={s.hdrRight}>
          <TouchableOpacity
            style={[s.bankBtn, { borderColor: Colors.amber + "55" }]}
            onPress={() => openSheet("bank")}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons
              name="bank-outline"
              size={14}
              color={Colors.amber}
            />
            <Text style={[s.bankTxt, { color: Colors.amber }]}>Bank</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.rankingsBtn, { borderColor: color + "44" }]}
            onPress={() => openSheet("leaderboard")}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons
              name="trophy-outline"
              size={14}
              color={color}
            />
            <Text style={[s.rankingsTxt, { color }]}>Rankings</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={closeSheet}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={22} color={Colors.dim} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Net worth summary */}
      <View style={s.statsRow}>
        <StatBox
          label="CASH"
          value={fmtCash(cash)}
          color={cash < 200_000 ? Colors.red : Colors.green}
        />
        <StatBox
          label="LOAN"
          value={fmtCash(loan)}
          color={loan > 0 ? Colors.red : Colors.dim}
          sub={loan > 0 ? `${fmtCash(interest)}/day` : "debt free"}
        />
        <StatBox
          label="NET WORTH"
          value={fmtCashShort(netWorth)}
          color={netColor}
        />
      </View>

      {/* Daily P&L */}
      <View
        style={[
          s.pnlCard,
          { borderColor: (dailyNet >= 0 ? Colors.green : Colors.red) + "33" },
        ]}
      >
        <View style={s.pnlRow}>
          <View>
            <Text style={s.eyebrow}>DAILY P&L</Text>
            <Text
              style={[
                s.pnlBig,
                { color: dailyNet >= 0 ? Colors.green : Colors.red },
              ]}
            >
              {fmtCashShort(dailyNet)}
            </Text>
            <Text style={s.pnlSub}>per game-day</Text>
          </View>
          <View style={s.pnlRight}>
            <View style={s.pnlLine}>
              <Ionicons name="airplane" size={11} color={Colors.green} />
              <Text style={s.pnlLbl}>Revenue</Text>
              <Text style={[s.pnlVal, { color: Colors.green }]}>
                {fmtCash(totalDailyRev)}
              </Text>
            </View>
            {interest > 0 && (
              <View style={s.pnlLine}>
                <MaterialCommunityIcons
                  name="percent"
                  size={11}
                  color={Colors.red}
                />
                <Text style={s.pnlLbl}>Interest</Text>
                <Text style={[s.pnlVal, { color: Colors.red }]}>
                  -{fmtCash(interest)}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* 30-day sparkline */}
      {sparkData.some((v) => v !== 0) && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>30-DAY NET INCOME</Text>
          <Sparkline data={sparkData} color={color} height={48} />
          <View style={s.sparkLabels}>
            <Text style={s.sparkLbl}>Day {Math.max(1, day - 29)}</Text>
            <Text style={s.sparkLbl}>Today</Text>
          </View>
        </View>
      )}

      {/* Route revenue breakdown */}
      {routeRevenues.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>ROUTES · DAILY REVENUE</Text>
          {routeRevenues.map(({ route, rev }) => (
            <View key={route.id} style={s.routeRow}>
              <View style={s.routeLeft}>
                <Text style={s.routeIatas}>
                  {route.demand.origin.iata}
                  {route.via_iata ? ` → ${route.via_iata}` : ""}
                  {` → ${route.demand.dest.iata}`}
                </Text>
                <Text style={s.routeMeta}>
                  {route.plane.plane_model.nickname}
                  {route.via_iata ? "  ·  Connecting" : "  ·  Direct"}
                </Text>
              </View>
              <Text style={[s.routeRev, { color: Colors.green }]}>
                {fmtCash(rev)}/day
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Empty routes state */}
      {routeRevenues.length === 0 && (
        <View style={s.emptySection}>
          <MaterialCommunityIcons name="routes" size={36} color={Colors.dim} />
          <Text style={s.emptyTitle}>No active routes</Text>
          <Text style={s.emptySub}>
            Assign planes to demands to start earning revenue.
          </Text>
        </View>
      )}

      {/* Ledger */}
      {recentLedger.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>RECENT TRANSACTIONS</Text>
          {recentLedger.map((e) => (
            <LedgerRow key={e.id} entry={e} />
          ))}
        </View>
      )}

      <View style={{ height: 50 }} />
    </BottomSheetScrollView>
  );
}

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
  hdrL: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  hdrRight: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  rankingsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  rankingsTxt: { fontSize: 11, fontWeight: "600" },
  bankBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  bankTxt: { fontSize: 11, fontWeight: "600" },
  title: { fontSize: 20, color: Colors.text, fontWeight: "700" },

  statsRow: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },

  pnlCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: "rgba(255,255,255,.03)",
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.md,
  },
  pnlRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  pnlBig: { fontSize: 28, fontWeight: "700", letterSpacing: 0.3 },
  pnlSub: { fontSize: 10, color: Colors.dim, marginTop: 2 },
  pnlRight: { gap: 8, alignItems: "flex-end" },
  pnlLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  pnlLbl: { fontSize: 11, color: Colors.muted, minWidth: 52 },
  pnlVal: { fontSize: 12, fontWeight: "700" },

  section: { marginHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  sectionTitle: {
    fontSize: 9,
    color: Colors.dim,
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },

  sparkLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  sparkLbl: { fontSize: 9, color: Colors.dim },

  eyebrow: {
    fontSize: 8,
    color: Colors.dim,
    letterSpacing: 1.5,
    marginBottom: 4,
  },

  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  routeLeft: { flex: 1, gap: 2 },
  routeIatas: {
    fontSize: 13,
    color: Colors.sky,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  routeMeta: { fontSize: 10, color: Colors.dim },
  routeRev: { fontSize: 13, fontWeight: "700", flexShrink: 0 },

  emptySection: { alignItems: "center", padding: Spacing.xxl, gap: Spacing.sm },
  emptyTitle: { fontSize: 15, color: Colors.text, fontWeight: "700" },
  emptySub: {
    fontSize: 12,
    color: Colors.dim,
    textAlign: "center",
    lineHeight: 18,
  },
});
