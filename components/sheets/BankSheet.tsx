import { AirlineBrandMark } from "@/components/airline-identity";
import {
  Colors,
  MIN_TOUCH,
  Radius,
  Spacing,
  Typography,
} from "@/constants/theme";
import { useHaptics } from "@/hooks/useHaptics";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import { useLoanActions } from "@/hooks/useSupabaseWrite";
import { DEFAULT_AIRLINE_LOGO_ID, getAirlinePalette } from "@/lib/airlineBrand";
import { dailyInterest, fmtCash } from "@/lib/revenue";
import {
  useAirline,
  useCash,
  useDay,
  useGameStore,
  useLoan,
  useRouteCount,
} from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  description: string;
  minDay: number;
  minRoutes: number;
}

const LOAN_PACKAGES: LoanPackage[] = [
  {
    id: "starter",
    name: "Working capital",
    amount: 500_000,
    rate: 6,
    description: "Cover an early aircraft purchase or route opening cost.",
    minDay: 1,
    minRoutes: 1,
  },
  {
    id: "regional",
    name: "Regional expansion",
    amount: 2_000_000,
    rate: 7,
    description:
      "Add aircraft capacity across an established regional network.",
    minDay: 1,
    minRoutes: 2,
  },
  {
    id: "expansion",
    name: "Fleet expansion",
    amount: 5_000_000,
    rate: 8,
    description: "Fund additional aircraft and higher-volume routes.",
    minDay: 15,
    minRoutes: 3,
  },
  {
    id: "growth",
    name: "Long-haul expansion",
    amount: 15_000_000,
    rate: 9,
    description: "Finance larger aircraft and longer-range operations.",
    minDay: 30,
    minRoutes: 5,
  },
  {
    id: "enterprise",
    name: "Network expansion",
    amount: 50_000_000,
    rate: 10,
    description: "Support a mature airline entering multiple new markets.",
    minDay: 60,
    minRoutes: 10,
  },
];

const RATE_MULTIPLIER: Record<string, number> = {
  easy: 0.6,
  normal: 1,
  hard: 1.4,
};

