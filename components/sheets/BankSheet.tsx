import {
  Colors,
  MIN_TOUCH,
  Palette,
  Radius,
  Shadow,
  Spacing,
  Typography,
} from "@/constants/theme";
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
            accessibilityLabel={`Repay ${fmtCash(p.amount)}`}
            accessibilityRole="button"
            style={[
              rp.btn,
              canAfford
                ? {
                    borderColor: Colors.green,
                    backgroundColor: Palette.greenSoft,
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
  availableCredit,
  onTake,
  taking,
}: {
  pkg: LoanPackage;
  effectiveRate: number;
  locked: boolean;
  lockReason: string;
  availableCredit: number;
  onTake: (pkg: LoanPackage, rate: number) => void;
  taking: boolean;
}) {
  const dailyDrag = dailyInterest(pkg.amount, effectiveRate);
  const fitsCreditLimit = pkg.amount <= availableCredit;
  const canTake = !locked && fitsCreditLimit;

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
          accessibilityLabel={
            canTake
              ? `Borrow ${fmtCash(pkg.amount)} at ${effectiveRate.toFixed(1)} percent interest`
              : locked
                ? lockReason
                : "This loan exceeds your available credit"
          }
          accessibilityRole="button"
          style={[
            lc.btn,
            {
              backgroundColor: canTake ? Colors.sky : Colors.dim,
              borderColor: canTake ? Colors.sky : Colors.border,
            },
            (!canTake || taking) && { opacity: 0.55 },
          ]}
          onPress={() => canTake && onTake(pkg, effectiveRate)}
          disabled={!canTake || taking}
          activeOpacity={0.85}
        >
          {taking ? (
            <ActivityIndicator size="small" color={Colors.textOnColor} />
          ) : (
            <>
              <Ionicons
                name="flash-outline"
                size={15}
                color={Colors.textOnColor}
              />
              <Text style={[lc.btnTxt, { color: Colors.textOnColor }]}>
                {canTake
                  ? `Borrow ${fmtCash(pkg.amount)}`
                  : "Credit limit reached"}
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
  const availableCredit = Math.max(0, 50_000_000 - loan);

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
        <View
          style={[
            s.headerMark,
            { borderColor: color, backgroundColor: color + "14" },
          ]}
        >
          <MaterialCommunityIcons name="bank-outline" size={20} color={color} />
        </View>
        <View style={s.headerCopy}>
          <Text style={s.kicker}>FINANCIAL SERVICES</Text>
          <Text style={s.title}>Airline Bank</Text>
          <Text style={s.subtitle}>Loans, interest, and repayments</Text>
        </View>

        <TouchableOpacity
          accessibilityLabel="Close airline bank"
          accessibilityRole="button"
          onPress={closeSheet}
          style={s.closeButton}
        >
          <Ionicons name="close" size={22} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={[s.hero, loan > 0 ? s.heroDebt : s.heroClear]}>
        <View>
          <Text style={s.heroLabel}>
            {loan > 0 ? "DAILY INTEREST COST" : "DEBT STATUS"}
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
              : "No active loans or interest charges"}
          </Text>
        </View>

        <MaterialCommunityIcons
          name={loan > 0 ? "bank-minus" : "bank-check"}
          size={38}
          color={loan > 0 ? Colors.red : Colors.green}
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
          <Text style={[s.statVal, { color: Colors.skyDark }]}>
            {fmtCash(availableCredit)}
          </Text>
          <Text style={s.statLbl}>AVAILABLE CREDIT</Text>
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

      <Text style={s.eyebrow}>LOAN OPTIONS</Text>
      <Text style={s.diffNote}>
        Day {day} · {routeCount} active route{routeCount === 1 ? "" : "s"} ·{" "}
        {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} difficulty ·{" "}
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
            availableCredit={availableCredit}
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
    minHeight: MIN_TOUCH,
    justifyContent: "center",
  },
  lbl: {
    fontFamily: Typography.mono,
    fontSize: 11,
    fontWeight: "700",
  },
});

const lc = StyleSheet.create({
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.panel,
    padding: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
    ...Shadow.card,
  },
  locked: {
    backgroundColor: Colors.bg,
    shadowOpacity: 0,
    elevation: 0,
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
    backgroundColor: Colors.skyDim,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginBottom: 5,
  },
  tagText: {
    fontFamily: Typography.mono,
    fontSize: 8,
    color: Colors.skyDark,
    fontWeight: "700",
    letterSpacing: 1,
  },
  name: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: "700",
  },
  desc: {
    fontSize: 11,
    color: Colors.muted,
    lineHeight: 16,
    marginTop: 2,
  },
  amountBox: {
    alignItems: "flex-end",
  },
  amount: {
    fontFamily: Typography.mono,
    fontSize: 16,
    fontWeight: "700",
  },
  amountSub: {
    fontSize: 8,
    color: Colors.muted,
  },
  stats: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  stat: {
    flex: 1,
    backgroundColor: Colors.bg,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    alignItems: "center",
    gap: 2,
  },
  statVal: {
    fontFamily: Typography.mono,
    fontSize: 12,
    color: Colors.text,
    fontWeight: "700",
  },
  statLbl: {
    fontFamily: Typography.mono,
    fontSize: 7,
    color: Colors.muted,
    letterSpacing: 1.4,
  },
  lockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  lockText: {
    fontSize: 10,
    color: Colors.muted,
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
    fontSize: 12,
    fontWeight: "700",
    color: Colors.textOnColor,
  },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.surface },
  content: {
    paddingBottom: Spacing.xxl,
  },
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
    marginTop: 1,
  },
  closeButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.full,
    backgroundColor: Colors.inset,
  },
  hero: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    ...Shadow.card,
  },
  heroDebt: { borderColor: Colors.red, backgroundColor: Palette.redSoft },
  heroClear: { borderColor: Colors.green, backgroundColor: Palette.greenSoft },
  heroLabel: {
    fontFamily: Typography.mono,
    fontSize: 8,
    color: Colors.muted,
    letterSpacing: 1.8,
  },
  heroValue: {
    fontFamily: Typography.mono,
    fontSize: 28,
    fontWeight: "700",
    marginTop: 4,
  },
  heroSub: {
    fontSize: 10,
    color: Colors.muted,
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
    backgroundColor: Colors.panel,
    ...Shadow.card,
  },
  stat: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  statVal: {
    fontFamily: Typography.mono,
    fontSize: 13,
    fontWeight: "700",
  },
  statLbl: {
    fontFamily: Typography.mono,
    fontSize: 8,
    color: Colors.muted,
    marginTop: 2,
  },
  repayCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.green,
    backgroundColor: Palette.greenSoft,
    padding: Spacing.md,
    gap: Spacing.sm,
    ...Shadow.card,
  },
  repayHint: {
    fontSize: 11,
    color: Colors.muted,
    lineHeight: 16,
  },
  errBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: Palette.redSoft,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.red,
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
    backgroundColor: Palette.greenSoft,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.green,
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
    fontFamily: Typography.mono,
    fontSize: 9,
    color: Colors.skyDark,
    letterSpacing: 2.5,
    paddingHorizontal: Spacing.lg,
    marginBottom: 4,
    fontWeight: "700",
  },
  diffNote: {
    fontSize: 10,
    color: Colors.muted,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: Colors.panel,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    ...Shadow.card,
  },
  infoTxt: {
    fontSize: 11,
    color: Colors.muted,
    flex: 1,
    lineHeight: 16,
  },
});
