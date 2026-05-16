/**
 * app/(game)/setup.tsx
 *
 * New game setup — shown once for fresh players.
 * Three steps:
 *   1. Airline name
 *   2. Brand color
 *   3. Difficulty
 *
 * On confirm → inserts row into Supabase airlines table
 *             → setAirline() in store
 *             → setPhase("playing")
 *             → game screen takes over
 */

import { Colors, MIN_TOUCH, Radius, Spacing } from "@/constants/theme";
import { useCreateAirline } from "@/hooks/useCreateAirline";
import { useHaptics } from "@/hooks/useHaptics";
import { generateSeed } from "@/lib/seed";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: SCREEN_W } = Dimensions.get("window");
const CONTENT_W = SCREEN_W - Spacing.lg * 2;

// ── Brand colours the player can pick ─────────────────────────
const BRAND_COLORS = [
  { label: "Sky", hex: "#38BDF8" },
  { label: "Emerald", hex: "#4ade80" },
  { label: "Amber", hex: "#fbbf24" },
  { label: "Rose", hex: "#fb7185" },
  { label: "Violet", hex: "#a78bfa" },
  { label: "Orange", hex: "#f97316" },
  { label: "Teal", hex: "#2dd4bf" },
  { label: "White", hex: "#e2e8f0" },
];

// ── Airline name suggestions ───────────────────────────────────
const NAME_SUGGESTIONS = [
  "Pacific Wings",
  "Horizon Air",
  "Skyline Express",
  "Atlas Airlines",
  "Meridian Air",
  "Apex Airways",
  "Nova Air",
  "Stratos Wings",
];

// ── Difficulty presets ─────────────────────────────────────────
const DIFFICULTIES = [
  {
    id: "easy",
    label: "Easy",
    desc: "Start with $5M · Low interest · Forgiving",
    cash: 5_000_000,
    rate: 3,
    color: Colors.green,
  },
  {
    id: "normal",
    label: "Normal",
    desc: "Start with $3M · Standard interest · Balanced",
    cash: 3_000_000,
    rate: 5,
    color: Colors.sky,
  },
  {
    id: "hard",
    label: "Hard",
    desc: "Start with $1.5M · High interest · No mercy",
    cash: 1_500_000,
    rate: 9,
    color: Colors.red,
  },
];

// ── Step indicator ─────────────────────────────────────────────
function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <View style={sd.row}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            sd.dot,
            i < current && sd.dotDone,
            i === current && sd.dotActive,
          ]}
        />
      ))}
    </View>
  );
}
const sd = StyleSheet.create({
  row: { flexDirection: "row", gap: 6, alignItems: "center" },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.dim },
  dotDone: { backgroundColor: Colors.sky, width: 12 },
  dotActive: { backgroundColor: Colors.sky, width: 18 },
});

