/**
 * New-airline setup.
 *
 * Three short stages keep the first-run experience understandable:
 * airline details, visual identity, and challenge selection.
 */

import {
  AirlineBrandMark,
  type AirlineLogoId,
  type AirlinePaletteId,
} from "@/components/airline-identity";
import { AirlineBrandPicker } from "@/components/setup/AirlineBrandPicker";
import {
  Colors,
  MIN_TOUCH,
  Radius,
  Spacing,
  Typography,
} from "@/constants/theme";
import { useCreateAirline } from "@/hooks/useCreateAirline";
import { useHaptics } from "@/hooks/useHaptics";
import {
  DEFAULT_AIRLINE_LOGO_ID,
  DEFAULT_AIRLINE_PALETTE_ID,
  getAirlinePalette,
  suggestAirlineCode,
} from "@/lib/airlineBrand";
import { generateSeed } from "@/lib/seed";
import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type SetupStep = 0 | 1 | 2;
type DifficultyId = "easy" | "normal" | "hard";
type RivalDifficulty = "passive" | "balanced" | "aggressive";
type IconName = keyof typeof Ionicons.glyphMap;
type FocusedField = "name" | "code" | null;

interface DifficultyPreset {
  id: DifficultyId;
  icon: IconName;
  label: string;
  description: string;
  startingCash: number;
  loanRate: number;
  rivalCount: number;
  rivalDifficulty: RivalDifficulty;
}

const STEPS = ["Airline", "Identity", "Challenge"] as const;

const DIFFICULTIES: DifficultyPreset[] = [
  {
    id: "easy",
    icon: "leaf-outline",
    label: "Easy",
    description: "Extra room to learn the route and fleet systems.",
    startingCash: 5_000_000,
    loanRate: 3,
    rivalCount: 1,
    rivalDifficulty: "passive",
  },
  {
    id: "normal",
    icon: "options-outline",
    label: "Standard",
    description: "Balanced finances and active competition.",
    startingCash: 3_000_000,
    loanRate: 5,
    rivalCount: 2,
    rivalDifficulty: "balanced",
  },
  {
    id: "hard",
    icon: "trending-up-outline",
    label: "Hard",
    description: "Limited capital with aggressive rival airlines.",
    startingCash: 1_500_000,
    loanRate: 9,
    rivalCount: 3,
    rivalDifficulty: "aggressive",
  },
];

function formatStartingCash(value: number) {
  const millions = value / 1_000_000;
  return `$${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`;
}

