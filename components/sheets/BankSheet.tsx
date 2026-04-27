/**
 * components/sheets/BankSheet.tsx
 *
 * Bank panel — take a loan or repay existing debt.
 *
 * Loan tiers scale with difficulty:
 *   Easy:   lower interest (3%)
 *   Normal: standard interest (5%)
 *   Hard:   high interest (8-12%)
 *
 * Rules:
 *   - Must have ≥ 1 active route to borrow (validated server-side too)
 *   - One loan at a time — new loan adds to existing balance
 *   - No early repayment penalty
 *   - Daily interest deducted automatically by useRevenueTick
 *
 * Accessed from Finance sheet "Visit Bank" button.
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

// ─────────────────────────────────────────────────────────────────
// LOAN PACKAGES
// ─────────────────────────────────────────────────────────────────

interface LoanPackage {
  id: string;
  name: string;
  amount: number;
  rate: number; // annual %
  desc: string;
  minDay: number; // minimum game day to unlock
  minRoutes: number; // minimum active routes to unlock
}

const LOAN_PACKAGES: LoanPackage[] = [
  {
    id: "starter",
    name: "Starter Credit",
    amount: 500_000,
    rate: 6,
    desc: "Quick cash to buy your first hub or plane.",
    minDay: 1,
    minRoutes: 1,
  },
  {
    id: "regional",
    name: "Regional Fund",
    amount: 2_000_000,
    rate: 7,
    desc: "Expand to new regional airports.",
    minDay: 1,
    minRoutes: 2,
  },
  {
    id: "expansion",
    name: "Expansion Loan",
    amount: 5_000_000,
    rate: 8,
    desc: "Fund a significant fleet or hub expansion.",
    minDay: 15,
    minRoutes: 3,
  },
  {
    id: "growth",
    name: "Growth Capital",
    amount: 15_000_000,
    rate: 9,
    desc: "Upgrade to widebody aircraft and global routes.",
    minDay: 30,
    minRoutes: 5,
  },
  {
    id: "enterprise",
    name: "Enterprise Fund",
    amount: 50_000_000,
    rate: 10,
    desc: "For established airlines ready to dominate globally.",
    minDay: 60,
    minRoutes: 10,
  },
];

// Difficulty multiplies the interest rate
const RATE_MULTIPLIER: Record<string, number> = {
  easy: 0.6, // 60% of base rate
  normal: 1.0,
  hard: 1.4,
};

// ─────────────────────────────────────────────────────────────────
// REPAYMENT PRESETS
// ─────────────────────────────────────────────────────────────────

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
    { label: "$100K", amount: 100_000 },
    { label: "$500K", amount: 500_000 },
    { label: "$1M", amount: 1_000_000 },
    { label: "All", amount: loan },
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
                    backgroundColor: Colors.green + "10",
                  }
                : { borderColor: Colors.border, opacity: 0.4 },
            ]}
            onPress={() => canAfford && onRepay(p.amount)}
            disabled={!canAfford || loading}
            activeOpacity={0.8}
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

const rp = StyleSheet.create({
  row: { flexDirection: "row", gap: Spacing.sm, flexWrap: "wrap" },
  btn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    minHeight: MIN_TOUCH * 0.8,
    justifyContent: "center",
  },
  lbl: { fontSize: 13, fontWeight: "700" },
});

// ─────────────────────────────────────────────────────────────────
// LOAN PACKAGE CARD
// ─────────────────────────────────────────────────────────────────

function LoanCard({
  pkg,
  effectiveRate,
  locked,
  lockReason,
  canAffordMore,
  onTake,
  taking,
}: {
  pkg: LoanPackage;
  effectiveRate: number;
  locked: boolean;
  lockReason: string;
  canAffordMore: boolean;
  onTake: (pkg: LoanPackage, rate: number) => void;
  taking: boolean;
}) {
  const dailyCost = dailyInterest(pkg.amount, effectiveRate);
  const canTake = !locked && canAffordMore;

  return (
    <View
      style={[
        lc.card,
        locked && { opacity: 0.5 },
        !locked && !canAffordMore && { borderColor: Colors.red + "33" },
      ]}
    >
      <View style={lc.header}>
        <View style={lc.headerLeft}>
          <Text style={lc.name}>{pkg.name}</Text>
          <Text style={lc.desc}>{pkg.desc}</Text>
        </View>
        <Text
          style={[lc.amount, { color: canTake ? Colors.green : Colors.dim }]}
        >
          {fmtCash(pkg.amount)}
        </Text>
      </View>

      {/* Stats */}
      <View style={lc.stats}>
        <View style={lc.stat}>
          <Text style={lc.statLbl}>INTEREST</Text>
          <Text style={lc.statVal}>{effectiveRate.toFixed(1)}%/yr</Text>
        </View>
        <View style={lc.stat}>
          <Text style={lc.statLbl}>DAILY COST</Text>
          <Text style={[lc.statVal, { color: Colors.red }]}>
            {fmtCash(dailyCost)}
          </Text>
        </View>
        <View style={lc.stat}>
          <Text style={lc.statLbl}>BREAK-EVEN</Text>
          <Text style={lc.statVal}>{pkg.minRoutes} routes</Text>
        </View>
      </View>

      {/* Lock reason */}
      {locked && (
        <View style={lc.lockRow}>
          <Ionicons name="lock-closed" size={11} color={Colors.dim} />
          <Text style={lc.lockText}>{lockReason}</Text>
        </View>
      )}

      {/* Borrow button */}
      {!locked && (
        <TouchableOpacity
          style={[
            lc.btn,
            canAffordMore
              ? {
                  backgroundColor: Colors.sky + "20",
                  borderColor: Colors.sky + "55",
                }
              : {
                  backgroundColor: "rgba(255,255,255,.04)",
                  borderColor: Colors.border,
                },
            (!canAffordMore || taking) && { opacity: 0.55 },
          ]}
          onPress={() => canAffordMore && onTake(pkg, effectiveRate)}
          disabled={!canAffordMore || taking}
          activeOpacity={0.85}
        >
          {taking ? (
            <ActivityIndicator size="small" color={Colors.sky} />
          ) : (
            <>
              <MaterialCommunityIcons
                name="bank-outline"
                size={14}
                color={canAffordMore ? Colors.sky : Colors.dim}
              />
              <Text
                style={[
                  lc.btnTxt,
                  { color: canAffordMore ? Colors.sky : Colors.dim },
                ]}
              >
                {canAffordMore
                  ? `Borrow ${fmtCash(pkg.amount)}`
                  : "Pay down existing loan first"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const lc = StyleSheet.create({
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(255,255,255,.03)",
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  headerLeft: { flex: 1, gap: 3 },
  name: { fontSize: 14, color: Colors.text, fontWeight: "700" },
  desc: { fontSize: 11, color: Colors.dim, lineHeight: 16 },
  amount: { fontSize: 18, fontWeight: "700", flexShrink: 0 },
  stats: { flexDirection: "row", gap: Spacing.sm },
  stat: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,.04)",
    borderRadius: Radius.md,
    padding: Spacing.sm,
    alignItems: "center",
    gap: 2,
  },
  statLbl: { fontSize: 7, color: Colors.dim, letterSpacing: 1.5 },
  statVal: { fontSize: 12, color: Colors.text, fontWeight: "700" },
  lockRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  lockText: { fontSize: 10, color: Colors.dim },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    borderRadius: Radius.lg,
    minHeight: MIN_TOUCH,
    borderWidth: 1,
  },
  btnTxt: { fontSize: 13, fontWeight: "700" },
});

// ─────────────────────────────────────────────────────────────────
// BANK SHEET
// ─────────────────────────────────────────────────────────────────

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
  const dailyCost = loan > 0 ? dailyInterest(loan, currentRate) : 0;

  // Max loan: hard cap at $50M additional, or 10× current daily revenue
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
    } else {
      setSuccess(`${fmtCash(pkg.amount)} deposited to your account.`);
      haptics.success();
    }
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
    } else {
      setSuccess(
        `${fmtCash(amount)} repaid. ${loan - amount <= 0 ? "Loan fully cleared! 🎉" : ""}`,
      );
      haptics.success();
    }
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
      {/* Header */}
      <View style={s.header}>
        <View style={s.hdrL}>
          <MaterialCommunityIcons name="bank" size={20} color={color} />
          <Text style={s.title}>Bank</Text>
        </View>
        <TouchableOpacity
          onPress={closeSheet}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={22} color={Colors.dim} />
        </TouchableOpacity>
      </View>

      {/* Current loan status */}
      {loan > 0 ? (
        <View style={[s.loanCard, { borderColor: Colors.red + "33" }]}>
          <View style={s.loanTop}>
            <View>
              <Text style={s.loanLbl}>OUTSTANDING LOAN</Text>
              <Text style={[s.loanBal, { color: Colors.red }]}>
                {fmtCash(loan)}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 3 }}>
              <Text style={s.loanLbl}>DAILY INTEREST</Text>
              <Text style={[s.loanRate, { color: Colors.red }]}>
                -{fmtCash(dailyCost)}/day
              </Text>
              <Text style={s.loanRatePct}>{currentRate}% per year</Text>
            </View>
          </View>

          {/* Repay section */}
          <View style={s.repaySection}>
            <Text style={s.eyebrow}>REPAY</Text>
            <RepayPresets
              loan={loan}
              cash={cash}
              onRepay={handleRepay}
              loading={repaying}
            />
          </View>
        </View>
      ) : (
        <View style={[s.debtFreeCard, { borderColor: Colors.green + "33" }]}>
          <MaterialCommunityIcons
            name="check-circle"
            size={20}
            color={Colors.green}
          />
          <View>
            <Text style={[s.debtFreeTitle, { color: Colors.green }]}>
              Debt Free
            </Text>
            <Text style={s.debtFreeSub}>
              No outstanding loans. Borrow below to expand.
            </Text>
          </View>
        </View>
      )}

      {/* Feedback */}
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

      {/* Loan packages */}
      <Text style={s.eyebrow}>AVAILABLE LOANS</Text>
      <Text style={s.diffNote}>
        {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} mode ·{" "}
        {Math.round(rateMulti * 100 - 100) >= 0 ? "+" : ""}
        {Math.round((rateMulti - 1) * 100)}% rate modifier
      </Text>

      {LOAN_PACKAGES.map((pkg) => {
        const effectiveRate = Math.round(pkg.rate * rateMulti * 10) / 10;
        const locked = day < pkg.minDay || routeCount < pkg.minRoutes;
        const lockReason =
          day < pkg.minDay
            ? `Unlocks on day ${pkg.minDay}`
            : `Requires ${pkg.minRoutes} active routes (you have ${routeCount})`;

        return (
          <LoanCard
            key={pkg.id}
            pkg={pkg}
            effectiveRate={effectiveRate}
            locked={locked}
            lockReason={lockReason}
            canAffordMore={canBorrowMore}
            onTake={handleTake}
            taking={taking === pkg.id}
          />
        );
      })}

      {/* Info footer */}
      <View style={s.infoCard}>
        <MaterialCommunityIcons
          name="information-outline"
          size={13}
          color={Colors.dim}
        />
        <Text style={s.infoTxt}>
          Interest is deducted automatically each game-day. Repay early at any
          time with no penalty. Higher difficulty modes have increased interest
          rates.
        </Text>
      </View>
    </BottomSheetScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  content: {
    paddingBottom: Spacing.xxl,
    paddingHorizontal: Spacing.md,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  hdrL: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  title: { fontSize: 20, color: Colors.text, fontWeight: "700" },

  // Loan status
  loanCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: "rgba(248,113,113,.06)",
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  loanTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  loanLbl: {
    fontSize: 8,
    color: Colors.dim,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  loanBal: { fontSize: 24, fontWeight: "700" },
  loanRate: { fontSize: 14, fontWeight: "700" },
  loanRatePct: { fontSize: 9, color: Colors.dim },
  repaySection: { gap: Spacing.sm },

  // Debt free
  debtFreeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: "rgba(74,222,128,.06)",
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.md,
  },
  debtFreeTitle: { fontSize: 15, fontWeight: "700" },
  debtFreeSub: { fontSize: 11, color: Colors.dim, marginTop: 2 },

  // Feedback
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
  errTxt: { fontSize: 11, color: Colors.red, flex: 1, lineHeight: 16 },
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
  successTxt: { fontSize: 11, color: Colors.green, flex: 1 },

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
  infoTxt: { fontSize: 11, color: Colors.dim, flex: 1, lineHeight: 16 },
});