// ── Main component ─────────────────────────────────────────────
export default function SetupScreen() {
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const createAirline = useCreateAirline();

  const [step, setStep] = useState(0); // 0=name, 1=color, 2=difficulty
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(BRAND_COLORS[0].hex);
  const [difficulty, setDifficulty] = useState("normal");
  const [seed, setSeed] = useState(() => generateSeed());
  const [aiCount, setAiCount] = useState(2);
  const [aiDiff, setAiDiff] = useState("balanced");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slideAnim = useRef(new Animated.Value(0)).current;

  const goToStep = useCallback(
    (next: number) => {
      haptics.tap();
      Animated.timing(slideAnim, {
        toValue: -next * CONTENT_W,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setStep(next));
    },
    [haptics, slideAnim],
  );

  const handleConfirm = async () => {
    haptics.confirm();
    setLoading(true);
    setError(null);

    const diff = DIFFICULTIES.find((d) => d.id === difficulty)!;
    const { error: err } = await createAirline({
      name: name.trim(),
      color,
      difficulty,
      cash: diff.cash,
      loan: diff.cash,
      seed: (
        seed
          .trim()
          .toUpperCase()
          .replace(/[^A-F0-9]/g, "") || generateSeed()
      ).slice(0, 16),
      ai_count: aiCount,
      ai_difficulty: aiDiff,
    });

    setLoading(false);

    if (err) {
      setError(err);
      haptics.error();
      return;
    }

    haptics.success();
    // phase is set to "playing" inside createAirline
  };

  const diff = DIFFICULTIES.find((d) => d.id === difficulty)!;
  const canNext = step === 0 ? name.trim().length >= 2 : true;

  return (
    <KeyboardAvoidingView
      style={{
        flex: 1,
        backgroundColor: Colors.bg,
        paddingBottom: Spacing.xxl,
      }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View
        style={[
          s.root,
          {
            paddingTop: insets.top + Spacing.lg,
            paddingBottom: insets.bottom + Spacing.lg,
          },
        ]}
      >
        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>Your Airline</Text>
          <StepDots current={step} total={3} />
        </View>

        {/* Slides */}
        <View style={s.slideWrap}>
          <Animated.View
            style={[s.slides, { transform: [{ translateX: slideAnim }] }]}
          >
            {/* ── Step 0: Name ── */}
            <ScrollView
              style={s.slide}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: Spacing.xl }}
            >
              <Text style={s.slideTitle}>Name your airline</Text>
              <Text style={s.slideDesc}>
                This is how you&apos;ll appear on the leaderboard.
              </Text>

              <TextInput
                style={[s.input, name.length > 0 && s.inputActive]}
                value={name}
                onChangeText={(v) => {
                  setName(v);
                  setError(null);
                }}
                placeholder="e.g. Pacific Wings"
                placeholderTextColor={Colors.dim}
                autoFocus
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={28}
                returnKeyType="next"
                onSubmitEditing={() => canNext && goToStep(1)}
              />

              <Text style={s.charCount}>{name.trim().length}/28</Text>

              {/* Suggestions */}
              <Text style={s.suggestLabel}>SUGGESTIONS</Text>
              <View style={s.suggestions}>
                {NAME_SUGGESTIONS.map((n) => (
                  <TouchableOpacity
                    key={n}
                    style={s.suggestion}
                    onPress={() => {
                      haptics.tap();
                      setName(n);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={s.suggestionText}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* ── Step 1: Color ── */}
            <ScrollView
              style={s.slide}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: Spacing.xl }}
            >
              <Text style={s.slideTitle}>Choose your color</Text>
              <Text style={s.slideDesc}>
                Your brand color appears on hubs and routes.
              </Text>

              {/* Preview */}
              <View style={s.colorPreview}>
                <View
                  style={[
                    s.iconBox,
                    {
                      backgroundColor: color + "22",
                      borderColor: color + "44",
                    },
                  ]}
                >
                  <Ionicons name="airplane" size={24} color={color} />
                </View>
                <View style={s.colorPreviewLines}>
                  <View
                    style={[
                      s.colorPreviewLine,
                      { backgroundColor: color, width: "80%", opacity: 0.8 },
                    ]}
                  />
                  <View
                    style={[
                      s.colorPreviewLine,
                      { backgroundColor: color, width: "55%", opacity: 0.5 },
                    ]}
                  />
                  <View
                    style={[
                      s.colorPreviewLine,
                      { backgroundColor: color, width: "65%", opacity: 0.3 },
                    ]}
                  />
                </View>
                <Text style={[s.colorPreviewName, { color }]}>
                  {name.trim() || "Your Airline"}
                </Text>
              </View>

              {/* Color grid */}
              <View style={s.colorGrid}>
                {BRAND_COLORS.map((c) => (
                  <TouchableOpacity
                    key={c.hex}
                    style={[
                      s.colorSwatch,
                      {
                        backgroundColor: c.hex + "22",
                        borderColor: c.hex + "44",
                      },
                      color === c.hex && { borderColor: c.hex, borderWidth: 2 },
                    ]}
                    onPress={() => {
                      haptics.tap();
                      setColor(c.hex);
                    }}
                    activeOpacity={0.8}
                  >
                    <View
                      style={[s.colorSwatchDot, { backgroundColor: c.hex }]}
                    />
                    <Text style={[s.colorSwatchLabel, { color: c.hex }]}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* ── Step 2: Difficulty ── */}
            <ScrollView
              style={s.slide}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: Spacing.xl }}
            >
              <Text style={s.slideTitle}>Choose difficulty</Text>
              <Text style={s.slideDesc}>
                This affects your starting cash and loan interest rate.
              </Text>

              <View style={s.diffList}>
                {DIFFICULTIES.map((d) => {
                  const active = difficulty === d.id;
                  return (
                    <TouchableOpacity
                      key={d.id}
                      style={[
                        s.diffCard,
                        active && {
                          borderColor: d.color + "66",
                          backgroundColor: d.color + "0a",
                        },
                      ]}
                      onPress={() => {
                        haptics.tap();
                        setDifficulty(d.id);
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={s.diffRow}>
                        <View
                          style={[s.diffDot, { backgroundColor: d.color }]}
                        />
                        <View style={s.diffBody}>
                          <Text
                            style={[s.diffLabel, active && { color: d.color }]}
                          >
                            {d.label}
                          </Text>
                          <Text style={s.diffDesc}>{d.desc}</Text>
                        </View>
                        {active && (
                          <View
                            style={[
                              s.diffCheck,
                              {
                                backgroundColor: d.color + "22",
                                borderColor: d.color + "44",
                              },
                            ]}
                          >
                            <Text style={[s.diffCheckText, { color: d.color }]}>
                              ✓
                            </Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Summary */}
              <View style={s.summary}>
                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>Airline</Text>
                  <Text style={[s.summaryValue, { color }]}>{name.trim()}</Text>
                </View>
                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>Starting cash</Text>
                  <Text style={s.summaryValue}>
                    ${(diff.cash / 1_000_000).toFixed(1)}M
                  </Text>
                </View>
                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>Loan interest</Text>
                  <Text style={s.summaryValue}>{diff.rate}% / year</Text>
                </View>
              </View>

              {/* Advanced — seed + AI, hidden by default */}
              <TouchableOpacity
                style={s.advancedToggle}
                onPress={() => {
                  haptics.tap();
                  setShowAdvanced((v) => !v);
                }}
                activeOpacity={0.7}
              >
                <Text style={s.advancedToggleTxt}>
                  {showAdvanced ? "Hide" : "Advanced settings"}
                </Text>
                <Ionicons
                  name={showAdvanced ? "chevron-up" : "chevron-down"}
                  size={12}
                  color={Colors.dim}
                />
              </TouchableOpacity>

              {showAdvanced && (
                <View style={s.advancedBox}>
                  <Text style={s.sectionLabel}>GAME SEED</Text>
                  <Text style={s.sectionSub}>
                    Same seed = same world. Share to compare scores.
                  </Text>
                  <View style={s.seedRow}>
                    <TextInput
                      style={s.seedInput}
                      value={seed}
                      onChangeText={(v) =>
                        setSeed(
                          v
                            .toUpperCase()
                            .replace(/[^A-F0-9]/g, "")
                            .slice(0, 16),
                        )
                      }
                      placeholder="Random seed"
                      placeholderTextColor={Colors.dim}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={16}
                    />
                    <TouchableOpacity
                      style={s.seedRoll}
                      onPress={() => {
                        haptics.tap();
                        setSeed(generateSeed());
                      }}
                    >
                      <Ionicons
                        name="dice-outline"
                        size={18}
                        color={Colors.sky}
                      />
                    </TouchableOpacity>
                  </View>

                  <Text style={[s.sectionLabel, { marginTop: Spacing.md }]}>
                    AI RIVALS
                  </Text>
                  <View style={s.aiCountRow}>
                    {[0, 1, 2, 3, 4, 5].map((n) => (
                      <TouchableOpacity
                        key={n}
                        style={[
                          s.aiCountBtn,
                          aiCount === n && {
                            backgroundColor: diff.color + "22",
                            borderColor: diff.color,
                          },
                        ]}
                        onPress={() => {
                          haptics.tap();
                          setAiCount(n);
                        }}
                      >
                        <Text
                          style={[
                            s.aiCountTxt,
                            aiCount === n && { color: diff.color },
                          ]}
                        >
                          {n === 0 ? "None" : n}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {aiCount > 0 && (
                    <View style={[s.aiDiffRow, { marginTop: Spacing.sm }]}>
                      {[
                        {
                          id: "passive",
                          label: "Passive",
                          icon: "leaf-outline",
                          desc: "Avoids your routes",
                        },
                        {
                          id: "balanced",
                          label: "Balanced",
                          icon: "scale-outline",
                          desc: "Some overlap",
                        },
                        {
                          id: "aggressive",
                          label: "Aggressive",
                          icon: "flame-outline",
                          desc: "Targets you",
                        },
                      ].map((opt) => (
                        <TouchableOpacity
                          key={opt.id}
                          style={[
                            s.aiDiffBtn,
                            aiDiff === opt.id && {
                              borderColor: diff.color,
                              backgroundColor: diff.color + "12",
                            },
                          ]}
                          onPress={() => {
                            haptics.tap();
                            setAiDiff(opt.id);
                          }}
                          activeOpacity={0.8}
                        >
                          <Ionicons
                            name={opt.icon as any}
                            size={14}
                            color={aiDiff === opt.id ? diff.color : Colors.dim}
                          />
                          <Text
                            style={[
                              s.aiDiffLabel,
                              aiDiff === opt.id && { color: diff.color },
                            ]}
                          >
                            {opt.label}
                          </Text>
                          <Text style={s.aiDiffDesc}>{opt.desc}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {error && (
                <View style={s.errorBox}>
                  <Text style={s.errorText}>{error}</Text>
                </View>
              )}
            </ScrollView>

            {/* Advanced section — inside difficulty step, hidden by default */}
          </Animated.View>
        </View>

        {/* Footer buttons */}
        <View style={s.footer}>
          {step > 0 && (
            <TouchableOpacity
              style={s.backBtn}
              onPress={() => goToStep(step - 1)}
              activeOpacity={0.7}
            >
              <Text style={s.backText}>← Back</Text>
            </TouchableOpacity>
          )}

          {step < 2 ? (
            <TouchableOpacity
              style={[s.nextBtn, !canNext && s.nextBtnDisabled]}
              onPress={() => canNext && goToStep(step + 1)}
              disabled={!canNext}
              activeOpacity={0.85}
            >
              <Text style={[s.nextText, !canNext && s.nextTextDisabled]}>
                Continue →
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                s.nextBtn,
                { backgroundColor: color },
                loading && s.nextBtnDisabled,
              ]}
              onPress={handleConfirm}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={Colors.bg} size="small" />
              ) : (
                <Text style={[s.nextText, { color: Colors.bg }]}>
                  Launch Airline ✈
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Styles ─────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
    paddingHorizontal: Spacing.lg,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.xl,
  },
  headerTitle: {
    fontSize: 11,
    color: Colors.dim,
    letterSpacing: 2.5,
    fontWeight: "600",
  },

  // Slides
  slideWrap: { flex: 1, overflow: "hidden" },
  slides: {
    flexDirection: "row",
    width: CONTENT_W * 3,
  },
  slide: {
    width: CONTENT_W,
    paddingRight: Spacing.xs ?? 4,
  },
  slideTitle: {
    fontSize: 24,
    color: Colors.text,
    fontWeight: "700",
    marginBottom: Spacing.sm,
    letterSpacing: 0.3,
  },
  slideDesc: {
    fontSize: 13,
    color: Colors.muted,
    lineHeight: 20,
    marginBottom: Spacing.xl,
  },

  // Name step
  input: {
    backgroundColor: "rgba(255,255,255,.05)",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    fontSize: 18,
    color: Colors.text,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: Spacing.xs ?? 4,
  },
  inputActive: {
    borderColor: Colors.borderHi,
  },
  charCount: {
    fontSize: 10,
    color: Colors.dim,
    textAlign: "right",
    marginBottom: Spacing.lg,
  },
  suggestLabel: {
    fontSize: 9,
    color: Colors.dim,
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  suggestions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  suggestion: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs ?? 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(255,255,255,.03)",
  },
  suggestionText: {
    fontSize: 11,
    color: Colors.muted,
  },

  // Color step
  colorPreview: {
    backgroundColor: "rgba(255,255,255,.04)",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    alignItems: "center",
    gap: Spacing.sm,
  },
  colorPreviewDot: {
    width: 48,
    height: 48,
    borderRadius: 12,
    marginBottom: Spacing.xs ?? 4,
  },
  colorPreviewLines: { gap: 5, width: "100%", alignItems: "center" },
  colorPreviewLine: {
    height: 3,
    borderRadius: 2,
  },
  colorPreviewName: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: Spacing.xs ?? 4,
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
  },
  colorSwatch: {
    width: (CONTENT_W - Spacing.lg * 2 - 10 * 3) / 4,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: "center",
    gap: 5,
  },
  colorSwatchDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  colorSwatchLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.5,
  },

  // Difficulty step
  diffList: { gap: Spacing.sm, marginBottom: Spacing.lg },
  diffCard: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    backgroundColor: "rgba(255,255,255,.02)",
  },
  diffRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  diffDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  diffBody: { flex: 1 },
  diffLabel: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: "600",
    marginBottom: 2,
  },
  diffDesc: {
    fontSize: 11,
    color: Colors.dim,
    lineHeight: 16,
  },
  diffCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  diffCheckText: { fontSize: 12, fontWeight: "700" },

  // Summary
  summary: {
    backgroundColor: "rgba(255,255,255,.03)",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: { fontSize: 11, color: Colors.dim },
  summaryValue: {
    fontSize: 12,
    color: Colors.text,
    fontWeight: "600",
  },

  // Error
  errorBox: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: "rgba(248,113,113,.08)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,.2)",
  },
  errorText: { fontSize: 11, color: Colors.red },

  // Footer
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  backBtn: {
    minHeight: MIN_TOUCH,
    justifyContent: "center",
    paddingHorizontal: Spacing.sm,
  },
  backText: { fontSize: 13, color: Colors.muted },
  nextBtn: {
    flex: 1,
    minHeight: MIN_TOUCH,
    backgroundColor: Colors.sky,
    borderRadius: Radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  nextBtnDisabled: { opacity: 0.4 },
  nextText: {
    fontSize: 13,
    color: Colors.bg,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  nextTextDisabled: { color: Colors.dim },
  // Seed + AI styles
  advancedToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: Spacing.md,
    paddingVertical: 8,
    alignSelf: "flex-start",
  },
  advancedToggleTxt: {
    fontSize: 12,
    color: Colors.dim,
    fontWeight: "600",
  },
  advancedBox: {
    marginTop: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(255,255,255,0.02)",
    gap: Spacing.sm,
  },
  sectionLabel: {
    fontSize: 9,
    color: Colors.dim,
    letterSpacing: 2,
    marginBottom: 4,
    marginTop: Spacing.sm,
  },
  sectionSub: {
    fontSize: 11,
    color: Colors.muted,
    lineHeight: 16,
    marginBottom: Spacing.sm,
  },
  seedRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  seedInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,.05)",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    fontSize: 14,
    color: Colors.sky,
    fontWeight: "700",
    letterSpacing: 2,
  },
  seedRoll: {
    width: 44,
    height: 44,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  aiCountRow: { flexDirection: "row", gap: 6, marginBottom: Spacing.sm },
  aiCountBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
  },
  aiCountTxt: { fontSize: 11, color: Colors.muted, fontWeight: "600" },
  aiDiffRow: { gap: Spacing.sm },
  aiDiffBtn: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  aiDiffLabel: { fontSize: 13, color: Colors.text, fontWeight: "600", flex: 1 },
  aiDiffDesc: { fontSize: 10, color: Colors.dim },

  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
