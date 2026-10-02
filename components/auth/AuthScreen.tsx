/**
 * Play Games sign-in and the first step of the new-airline journey.
 *
 * The loader has already attempted sign-in before this screen appears. This
 * view provides a clear recovery action and explains the first three gameplay
 * decisions without pretending that an airline has already been created.
 */

import {
  Colors,
  MIN_TOUCH,
  Radius,
  Spacing,
  Typography,
} from "@/constants/theme";
import { setPlayerId } from "@/hooks/useAuth";
import { useHaptics } from "@/hooks/useHaptics";
import { signInWithPlayGames } from "@/hooks/usePlayGames";
import { useGameStore } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const PLAY_GAMES_URL =
  "https://play.google.com/store/apps/details?id=com.google.android.play.games";

const FIRST_FLIGHT_PLAN = [
  {
    number: "01",
    icon: "color-palette-outline" as const,
    title: "Create your airline",
    description: "Choose its name, three-letter code, colors, and emblem.",
  },
  {
    number: "02",
    icon: "map-outline" as const,
    title: "Open your first route",
    description:
      "Select a hub and connect it to a market with passenger demand.",
  },
  {
    number: "03",
    icon: "airplane-outline" as const,
    title: "Assign an aircraft",
    description: "Match range and daily seats, then begin carrying passengers.",
  },
];

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const setPhase = useGameStore((state) => state.setPhase);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [openingStore, setOpeningStore] = useState(false);

  const handleSignIn = async () => {
    if (isLoading) return;

    haptics.confirm();
    setError(null);
    setIsLoading(true);

    try {
      const player = await signInWithPlayGames();

      if (!player?.playerId) {
        setError(
          "Unable to sign in. Check that Google Play Games is installed and try again.",
        );
        haptics.warning();
        setIsLoading(false);
        return;
      }

      setPlayerId(player.playerId);
      haptics.success();
      setPhase("loading");
    } catch {
      setError(
        "Unable to sign in to Google Play Games. Check your connection and try again.",
      );
      haptics.error();
      setIsLoading(false);
    }
  };

  const openPlayGames = async () => {
    haptics.tap();
    setOpeningStore(true);

    try {
      await Linking.openURL(PLAY_GAMES_URL);
    } catch {
      setError("Unable to open Google Play. Install Play Games and try again.");
      haptics.error();
    } finally {
      setOpeningStore(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.lg,
            paddingBottom: insets.bottom + Spacing.xl,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.productHeader}>
          <Image
            accessibilityLabel="FlightCraft app icon"
            contentFit="cover"
            source={require("../../assets/images/icon.png")}
            style={styles.appIcon}
          />
          <View style={styles.productCopy}>
            <Text style={styles.productName}>FlightCraft</Text>
            <Text style={styles.productCategory}>Airline operations game</Text>
          </View>
        </View>

        <View style={styles.introduction}>
          <Text accessibilityRole="header" style={styles.title}>
            Build an airline that works
          </Text>
          <Text style={styles.description}>
            Start with one hub, follow real passenger demand, and grow a
            reliable network one route at a time.
          </Text>
        </View>

        <View style={styles.flightPlanHeader}>
          <Text style={styles.flightPlanTitle}>Your first flight plan</Text>
          <Text style={styles.flightPlanDuration}>About 2 min</Text>
        </View>

        <View style={styles.flightPlan}>
          {FIRST_FLIGHT_PLAN.map((item, index) => (
            <View
              key={item.number}
              style={[
                styles.flightPlanRow,
                index > 0 && styles.flightPlanDivider,
              ]}
            >
              <Text style={styles.stepNumber}>{item.number}</Text>
              <View style={styles.stepIcon}>
                <Ionicons name={item.icon} size={19} color={Colors.skyDark} />
              </View>
              <View style={styles.stepCopy}>
                <Text style={styles.stepTitle}>{item.title}</Text>
                <Text style={styles.stepDescription}>{item.description}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.signInSection}>
          <View style={styles.saveNotice}>
            <Ionicons
              name="cloud-done-outline"
              size={20}
              color={Colors.skyDark}
            />
            <View style={styles.saveNoticeCopy}>
              <Text style={styles.saveNoticeTitle}>Keep your airline safe</Text>
              <Text style={styles.saveNoticeText}>
                Play Games links your progress to your account so you can
                continue after reinstalling or changing devices.
              </Text>
            </View>
          </View>

          {error ? (
            <View
              accessibilityLiveRegion="assertive"
              accessibilityRole="alert"
              style={styles.errorRow}
            >
              <Ionicons
                name="alert-circle-outline"
                size={20}
                color={Colors.red}
              />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy: isLoading, disabled: isLoading }}
            disabled={isLoading}
            onPress={handleSignIn}
            style={({ pressed }) => [
              styles.signInButton,
              isLoading && styles.signInButtonDisabled,
              pressed && !isLoading && styles.signInButtonPressed,
            ]}
          >
            {isLoading ? (
              <>
                <ActivityIndicator color={Colors.textOnColor} size="small" />
                <Text style={styles.signInButtonLabel}>Connecting</Text>
              </>
            ) : (
              <>
                <Ionicons
                  name="game-controller-outline"
                  size={21}
                  color={Colors.textOnColor}
                />
                <Text style={styles.signInButtonLabel}>
                  Continue with Play Games
                </Text>
              </>
            )}
          </Pressable>

          {error ? (
            <Pressable
              accessibilityRole="link"
              accessibilityState={{ busy: openingStore }}
              disabled={openingStore}
              onPress={openPlayGames}
              style={({ pressed }) => [
                styles.storeButton,
                pressed && styles.storeButtonPressed,
              ]}
            >
              {openingStore ? (
                <ActivityIndicator color={Colors.sky} size="small" />
              ) : (
                <>
                  <Text style={styles.storeButtonLabel}>
                    Install Play Games
                  </Text>
                  <Ionicons
                    name="open-outline"
                    size={17}
                    color={Colors.skyDark}
                  />
                </>
              )}
            </Pressable>
          ) : null}

          <Text style={styles.requirement}>
            Required for cloud saves, achievements, and leaderboards.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  content: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    paddingHorizontal: Spacing.lg,
  },
  productHeader: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  appIcon: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg,
  },
  productCopy: {
    flex: 1,
    gap: Spacing.xxs,
  },
  productName: {
    color: Colors.text,
    fontSize: Typography.size.title,
    fontWeight: Typography.weight.bold,
    lineHeight: Typography.lineHeight.title,
  },
  productCategory: {
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
  },
  introduction: {
    maxWidth: 500,
    gap: Spacing.sm,
    marginBottom: Spacing.xxl,
  },
  title: {
    color: Colors.text,
    fontSize: Typography.size.display,
    fontWeight: Typography.weight.bold,
    lineHeight: Typography.lineHeight.display,
  },
  description: {
    color: Colors.muted,
    fontSize: Typography.size.body,
    lineHeight: Typography.lineHeight.body,
  },
  flightPlanHeader: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSection,
  },
  flightPlanTitle: {
    color: Colors.text,
    fontSize: Typography.size.body,
    fontWeight: Typography.weight.bold,
    lineHeight: Typography.lineHeight.body,
  },
  flightPlanDuration: {
    color: Colors.dim,
    fontFamily: Typography.mono,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  flightPlan: {
    marginBottom: Spacing.xxl,
  },
  flightPlanRow: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  flightPlanDivider: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  stepNumber: {
    width: 24,
    color: Colors.dim,
    fontFamily: Typography.mono,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  stepIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.skyDim,
    borderRadius: Radius.sm,
  },
  stepCopy: {
    flex: 1,
    gap: Spacing.xxs,
  },
  stepTitle: {
    color: Colors.text,
    fontSize: Typography.size.body,
    fontWeight: Typography.weight.semibold,
    lineHeight: Typography.lineHeight.body,
  },
  stepDescription: {
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
  },
  signInSection: {
    marginTop: "auto",
    gap: Spacing.md,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSection,
  },
  saveNotice: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  saveNoticeCopy: {
    flex: 1,
    gap: Spacing.xxs,
  },
  saveNoticeTitle: {
    color: Colors.text,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.semibold,
    lineHeight: Typography.lineHeight.label,
  },
  saveNoticeText: {
    color: Colors.muted,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.body,
  },
  errorRow: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderLeftWidth: 2,
    borderLeftColor: Colors.red,
  },
  errorText: {
    flex: 1,
    color: Colors.red,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.body,
  },
  signInButton: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.sky,
    borderRadius: Radius.md,
  },
  signInButtonPressed: {
    backgroundColor: Colors.skyDark,
  },
  signInButtonDisabled: {
    backgroundColor: Colors.borderSection,
  },
  signInButtonLabel: {
    color: Colors.textOnColor,
    fontSize: Typography.size.body,
    fontWeight: Typography.weight.semibold,
    lineHeight: Typography.lineHeight.body,
  },
  storeButton: {
    minHeight: MIN_TOUCH,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSection,
    borderRadius: Radius.md,
  },
  storeButtonPressed: {
    backgroundColor: Colors.skyDim,
  },
  storeButtonLabel: {
    color: Colors.skyDark,
    fontSize: Typography.size.label,
    fontWeight: Typography.weight.semibold,
    lineHeight: Typography.lineHeight.label,
  },
  requirement: {
    color: Colors.dim,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
    textAlign: "center",
  },
});