function SummaryRow({
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
    <View style={[styles.summaryRow, last && styles.lastRow]}>
      <Text style={[styles.summaryLabel, strong && styles.strongText]}>
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={[
          styles.summaryValue,
          strong && styles.strongText,
          { color: valueColor },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function RepaymentOptions({
  loan,
  cash,
  loading,
  onRequest,
}: {
  loan: number;
  cash: number;
  loading: boolean;
  onRequest: (amount: number) => void;
}) {
  const presets = [
    { label: "$100K", amount: 100_000 },
    { label: "$500K", amount: 500_000 },
    { label: "$1M", amount: 1_000_000 },
    { label: "Pay in full", amount: loan },
  ].filter((preset) => preset.amount <= loan);

  return (
    <View style={styles.repaymentButtons}>
      {presets.map((preset) => {
        const canAfford = cash >= preset.amount;

        return (
          <TouchableOpacity
            key={`${preset.label}-${preset.amount}`}
            accessibilityHint={
              canAfford
                ? "Shows the repayment effect before confirming"
                : "Your airline does not have enough cash"
            }
            accessibilityLabel={`Repay ${fmtCash(preset.amount)}`}
            accessibilityRole="button"
            activeOpacity={0.7}
            disabled={!canAfford || loading}
            onPress={() => onRequest(preset.amount)}
            style={[
              styles.repaymentButton,
              (!canAfford || loading) && styles.disabledControl,
            ]}
          >
            {loading ? (
              <ActivityIndicator size="small" color={Colors.skyDark} />
            ) : (
              <Text
                style={[
                  styles.repaymentButtonText,
                  !canAfford && styles.disabledText,
                ]}
              >
                {preset.label}
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function LoanOfferRow({
  pkg,
  effectiveRate,
  currentLoan,
  availableCredit,
  locked,
  lockReason,
  taking,
  onReview,
  last,
}: {
  pkg: LoanPackage;
  effectiveRate: number;
  currentLoan: number;
  availableCredit: number;
  locked: boolean;
  lockReason: string;
  taking: boolean;
  onReview: (pkg: LoanPackage, rate: number) => void;
  last: boolean;
}) {
  const fitsCreditLimit = pkg.amount <= availableCredit;
  const canBorrow = !locked && fitsCreditLimit;
  const projectedBalance = currentLoan + pkg.amount;
  const projectedDailyInterest = dailyInterest(projectedBalance, effectiveRate);
  const unavailableReason = locked
    ? lockReason
    : `Only ${fmtCash(availableCredit)} credit remains`;

  return (
    <View style={[styles.offerRow, last && styles.lastRow]}>
      <View style={styles.offerHeading}>
        <View style={styles.offerHeadingCopy}>
          <Text style={styles.offerName}>{pkg.name}</Text>
          <Text style={styles.offerDescription}>{pkg.description}</Text>
        </View>
        <Text style={styles.offerAmount}>{fmtCash(pkg.amount)}</Text>
      </View>

      <View style={styles.offerFacts}>
        <View style={styles.offerFact}>
          <Text style={styles.offerFactLabel}>Annual rate</Text>
          <Text style={styles.offerFactValue}>{effectiveRate.toFixed(1)}%</Text>
        </View>
        <View style={styles.offerFact}>
          <Text style={styles.offerFactLabel}>New balance</Text>
          <Text style={styles.offerFactValue}>{fmtCash(projectedBalance)}</Text>
        </View>
        <View style={styles.offerFact}>
          <Text style={styles.offerFactLabel}>Interest per day</Text>
          <Text style={[styles.offerFactValue, { color: Colors.red }]}>
            -{fmtCash(projectedDailyInterest)}
          </Text>
        </View>
      </View>

      {!canBorrow ? (
        <View style={styles.requirementRow}>
          <Ionicons name="lock-closed-outline" size={16} color={Colors.muted} />
          <Text style={styles.requirementText}>{unavailableReason}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        accessibilityHint={
          canBorrow
            ? "Shows the new loan balance and daily interest before confirming"
            : unavailableReason
        }
        accessibilityLabel={
          canBorrow
            ? `Review ${fmtCash(pkg.amount)} loan at ${effectiveRate.toFixed(1)} percent annual interest`
            : `${pkg.name} unavailable. ${unavailableReason}`
        }
        accessibilityRole="button"
        activeOpacity={0.7}
        disabled={!canBorrow || taking}
        onPress={() => onReview(pkg, effectiveRate)}
        style={[
          styles.reviewButton,
          (!canBorrow || taking) && styles.disabledControl,
        ]}
      >
        {taking ? (
          <ActivityIndicator size="small" color={Colors.textOnColor} />
        ) : (
          <Text style={styles.reviewButtonText}>
            {canBorrow ? "Review loan" : "Unavailable"}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function StatusMessage({
  type,
  message,
}: {
  type: "error" | "success";
  message: string;
}) {
  const isError = type === "error";
  const color = isError ? Colors.red : Colors.green;

  return (
    <View accessibilityLiveRegion="polite" style={styles.statusMessage}>
      <Ionicons
        name={isError ? "warning-outline" : "checkmark-circle-outline"}
        size={18}
        color={color}
      />
      <Text style={[styles.statusText, { color }]}>{message}</Text>
    </View>
  );
}

export default function BankSheet() {
  const airline = useAirline();
  const cash = useCash();
  const loan = useLoan();
  const day = useDay();
  const routeCount = useRouteCount();
  const closeSheet = useGameStore((state) => state.closeSheet);
  const haptics = useHaptics();
  const tabBarHeight = useTabBarHeight();
  const { take, repay } = useLoanActions();

  const [taking, setTaking] = useState<string | null>(null);
  const [repaying, setRepaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!airline) return null;

  const defaultPalette = getAirlinePalette("aviation-blue");
  const airlineName = airline.name ?? "Your airline";
  const airlineCode = airline.airline_code ?? "AIR";
  const airlineLogoId = airline.logo_id ?? DEFAULT_AIRLINE_LOGO_ID;
  const airlinePrimaryColor = airline.color ?? defaultPalette.primary;
  const airlineSecondaryColor =
    airline.secondary_color ?? defaultPalette.secondary;
  const difficulty = airline.difficulty ?? "normal";
  const rateMultiplier = RATE_MULTIPLIER[difficulty] ?? 1;
  const currentRate = airline.loan_rate ?? 0;
  const dailyInterestCost = loan > 0 ? dailyInterest(loan, currentRate) : 0;
  const availableCredit = Math.max(0, 50_000_000 - loan);

  const handleTake = async (pkg: LoanPackage, rate: number) => {
    haptics.confirm();
    setTaking(pkg.id);
    setError(null);
    setSuccess(null);

    const { error: requestError } = await take(pkg.amount, rate);

    setTaking(null);

    if (requestError) {
      setError(requestError);
      haptics.error();
      return;
    }

    setSuccess(
      `${fmtCash(pkg.amount)} borrowed. New loan balance: ${fmtCash(loan + pkg.amount)}.`,
    );
    haptics.success();
  };

  const reviewLoan = (pkg: LoanPackage, rate: number) => {
    const newBalance = loan + pkg.amount;
    const newDailyInterest = dailyInterest(newBalance, rate);

    Alert.alert(
      `Borrow ${fmtCash(pkg.amount)}?`,
      `New cash: ${fmtCash(cash + pkg.amount)}\nNew loan balance: ${fmtCash(newBalance)}\nAnnual rate: ${rate.toFixed(1)}%\nEstimated interest: ${fmtCash(newDailyInterest)} per day\n\nThis rate will apply to the full loan balance.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Borrow",
          onPress: () => void handleTake(pkg, rate),
        },
      ],
    );
  };

  const handleRepay = async (amount: number) => {
    haptics.confirm();
    setRepaying(true);
    setError(null);
    setSuccess(null);

    const { error: requestError } = await repay(amount);

    setRepaying(false);

    if (requestError) {
      setError(requestError);
      haptics.error();
      return;
    }

    const remainingLoan = Math.max(0, loan - amount);
    setSuccess(
      remainingLoan === 0
        ? "Loan fully repaid. Daily interest is now $0."
        : `${fmtCash(amount)} repaid. Remaining balance: ${fmtCash(remainingLoan)}.`,
    );
    haptics.success();
  };

  const reviewRepayment = (amount: number) => {
    const actualAmount = Math.min(amount, loan);
    const remainingLoan = Math.max(0, loan - actualAmount);
    const newDailyInterest = dailyInterest(remainingLoan, currentRate);

    Alert.alert(
      `Repay ${fmtCash(actualAmount)}?`,
      `Cash after repayment: ${fmtCash(cash - actualAmount)}\nLoan balance after repayment: ${fmtCash(remainingLoan)}\nEstimated interest: ${fmtCash(newDailyInterest)} per day`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Repay",
          onPress: () => void handleRepay(actualAmount),
        },
      ],
    );
  };

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
          <Text style={styles.title}>Bank</Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {airlineName} · {airlineCode} · Lending and repayment
          </Text>
        </View>
        <TouchableOpacity
          accessibilityLabel="Close bank"
          accessibilityRole="button"
          activeOpacity={0.7}
          onPress={closeSheet}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={22} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Current position</Text>
          <Text style={styles.sectionDetail}>Credit limit $50M</Text>
        </View>
        <View style={styles.summaryTable}>
          <SummaryRow label="Available cash" value={fmtCash(cash)} />
          <SummaryRow
            label="Loan balance"
            value={fmtCash(loan)}
            valueColor={loan > 0 ? Colors.red : Colors.muted}
          />
          <SummaryRow
            label="Available credit"
            value={fmtCash(availableCredit)}
          />
          <SummaryRow
            label="Annual rate"
            value={loan > 0 ? `${currentRate.toFixed(1)}%` : "No active rate"}
          />
          <SummaryRow
            label="Interest per day"
            value={loan > 0 ? `-${fmtCash(dailyInterestCost)}` : "$0"}
            valueColor={loan > 0 ? Colors.red : Colors.green}
            strong
            last
          />
        </View>
      </View>

      {loan > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Repay loan</Text>
          </View>
          <Text style={styles.sectionHelp}>
            Choose an amount. You will review the remaining cash, balance, and
            daily interest before repayment.
          </Text>
          <RepaymentOptions
            loan={loan}
            cash={cash}
            loading={repaying}
            onRequest={reviewRepayment}
          />
        </View>
      ) : null}

      {error ? <StatusMessage type="error" message={error} /> : null}
      {success ? <StatusMessage type="success" message={success} /> : null}

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Loan options</Text>
          <Text style={styles.sectionDetail}>
            Day {day} · {routeCount} active{" "}
            {routeCount === 1 ? "route" : "routes"}
          </Text>
        </View>
        <Text style={styles.sectionHelp}>
          Rates reflect {difficulty} difficulty. A new rate applies to your full
          outstanding balance.
        </Text>
        <View style={styles.offerList}>
          {LOAN_PACKAGES.map((pkg, index) => {
            const effectiveRate =
              Math.round(pkg.rate * rateMultiplier * 10) / 10;
            const locked = day < pkg.minDay || routeCount < pkg.minRoutes;
            const lockReason =
              day < pkg.minDay
                ? `Available from day ${pkg.minDay}`
                : `Requires ${pkg.minRoutes} active routes. You have ${routeCount}.`;

            return (
              <LoanOfferRow
                key={pkg.id}
                pkg={pkg}
                effectiveRate={effectiveRate}
                currentLoan={loan}
                availableCredit={availableCredit}
                locked={locked}
                lockReason={lockReason}
                taking={taking === pkg.id}
                onReview={reviewLoan}
                last={index === LOAN_PACKAGES.length - 1}
              />
            );
          })}
        </View>
      </View>

      <View style={styles.guidance}>
        <Ionicons
          name="information-circle-outline"
          size={18}
          color={Colors.muted}
        />
        <Text style={styles.guidanceText}>
          Borrow only when the expected route profit is greater than the added
          daily interest.
        </Text>
      </View>
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
  section: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  sectionHeading: {
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
  sectionHelp: {
    marginBottom: Spacing.md,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.body,
  },
  summaryTable: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  summaryRow: {
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
  summaryLabel: {
    flex: 1,
    color: Colors.muted,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
  },
  summaryValue: {
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
  repaymentButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
  },
  repaymentButton: {
    minWidth: 92,
    minHeight: MIN_TOUCH,
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderSection,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
  },
  repaymentButtonText: {
    color: Colors.skyDark,
    fontFamily: Typography.mono,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    fontWeight: Typography.weight.bold,
  },
  disabledControl: {
    opacity: 0.45,
  },
  disabledText: {
    color: Colors.muted,
  },
  statusMessage: {
    minHeight: 52,
    marginTop: Spacing.lg,
    marginHorizontal: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  statusText: {
    flex: 1,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.body,
    fontWeight: Typography.weight.medium,
  },
  offerList: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  offerRow: {
    paddingVertical: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  offerHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  offerHeadingCopy: {
    flex: 1,
    minWidth: 0,
  },
  offerName: {
    color: Colors.text,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
    fontWeight: Typography.weight.bold,
  },
  offerDescription: {
    marginTop: Spacing.xxs,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.body,
  },
  offerAmount: {
    flexShrink: 0,
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
    fontWeight: Typography.weight.bold,
  },
  offerFacts: {
    flexDirection: "row",
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  offerFact: {
    flex: 1,
    minWidth: 0,
    paddingRight: Spacing.xs,
  },
  offerFactLabel: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  offerFactValue: {
    marginTop: Spacing.xxs,
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    fontWeight: Typography.weight.bold,
  },
  requirementRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  requirementText: {
    flex: 1,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
  },
  reviewButton: {
    minHeight: MIN_TOUCH,
    marginTop: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
    backgroundColor: Colors.sky,
  },
  reviewButtonText: {
    color: Colors.textOnColor,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
    fontWeight: Typography.weight.bold,
  },
  guidance: {
    marginTop: Spacing.xl,
    marginHorizontal: Spacing.lg,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
  },
  guidanceText: {
    flex: 1,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.body,
  },
});
