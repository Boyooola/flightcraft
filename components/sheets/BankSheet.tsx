/**
 * components/sheets/BankSheet.tsx
 *
 * Worldwide Rush-style bank sheet.
 *
 * Focus:
 *   - loans are expansion boosts
 *   - interest is shown as "daily drag"
 *   - borrow to buy planes/hubs and clear more demand
 *   - repay to remove drag from cash flow
 */

import { Colors, MIN_TOUCH, Radius, Spacing } from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import { useLoanActions } from "@/hooks/useSupabaseWrite";
import { dailyInterest, fmtCash } from "@/lib/revenue";
import {
  useAirline,
  useCash,
  useDay,
  useGameStore,
  useLoan,
  useRouteCount,
} from "@/store";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface LoanPackage {
  id: string;
  name: string;
  amount: number;
  rate: number;
  desc: string;
  minDay: number;
  minRoutes: number;
  tag: string;
}

const LOAN_PACKAGES: LoanPackage[] = [
  {
    id: "starter",
    name: "Starter Boost",
    amount: 500_000,
    rate: 6,
    desc: "Buy a plane or open your first useful hub.",
    minDay: 1,
    minRoutes: 1,
    tag: "EARLY RUSH",
  },
  {
    id: "regional",
    name: "Route Boost",
    amount: 2_000_000,
    rate: 7,
    desc: "Add capacity and clear more demand slots.",
    minDay: 1,
    minRoutes: 2,
    tag: "MORE FLOW",
  },
  {
    id: "expansion",
    name: "Expansion Boost",
    amount: 5_000_000,
    rate: 8,
    desc: "Scale hubs and fleet for bigger routes.",
    minDay: 15,
    minRoutes: 3,
    tag: "EXPAND",
  },
  {
    id: "growth",
    name: "Long-Range Boost",
    amount: 15_000_000,
    rate: 9,
    desc: "Push into larger planes and longer routes.",
    minDay: 30,
    minRoutes: 5,
    tag: "BIG JUMP",
  },
  {
    id: "enterprise",
    name: "Empire Boost",
    amount: 50_000_000,
    rate: 10,
    desc: "For a network ready to dominate the map.",
    minDay: 60,
    minRoutes: 10,
    tag: "GLOBAL",
  },
];

const RATE_MULTIPLIER: Record<string, number> = {
  easy: 0.6,
  normal: 1,
  hard: 1.4,
};