export default function SetupScreen() {
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const createAirline = useCreateAirline();
  const scrollRef = useRef<ScrollView>(null);

  const [step, setStep] = useState<SetupStep>(0);
  const [name, setName] = useState("");
  const [airlineCode, setAirlineCode] = useState("");
  const [codeEdited, setCodeEdited] = useState(false);
  const [logoId, setLogoId] = useState<AirlineLogoId>(DEFAULT_AIRLINE_LOGO_ID);
  const [paletteId, setPaletteId] = useState<AirlinePaletteId>(
    DEFAULT_AIRLINE_PALETTE_ID,
  );
  const [difficulty, setDifficulty] = useState<DifficultyId>("normal");
  const [focusedField, setFocusedField] = useState<FocusedField>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPreset =
    DIFFICULTIES.find((preset) => preset.id === difficulty) ?? DIFFICULTIES[1];
  const selectedPalette = getAirlinePalette(paletteId);
  const detailsComplete = name.trim().length >= 2 && airlineCode.length === 3;
  const canContinue = step === 0 ? detailsComplete : true;

  const moveToStep = (nextStep: SetupStep) => {
    haptics.tap();
    setError(null);
    setFocusedField(null);
    setStep(nextStep);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    });
  };

  const handleCreate = async () => {
    if (!detailsComplete || loading) return;

    haptics.confirm();
    setLoading(true);
    setError(null);

    const result = await createAirline({
      name: name.trim(),
      airline_code: airlineCode,
      color: selectedPalette.primary,
      secondary_color: selectedPalette.secondary,
      logo_id: logoId,
      palette_id: paletteId,
      difficulty: selectedPreset.id,
      cash: selectedPreset.startingCash,
      loan: selectedPreset.startingCash,
      seed: generateSeed(),
      ai_count: selectedPreset.rivalCount,
      ai_difficulty: selectedPreset.rivalDifficulty,
    });

    setLoading(false);
    if (result.error) {
      setError(result.error);
      haptics.error();
      return;
    }

    haptics.success();
  };

  const handlePrimaryAction = () => {
    if (step < 2) {
      if (canContinue) moveToStep((step + 1) as SetupStep);
      return;
    }

    void handleCreate();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      <View style={[styles.frame, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <View style={styles.wordmark}>
            <Ionicons name="airplane" size={19} color={Colors.skyDark} />
            <Text style={styles.wordmarkText}>FlightCraft</Text>
          </View>
          <Text style={styles.stepCount}>Step {step + 1} of 3</Text>
        </View>

        <View style={styles.progress}>
          {STEPS.map((label, index) => {
            const active = index === step;
            const complete = index < step;
            return (
              <View key={label} style={styles.progressItem}>
                <View
                  accessibilityLabel={`${label}, step ${index + 1} of 3`}
                  accessibilityState={{ selected: active }}
                  style={styles.progressLabelRow}
                >
                  <Text
                    style={[
                      styles.progressNumber,
                      (active || complete) && styles.progressNumberActive,
                    ]}
                  >
                    {complete ? "✓" : index + 1}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.progressLabel,
                      active && styles.progressLabelActive,
                    ]}
                  >
                    {label}
                  </Text>
                </View>
                <View
                  style={[
                    styles.progressLine,
                    (active || complete) && styles.progressLineActive,
                  ]}
                />
              </View>
            );
          })}
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 0 ? (
            <AirlineStep
              airlineCode={airlineCode}
              focusedField={focusedField}
              logoId={logoId}
              name={name}
              onCodeChange={(value) => {
                setCodeEdited(true);
                setAirlineCode(
                  value
                    .toUpperCase()
                    .replace(/[^A-Z]/g, "")
                    .slice(0, 3),
                );
                setError(null);
              }}
              onFocusChange={setFocusedField}
              onNameChange={(value) => {
                setName(value);
                if (!codeEdited) setAirlineCode(suggestAirlineCode(value));
                setError(null);
              }}
              onSubmit={handlePrimaryAction}
              palettePrimary={selectedPalette.primary}
              paletteSecondary={selectedPalette.secondary}
            />
          ) : null}

          {step === 1 ? (
            <>
              <PageIntroduction
                description="Pick an emblem and livery colors. Every combination works across the map, fleet, routes, and rankings."
                title="Design your airline"
              />
              <AirlineBrandPicker
                airlineCode={airlineCode}
                airlineName={name}
                logoId={logoId}
                onLogoChange={(value) => {
                  haptics.tap();
                  setLogoId(value);
                  setError(null);
                }}
                onPaletteChange={(value) => {
                  haptics.tap();
                  setPaletteId(value);
                  setError(null);
                }}
                paletteId={paletteId}
              />
            </>
          ) : null}

          {step === 2 ? (
            <ChallengeStep
              airlineCode={airlineCode}
              difficulty={difficulty}
              logoId={logoId}
              name={name}
              onDifficultyChange={(value) => {
                haptics.tap();
                setDifficulty(value);
                setError(null);
              }}
              palettePrimary={selectedPalette.primary}
              paletteSecondary={selectedPalette.secondary}
              selectedPreset={selectedPreset}
            />
          ) : null}
        </ScrollView>

        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, Spacing.md) },
          ]}
        >
          {error ? (
            <View
              accessibilityLiveRegion="assertive"
              accessibilityRole="alert"
              style={styles.errorRow}
            >
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color={Colors.red}
              />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.footerActions}>
            {step > 0 ? (
              <Pressable
                accessibilityRole="button"
                disabled={loading}
                onPress={() => moveToStep((step - 1) as SetupStep)}
                style={({ pressed }) => [
                  styles.backButton,
                  pressed && styles.secondaryPressed,
                ]}
              >
                <Ionicons name="arrow-back" size={18} color={Colors.skyDark} />
                <Text style={styles.backButtonLabel}>Back</Text>
              </Pressable>
            ) : (
              <View />
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                disabled: !canContinue || loading,
                busy: loading,
              }}
              disabled={!canContinue || loading}
              onPress={handlePrimaryAction}
              style={({ pressed }) => [
                styles.primaryButton,
                (!canContinue || loading) && styles.primaryButtonDisabled,
                pressed && canContinue && styles.primaryButtonPressed,
              ]}
            >
              {loading ? (
                <ActivityIndicator color={Colors.textOnColor} size="small" />
              ) : (
                <>
                  <Text style={styles.primaryButtonLabel}>
                    {step === 2 ? "Start airline" : "Continue"}
                  </Text>
                  <Ionicons
                    name={step === 2 ? "airplane" : "arrow-forward"}
                    size={18}
                    color={Colors.textOnColor}
                  />
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function PageIntroduction({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <View style={styles.introduction}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

interface AirlineStepProps {
  airlineCode: string;
  focusedField: FocusedField;
  logoId: AirlineLogoId;
  name: string;
  palettePrimary: string;
  paletteSecondary: string;
  onCodeChange: (value: string) => void;
  onFocusChange: (value: FocusedField) => void;
  onNameChange: (value: string) => void;
  onSubmit: () => void;
}

function AirlineStep({
  airlineCode,
  focusedField,
  logoId,
  name,
  palettePrimary,
  paletteSecondary,
  onCodeChange,
  onFocusChange,
  onNameChange,
  onSubmit,
}: AirlineStepProps) {
  return (
    <>
      <PageIntroduction
        description="This identity appears on your aircraft, route reports, and the global leaderboard."
        title="Name your airline"
      />

      <View
        accessibilityLabel="Airline livery preview"
        style={[styles.liveryPreview, { backgroundColor: palettePrimary }]}
      >
        <View style={styles.routeArtwork}>
          <View style={styles.routeLine} />
          <View style={styles.routeOrigin} />
          <Ionicons
            name="airplane"
            size={34}
            color={Colors.textOnColor}
            style={styles.previewPlane}
          />
          <View style={styles.routeDestination} />
        </View>
        <View style={styles.previewIdentity}>
          <AirlineBrandMark
            accessibilityLabel="Selected airline emblem"
            logoId={logoId}
            primary={Colors.textOnColor}
            secondary={paletteSecondary}
            size={52}
            variant="emblem"
          />
          <View style={styles.previewCopy}>
            <Text numberOfLines={1} style={styles.previewName}>
              {name.trim() || "Your airline"}
            </Text>
            <Text style={styles.previewCode}>
              {airlineCode || "---"} · EST. DAY 1
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.fieldLabel}>Airline name</Text>
      <TextInput
        accessibilityLabel="Airline name"
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={28}
        onBlur={() => onFocusChange(null)}
        onChangeText={onNameChange}
        onFocus={() => onFocusChange("name")}
        placeholder="Example: Northstar Air"
        placeholderTextColor={Colors.dim}
        returnKeyType="next"
        style={[styles.input, focusedField === "name" && styles.inputFocused]}
        value={name}
      />
      <View style={styles.inputFooter}>
        <Text style={styles.helpText}>
          Use a name between 2 and 28 characters.
        </Text>
        <Text style={styles.characterCount}>{name.trim().length}/28</Text>
      </View>

      <Text style={styles.fieldLabel}>Airline code</Text>
      <View style={styles.codeRow}>
        <TextInput
          accessibilityHint="Enter exactly three letters"
          accessibilityLabel="Three-letter airline code"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={3}
          onBlur={() => onFocusChange(null)}
          onChangeText={onCodeChange}
          onFocus={() => onFocusChange("code")}
          onSubmitEditing={onSubmit}
          placeholder="NSA"
          placeholderTextColor={Colors.dim}
          returnKeyType="next"
          style={[
            styles.input,
            styles.codeInput,
            focusedField === "code" && styles.inputFocused,
          ]}
          value={airlineCode}
        />
        <Text style={styles.codeHelp}>
          Used on map labels, aircraft tails, and route schedules.
        </Text>
      </View>
    </>
  );
}

interface ChallengeStepProps {
  airlineCode: string;
  difficulty: DifficultyId;
  logoId: AirlineLogoId;
  name: string;
  palettePrimary: string;
  paletteSecondary: string;
  selectedPreset: DifficultyPreset;
  onDifficultyChange: (value: DifficultyId) => void;
}

function ChallengeStep({
  airlineCode,
  difficulty,
  logoId,
  name,
  palettePrimary,
  paletteSecondary,
  selectedPreset,
  onDifficultyChange,
}: ChallengeStepProps) {
  return (
    <>
      <PageIntroduction
        description="Difficulty changes your starting funds, loan rate, and rival pressure. Standard is recommended for a first airline."
        title="Choose your challenge"
      />

      <View accessibilityRole="radiogroup" style={styles.difficultyList}>
        {DIFFICULTIES.map((preset, index) => {
          const selected = preset.id === difficulty;
          return (
            <Pressable
              accessibilityLabel={`${preset.label}. ${preset.description} Starts with ${formatStartingCash(preset.startingCash)}, ${preset.loanRate}% loan interest, and ${preset.rivalCount} rival airlines.`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              key={preset.id}
              onPress={() => onDifficultyChange(preset.id)}
              style={({ pressed }) => [
                styles.difficultyRow,
                index > 0 && styles.rowDivider,
                selected && styles.difficultySelected,
                pressed && styles.rowPressed,
              ]}
            >
              <View style={styles.difficultyIcon}>
                <Ionicons
                  name={preset.icon}
                  size={21}
                  color={selected ? Colors.skyDark : Colors.muted}
                />
              </View>
              <View style={styles.difficultyCopy}>
                <View style={styles.difficultyTitleRow}>
                  <Text
                    style={[
                      styles.difficultyLabel,
                      selected && styles.difficultyLabelSelected,
                    ]}
                  >
                    {preset.label}
                  </Text>
                  {preset.id === "normal" ? (
                    <Text style={styles.recommendedLabel}>Recommended</Text>
                  ) : null}
                </View>
                <Text style={styles.difficultyDescription}>
                  {preset.description}
                </Text>
                <Text style={styles.difficultyValues}>
                  {formatStartingCash(preset.startingCash)} cash ·{" "}
                  {preset.loanRate}% interest · {preset.rivalCount}{" "}
                  {preset.rivalCount === 1 ? "rival" : "rivals"}
                </Text>
              </View>
              <Ionicons
                name={selected ? "radio-button-on" : "radio-button-off"}
                size={22}
                color={selected ? Colors.sky : Colors.dim}
              />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.reviewSection}>
        <Text style={styles.reviewHeading}>Ready for departure</Text>
        <View style={styles.reviewIdentity}>
          <AirlineBrandMark
            accessibilityLabel={`${name} emblem`}
            logoId={logoId}
            primary={palettePrimary}
            secondary={paletteSecondary}
            size={48}
            variant="emblem"
          />
          <View style={styles.reviewIdentityCopy}>
            <Text numberOfLines={1} style={styles.reviewName}>
              {name.trim()}
            </Text>
            <Text style={styles.reviewCode}>{airlineCode}</Text>
          </View>
        </View>

        <View style={styles.reviewTable}>
          <ReviewRow label="Challenge" value={selectedPreset.label} />
          <ReviewRow
            label="Starting cash"
            mono
            value={formatStartingCash(selectedPreset.startingCash)}
          />
          <ReviewRow
            label="Rival airlines"
            mono
            value={`${selectedPreset.rivalCount}`}
          />
        </View>
      </View>

      <View style={styles.firstAssignment}>
        <Ionicons name="location-outline" size={21} color={Colors.skyDark} />
        <View style={styles.firstAssignmentCopy}>
          <Text style={styles.firstAssignmentLabel}>First assignment</Text>
          <Text style={styles.firstAssignmentText}>
            The guided opening will help you choose a hub, buy an aircraft, open
            a route, and begin service.
          </Text>
        </View>
      </View>
    </>
  );
}

function ReviewRow({
  label,
  mono = false,
  value,
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={mono ? styles.reviewValueMono : styles.reviewValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.surface },
  frame: { flex: 1, backgroundColor: Colors.bg },
  topBar: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  wordmark: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  wordmarkText: {
    color: Colors.text,
    fontSize: Typography.size.body,
    fontWeight: Typography.weight.bold,
  },
  stepCount: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: Typography.size.caption,
  },
  progress: { flexDirection: "row", backgroundColor: Colors.surface },
  progressItem: { flex: 1 },
  progressLabelRow: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  progressNumber: {
    color: Colors.dim,
    fontFamily: Typography.mono,
    fontSize: Typography.size.caption,
  },
  progressNumberActive: { color: Colors.skyDark },
  progressLabel: {
    color: Colors.dim,
    fontSize: Typography.size.caption,
    fontWeight: Typography.weight.medium,
  },
  progressLabelActive: {
    color: Colors.text,
    fontWeight: Typography.weight.bold,
  },
  progressLine: { height: 3, backgroundColor: Colors.border },
  progressLineActive: { backgroundColor: Colors.sky },
  content: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
  introduction: { marginBottom: Spacing.xl, gap: Spacing.sm },
  title: {
    color: Colors.text,
    fontSize: Typography.size.display,
    fontWeight: Typography.weight.bold,
    lineHeight: Typography.lineHeight.display,
  },
  description: {
    maxWidth: 540,
    color: Colors.muted,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
  },
  liveryPreview: {
    minHeight: 188,
    justifyContent: "space-between",
    overflow: "hidden",
    marginBottom: Spacing.xl,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
  },
  routeArtwork: { height: 74, justifyContent: "center" },
  routeLine: {
    height: 2,
    marginHorizontal: Spacing.md,
    backgroundColor: "rgba(255,255,255,0.54)",
    transform: [{ rotate: "-7deg" }],
  },
  routeOrigin: {
    position: "absolute",
    left: Spacing.md,
    bottom: 22,
    width: 9,
    height: 9,
    backgroundColor: Colors.textOnColor,
    borderRadius: Radius.full,
  },
  routeDestination: {
    position: "absolute",
    right: Spacing.md,
    top: 18,
    width: 9,
    height: 9,
    backgroundColor: Colors.textOnColor,
    borderRadius: Radius.full,
  },
  previewPlane: {
    position: "absolute",
    left: "46%",
    top: 17,
    transform: [{ rotate: "-7deg" }],
  },
  previewIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  previewCopy: { flex: 1, minWidth: 0 },
  previewName: {
    color: Colors.textOnColor,
    fontSize: Typography.size.title,
    fontWeight: Typography.weight.bold,
    lineHeight: Typography.lineHeight.title,
  },
  previewCode: {
    marginTop: Spacing.xs,
    color: "rgba(255,255,255,0.82)",
    fontFamily: Typography.mono,
    fontSize: Typography.size.caption,
  },
  fieldLabel: {
    marginBottom: Spacing.sm,
    color: Colors.text,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.semibold,
  },
  input: {
    minHeight: 52,
    paddingHorizontal: Spacing.md,
    color: Colors.text,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSection,
    borderRadius: Radius.md,
    fontSize: Typography.size.body,
  },
  inputFocused: {
    borderWidth: 2,
    borderColor: Colors.borderHi,
    paddingHorizontal: Spacing.md - 1,
  },
  inputFooter: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
    paddingTop: Spacing.xs,
  },
  helpText: {
    flex: 1,
    color: Colors.dim,
    fontSize: Typography.size.caption,
  },
  characterCount: {
    color: Colors.dim,
    fontFamily: Typography.mono,
    fontSize: Typography.size.caption,
  },
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  codeInput: {
    width: 112,
    fontFamily: Typography.mono,
    fontSize: Typography.size.title,
    letterSpacing: 2,
    textAlign: "center",
  },
  codeHelp: {
    flex: 1,
    color: Colors.dim,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  difficultyList: {
    overflow: "hidden",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSection,
    borderRadius: Radius.lg,
  },
  difficultyRow: {
    minHeight: 116,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  difficultySelected: { backgroundColor: Colors.skyDim },
  rowPressed: { backgroundColor: Colors.inset },
  difficultyIcon: {
    width: 32,
    minHeight: 28,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  difficultyCopy: { flex: 1, minWidth: 0 },
  difficultyTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  difficultyLabel: {
    color: Colors.text,
    fontSize: Typography.size.body,
    fontWeight: Typography.weight.bold,
  },
  difficultyLabelSelected: { color: Colors.skyDark },
  recommendedLabel: {
    color: Colors.skyDark,
    fontSize: Typography.size.caption,
    fontWeight: Typography.weight.semibold,
  },
  difficultyDescription: {
    marginTop: Spacing.xs,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
  },
  difficultyValues: {
    marginTop: Spacing.sm,
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  reviewSection: {
    marginTop: Spacing.xl,
    paddingTop: Spacing.xl,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
  },
  reviewHeading: {
    marginBottom: Spacing.md,
    color: Colors.text,
    fontSize: Typography.size.title,
    fontWeight: Typography.weight.bold,
  },
  reviewIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  reviewIdentityCopy: { flex: 1, minWidth: 0 },
  reviewName: {
    color: Colors.text,
    fontSize: Typography.size.body,
    fontWeight: Typography.weight.bold,
  },
  reviewCode: {
    marginTop: Spacing.xs,
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: Typography.size.caption,
  },
  reviewTable: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
  },
  reviewRow: {
    minHeight: MIN_TOUCH + 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  reviewLabel: { color: Colors.muted, fontSize: Typography.size.label },
  reviewValue: {
    color: Colors.text,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.semibold,
  },
  reviewValueMono: {
    color: Colors.text,
    fontFamily: Typography.mono,
    fontSize: Typography.size.label,
  },
  firstAssignment: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    marginTop: Spacing.xl,
    padding: Spacing.lg,
    backgroundColor: Colors.skyDim,
    borderRadius: Radius.md,
  },
  firstAssignmentCopy: { flex: 1 },
  firstAssignmentLabel: {
    color: Colors.skyDark,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.bold,
  },
  firstAssignmentText: {
    marginTop: Spacing.xs,
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.body,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
  },
  errorRow: {
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  errorText: {
    flex: 1,
    color: Colors.red,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
  },
  footerActions: {
    minHeight: 52,
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  backButton: {
    minWidth: 94,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderSection,
    borderRadius: Radius.md,
  },
  backButtonLabel: {
    color: Colors.skyDark,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.bold,
  },
  secondaryPressed: { backgroundColor: Colors.inset },
  primaryButton: {
    minWidth: 150,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.sky,
    borderRadius: Radius.md,
  },
  primaryButtonDisabled: { backgroundColor: Colors.borderSection },
  primaryButtonPressed: { backgroundColor: Colors.skyDark },
  primaryButtonLabel: {
    color: Colors.textOnColor,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.bold,
  },
});