function RepayPresets({
  loan,
  cash,
  onRepay,
  loading,
}: {
  loan: number;
  cash: number;
  onRepay: (amount: number) => void;
  loading: boolean;
}) {
  const presets = [
    { label: "100K", amount: 100_000 },
    { label: "500K", amount: 500_000 },
    { label: "1M", amount: 1_000_000 },
    { label: "Clear", amount: loan },
  ].filter((p) => p.amount <= loan);

  return (
    <View style={rp.row}>
      {presets.map((p) => {
        const canAfford = cash >= p.amount;

        return (
          <TouchableOpacity
            key={p.label}
            style={[
              rp.btn,
              canAfford
                ? {
                    borderColor: Colors.green + "55",
                    backgroundColor: Colors.green + "12",
                  }
                : {
                    borderColor: Colors.border,
                    opacity: 0.4,
                  },
            ]}
            onPress={() => canAfford && onRepay(p.amount)}
            disabled={!canAfford || loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator size="small" color={Colors.green} />
            ) : (
              <Text
                style={[
                  rp.lbl,
                  { color: canAfford ? Colors.green : Colors.dim },
                ]}
              >
                {p.label}
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function LoanCard({
  pkg,
  effectiveRate,
  locked,
  lockReason,
  canBorrowMore,
  onTake,
  taking,
}: {
  pkg: LoanPackage;
  effectiveRate: number;
  locked: boolean;
  lockReason: string;
  canBorrowMore: boolean;
  onTake: (pkg: LoanPackage, rate: number) => void;
  taking: boolean;
}) {
  const dailyDrag = dailyInterest(pkg.amount, effectiveRate);
  const canTake = !locked && canBorrowMore;

  return (
    <View style={[lc.card, locked && lc.locked]}>
      <View style={lc.top}>
        <View style={{ flex: 1 }}>
          <View style={lc.tag}>
            <Text style={lc.tagText}>{pkg.tag}</Text>
          </View>
          <Text style={lc.name}>{pkg.name}</Text>
          <Text style={lc.desc}>{pkg.desc}</Text>
        </View>

        <View style={lc.amountBox}>
          <Text
            style={[lc.amount, { color: canTake ? Colors.green : Colors.dim }]}
          >
            {fmtCash(pkg.amount)}
          </Text>
          <Text style={lc.amountSub}>instant cash</Text>
        </View>
      </View>

      <View style={lc.stats}>
        <View style={lc.stat}>
          <Text style={lc.statVal}>{effectiveRate.toFixed(1)}%</Text>
          <Text style={lc.statLbl}>RATE</Text>
        </View>
        <View style={lc.stat}>
          <Text style={[lc.statVal, { color: Colors.red }]}>
            -{fmtCash(dailyDrag)}
          </Text>
          <Text style={lc.statLbl}>Daily interest</Text>
        </View>
        <View style={lc.stat}>
          <Text style={lc.statVal}>{pkg.minRoutes}</Text>
          <Text style={lc.statLbl}>ROUTES</Text>
        </View>
      </View>

      {locked ? (
        <View style={lc.lockRow}>
          <Ionicons name="lock-closed" size={11} color={Colors.dim} />
          <Text style={lc.lockText}>{lockReason}</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={[
            lc.btn,
            {
              backgroundColor: canTake
                ? Colors.sky + "20"
                : "rgba(255,255,255,.04)",
              borderColor: canTake ? Colors.sky + "55" : Colors.border,
            },
            (!canTake || taking) && { opacity: 0.55 },
          ]}
          onPress={() => canTake && onTake(pkg, effectiveRate)}
          disabled={!canTake || taking}
          activeOpacity={0.85}
        >
          {taking ? (
            <ActivityIndicator size="small" color={Colors.sky} />
          ) : (
            <>
              <Ionicons
                name="flash-outline"
                size={15}
                color={canTake ? Colors.sky : Colors.dim}
              />
              <Text
                style={[
                  lc.btnTxt,
                  { color: canTake ? Colors.sky : Colors.dim },
                ]}
              >
                {canTake
                  ? `Take ${fmtCash(pkg.amount)} Boost`
                  : "Loan limit reached"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function BankSheet() {
  const airline = useAirline();
  const cash = useCash();
  const loan = useLoan();
  const day = useDay();
  const routeCount = useRouteCount();
  const closeSheet = useGameStore((s) => s.closeSheet);
  const haptics = useHaptics();
  const tabBarH = useTabBarHeight();
  const { take, repay } = useLoanActions();

  const [taking, setTaking] = useState<string | null>(null);
  const [repaying, setRepaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!airline) return null;

  const color = airline.color ?? Colors.sky;
  const difficulty = airline.difficulty ?? "normal";
  const rateMulti = RATE_MULTIPLIER[difficulty] ?? 1;
  const currentRate = airline.loan_rate ?? 5;
  const dailyDrag = loan > 0 ? dailyInterest(loan, currentRate) : 0;
  const canBorrowMore = loan < 50_000_000;

  const handleTake = async (pkg: LoanPackage, rate: number) => {
    haptics.confirm();
    setTaking(pkg.id);
    setError(null);
    setSuccess(null);

    const { error: err } = await take(pkg.amount, rate);

    setTaking(null);

    if (err) {
      setError(err);
      haptics.error();
      return;
    }

    setSuccess(`${fmtCash(pkg.amount)} boost added. Use it to increase flow.`);
    haptics.success();
  };

  const handleRepay = async (amount: number) => {
    haptics.confirm();
    setRepaying(true);
    setError(null);
    setSuccess(null);

    const { error: err } = await repay(amount);

    setRepaying(false);

    if (err) {
      setError(err);
      haptics.error();
      return;
    }

    setSuccess(
      loan - amount <= 0
        ? "Loan fully repaid — no more interest charges."
        : `${fmtCash(amount)} repaid — interest reduced.`,
    );
    haptics.success();
  };

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
            <Text style={s.title}>Bank Boosts</Text>
            <Text style={s.subtitle}>Borrow to expand passenger flow</Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={closeSheet}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={22} color={Colors.dim} />
        </TouchableOpacity>
      </View>

      <View
        style={[
          s.hero,
          { borderColor: loan > 0 ? Colors.red + "33" : Colors.green + "33" },
        ]}
      >
        <View>
          <Text style={s.heroLabel}>
            {loan > 0 ? "DAILY LOAN DRAG" : "BANK STATUS"}
          </Text>
          <Text
            style={[
              s.heroValue,
              { color: loan > 0 ? Colors.red : Colors.green },
            ]}
          >
            {loan > 0 ? `-${fmtCash(dailyDrag)}` : "Clear"}
          </Text>
          <Text style={s.heroSub}>
            {loan > 0
              ? `${fmtCash(loan)} loan · ${currentRate}% rate`
              : "No debt slowing your cash flow"}
          </Text>
        </View>

        <MaterialCommunityIcons
          name={loan > 0 ? "bank-minus" : "bank-check"}
          size={38}
          color={loan > 0 ? Colors.red + "66" : Colors.green + "66"}
        />
      </View>

      <View style={s.statsRow}>
        <View style={s.stat}>
          <Text style={[s.statVal, { color: Colors.green }]}>
            {fmtCash(cash)}
          </Text>
          <Text style={s.statLbl}>CASH</Text>
        </View>
        <View style={s.stat}>
          <Text style={[s.statVal, { color: color }]}>{routeCount}</Text>
          <Text style={s.statLbl}>ROUTES</Text>
        </View>
        <View style={s.stat}>
          <Text
            style={[s.statVal, { color: loan > 0 ? Colors.red : Colors.green }]}
          >
            {loan > 0 ? fmtCash(loan) : "0"}
          </Text>
          <Text style={s.statLbl}>DEBT</Text>
        </View>
      </View>

      {loan > 0 && (
        <View style={s.repayCard}>
          <Text style={s.eyebrow}>REPAY LOAN</Text>
          <Text style={s.repayHint}>
            Repay loans to keep more cash from every passenger rush.
          </Text>

          <RepayPresets
            loan={loan}
            cash={cash}
            onRepay={handleRepay}
            loading={repaying}
          />
        </View>
      )}

      {error && (
        <View style={s.errBox}>
          <Ionicons name="warning-outline" size={13} color={Colors.red} />
          <Text style={s.errTxt}>{error}</Text>
        </View>
      )}

      {success && (
        <View style={s.successBox}>
          <Ionicons
            name="checkmark-circle-outline"
            size={13}
            color={Colors.green}
          />
          <Text style={s.successTxt}>{success}</Text>
        </View>
      )}

      <View style={s.divider} />

      <Text style={s.eyebrow}>EXPANSION BOOSTS</Text>
      <Text style={s.diffNote}>
        {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} mode ·{" "}
        {Math.round((rateMulti - 1) * 100) >= 0 ? "+" : ""}
        {Math.round((rateMulti - 1) * 100)}% rate modifier
      </Text>

      {LOAN_PACKAGES.map((pkg) => {
        const effectiveRate = Math.round(pkg.rate * rateMulti * 10) / 10;
        const locked = day < pkg.minDay || routeCount < pkg.minRoutes;
        const lockReason =
          day < pkg.minDay
            ? `Unlocks on day ${pkg.minDay}`
            : `Needs ${pkg.minRoutes} active routes · you have ${routeCount}`;

        return (
          <LoanCard
            key={pkg.id}
            pkg={pkg}
            effectiveRate={effectiveRate}
            locked={locked}
            lockReason={lockReason}
            canBorrowMore={canBorrowMore}
            onTake={handleTake}
            taking={taking === pkg.id}
          />
        );
      })}

      <View style={s.infoCard}>
        <Ionicons
          name="information-circle-outline"
          size={14}
          color={Colors.dim}
        />
        <Text style={s.infoTxt}>
          Boosts are useful when they help you open routes, buy planes, and
          clear demand faster than the daily interest costs you.
        </Text>
      </View>
    </BottomSheetScrollView>
  );
}

const rp = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  btn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    minHeight: MIN_TOUCH * 0.8,
    justifyContent: "center",
  },
  lbl: {
    fontSize: 13,
    fontWeight: "900",
  },
});

const lc = StyleSheet.create({
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(255,255,255,.03)",
    padding: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  locked: {
    opacity: 0.55,
  },
  top: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  tag: {
    alignSelf: "flex-start",
    borderRadius: Radius.full,
    backgroundColor: Colors.sky + "14",
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginBottom: 5,
  },
  tagText: {
    fontSize: 8,
    color: Colors.sky,
    fontWeight: "900",
    letterSpacing: 1,
  },
  name: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: "900",
  },
  desc: {
    fontSize: 11,
    color: Colors.dim,
    lineHeight: 16,
    marginTop: 2,
  },
  amountBox: {
    alignItems: "flex-end",
  },
  amount: {
    fontSize: 18,
    fontWeight: "900",
  },
  amountSub: {
    fontSize: 8,
    color: Colors.dim,
  },
  stats: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  stat: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,.04)",
    borderRadius: Radius.md,
    padding: Spacing.sm,
    alignItems: "center",
    gap: 2,
  },
  statVal: {
    fontSize: 12,
    color: Colors.text,
    fontWeight: "900",
  },
  statLbl: {
    fontSize: 7,
    color: Colors.dim,
    letterSpacing: 1.4,
    fontWeight: "800",
  },
  lockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  lockText: {
    fontSize: 10,
    color: Colors.dim,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    borderRadius: Radius.lg,
    minHeight: MIN_TOUCH,
    borderWidth: 1,
  },
  btnTxt: {
    fontSize: 13,
    fontWeight: "900",
  },
});

const s = StyleSheet.create({
  root: { flex: 1 },
  content: {
    paddingBottom: Spacing.xxl,
  },
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
    marginTop: 1,
  },
  hero: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.xl,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,.035)",
    padding: Spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heroLabel: {
    fontSize: 8,
    color: Colors.dim,
    letterSpacing: 1.8,
    fontWeight: "900",
  },
  heroValue: {
    fontSize: 30,
    fontWeight: "900",
    marginTop: 4,
  },
  heroSub: {
    fontSize: 10,
    color: Colors.dim,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  stat: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.sm,
    backgroundColor: "rgba(255,255,255,.025)",
  },
  statVal: {
    fontSize: 15,
    fontWeight: "900",
  },
  statLbl: {
    fontSize: 8,
    color: Colors.dim,
    marginTop: 2,
    fontWeight: "800",
  },
  repayCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.green + "33",
    backgroundColor: Colors.green + "08",
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  repayHint: {
    fontSize: 11,
    color: Colors.dim,
    lineHeight: 16,
  },
  errBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: "rgba(248,113,113,.08)",
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,.25)",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    padding: Spacing.sm,
  },
  errTxt: {
    fontSize: 11,
    color: Colors.red,
    flex: 1,
    lineHeight: 16,
  },
  successBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: "rgba(74,222,128,.08)",
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "rgba(74,222,128,.25)",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    padding: Spacing.sm,
  },
  successTxt: {
    fontSize: 11,
    color: Colors.green,
    flex: 1,
    lineHeight: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },
  eyebrow: {
    fontSize: 9,
    color: Colors.dim,
    letterSpacing: 2.5,
    paddingHorizontal: Spacing.lg,
    marginBottom: 4,
    fontWeight: "900",
  },
  diffNote: {
    fontSize: 10,
    color: Colors.dim,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "rgba(255,255,255,.03)",
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    padding: Spacing.sm,
  },
  infoTxt: {
    fontSize: 11,
    color: Colors.dim,
    flex: 1,
    lineHeight: 16,
  },
});
