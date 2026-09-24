/**
 * A compact control panel for navigation, audio, account, and app details.
 */

import { GameAlert, useGameAlert } from "@/components/ui/GameAlert";
import {
  Colors,
  MIN_TOUCH,
  Palette,
  Radius,
  Shadow,
  Spacing,
  Typography,
} from "@/constants/theme";
import { useGameSounds } from "@/hooks/useGameSounds";
import { signOutPlayGames, usePlayGames } from "@/hooks/usePlayGames";
import { openPlayStorePage } from "@/hooks/useRateUs";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import { fmtCash } from "@/lib/revenue";
import { useAirline, useDay, useGameStore } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface SettingRowProps {
  icon: string;
  label: string;
  description?: string;
  onPress?: () => void;
  right?: ReactNode;
  accent?: string;
  danger?: boolean;
  disabled?: boolean;
}

function SettingRow({
  icon,
  label,
  description,
  onPress,
  right,
  accent = Colors.sky,
  danger = false,
  disabled = false,
}: SettingRowProps) {
  const rowColor = danger ? Colors.red : accent;
  const interactive = Boolean(onPress) && !disabled;

  return (
    <TouchableOpacity
      accessibilityLabel={label}
      accessibilityRole={interactive ? "button" : undefined}
      style={[
        rowStyles.row,
        danger && rowStyles.dangerRow,
        disabled && rowStyles.disabledRow,
      ]}
      onPress={onPress}
      disabled={!interactive}
      activeOpacity={0.82}
    >
      <View
        style={[
          rowStyles.icon,
          {
            backgroundColor: danger ? Palette.redSoft : rowColor + "16",
          },
        ]}
      >
        <Ionicons name={icon as any} size={18} color={rowColor} />
      </View>

      <View style={rowStyles.copy}>
        <Text style={[rowStyles.label, danger && { color: Colors.red }]}>
          {label}
        </Text>
        {description && (
          <Text style={rowStyles.description}>{description}</Text>
        )}
      </View>

      {right ??
        (interactive ? (
          <Ionicons name="chevron-forward" size={17} color={Colors.dim} />
        ) : null)}
    </TouchableOpacity>
  );
}

function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View style={sectionStyles.section}>
      <View style={sectionStyles.heading}>
        <Text style={sectionStyles.label}>{label}</Text>
        {hint && <Text style={sectionStyles.hint}>{hint}</Text>}
      </View>
      <View style={sectionStyles.card}>{children}</View>
    </View>
  );
}

function Divider() {
  return <View style={sectionStyles.divider} />;
}

export default function SettingsSheet() {
  const airline = useAirline();
  const day = useDay();
  const closeSheet = useGameStore((state) => state.closeSheet);
  const openSheet = useGameStore((state) => state.openSheet);
  const tabBarHeight = useTabBarHeight();
  const sounds = useGameSounds();
  const { player, isSignedIn } = usePlayGames();
  const gameAlert = useGameAlert();

  const [deleting, setDeleting] = useState(false);
  const [sfxOn, setSfxOn] = useState(sounds.isSfxEnabled());
  const [musicOn, setMusicOn] = useState(sounds.isMusicEnabled());

  const color = airline?.color ?? Colors.sky;

  const handleDeleteAccount = () => {
    gameAlert.show({
      icon: "trash-outline",
      title: "Delete airline data?",
      message:
        "This permanently removes your airline, routes, hubs, fleet, finances, and saved progress. Google Play achievements and leaderboard scores remain with Google. This cannot be undone.",
      buttons: [
        { label: "Keep airline", style: "cancel" },
        {
          label: "Delete permanently",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);

            try {
              const airlineId = airline?.id;
              if (!airlineId) throw new Error("No active airline found");

              const { supabase } = await import("@/lib/supabase");
              const results = await Promise.all([
                supabase.from("routes").delete().eq("airline_id", airlineId),
                supabase.from("demands").delete().eq("airline_id", airlineId),
                supabase
                  .from("owned_planes")
                  .delete()
                  .eq("airline_id", airlineId),
                supabase.from("hubs").delete().eq("airline_id", airlineId),
                supabase.from("ledger").delete().eq("airline_id", airlineId),
                supabase
                  .from("airport_presence")
                  .delete()
                  .eq("airline_id", airlineId),
              ]);

              const childDeleteError = results.find(
                (result) => result.error,
              )?.error;
              if (childDeleteError) throw childDeleteError;

              const { error: airlineDeleteError } = await supabase
                .from("airlines")
                .delete()
                .eq("id", airlineId);
              if (airlineDeleteError) throw airlineDeleteError;

              await signOutPlayGames();
              useGameStore.getState().resetGame();
              useGameStore.getState().setPhase("auth");
            } catch {
              gameAlert.show({
                icon: "warning-outline",
                title: "Deletion failed",
                message:
                  "Your airline was not fully deleted. Please check your connection and try again.",
                buttons: [{ label: "OK", style: "cancel" }],
              });
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    });
  };

  const handleSfxChange = (value: boolean) => {
    setSfxOn(value);
    sounds.setSfxEnabled(value);
  };

  const handleMusicChange = (value: boolean) => {
    setMusicOn(value);
    sounds.setMusicEnabled(value);
    if (value) sounds.tap();
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
        <View
          style={[
            styles.headerMark,
            { borderColor: color, backgroundColor: color + "14" },
          ]}
        >
          <Ionicons name="options-outline" size={21} color={color} />
        </View>

        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>CONTROL PANEL</Text>
          <Text style={styles.screenTitle}>Settings</Text>
          <Text style={styles.subtitle}>Game, audio, and account controls</Text>
        </View>

        <TouchableOpacity
          accessibilityLabel="Close settings"
          accessibilityRole="button"
          onPress={closeSheet}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={22} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={[styles.airlineCard, { borderLeftColor: color }]}>
        <View style={[styles.airlineIcon, { backgroundColor: color + "16" }]}>
          <Ionicons name="airplane" size={20} color={color} />
        </View>

        <View style={styles.airlineCopy}>
          <Text style={styles.airlineName} numberOfLines={1}>
            {airline?.name ?? "Your Airline"}
          </Text>
          <Text style={styles.airlineMeta}>
            Day {day} · {fmtCash(airline?.cash ?? 0)} available
          </Text>
        </View>

        <View style={styles.activePill}>
          <View style={styles.activeDot} />
          <Text style={styles.activeText}>ACTIVE</Text>
        </View>
      </View>

      <Section label="GAME" hint="Progress and competition">
        <SettingRow
          icon="flag-outline"
          label="Missions"
          description="Daily assignments and weekly challenges"
          onPress={() => openSheet("missions")}
          accent={Colors.sky}
        />
        <Divider />
        <SettingRow
          icon="trophy-outline"
          label="Achievements"
          description="Milestones, points, and unlock history"
          onPress={() => openSheet("achievements")}
          accent={Colors.purple}
        />
        <Divider />
        <SettingRow
          icon="podium-outline"
          label="Rankings"
          description="AI rivals and global Play Games standings"
          onPress={() => openSheet("leaderboard")}
          accent={Colors.amber}
        />
      </Section>

      <Section label="AUDIO" hint="Stored on this device">
        <SettingRow
          icon="volume-high-outline"
          label="Sound effects"
          description="Buttons, purchases, rewards, and alerts"
          accent={Colors.sky}
          right={
            <Switch
              accessibilityLabel="Toggle sound effects"
              value={sfxOn}
              onValueChange={handleSfxChange}
              trackColor={{ false: Colors.inset, true: Palette.blueSoft }}
              thumbColor={sfxOn ? Colors.sky : Colors.dim}
            />
          }
        />
        <Divider />
        <SettingRow
          icon="musical-notes-outline"
          label="Background music"
          description="Ambient Flightcraft soundtrack"
          accent={Colors.purple}
          right={
            <Switch
              accessibilityLabel="Toggle background music"
              value={musicOn}
              onValueChange={handleMusicChange}
              trackColor={{ false: Colors.inset, true: Palette.violetSoft }}
              thumbColor={musicOn ? Colors.purple : Colors.dim}
            />
          }
        />
      </Section>

      <Section label="ACCOUNT" hint="Identity and cloud progress">
        <SettingRow
          icon="game-controller-outline"
          label={
            isSignedIn && player
              ? player.displayName
              : "Play Games not connected"
          }
          description={
            isSignedIn
              ? "Google Play Games profile connected"
              : "Open Rankings to connect your profile"
          }
          onPress={() => openSheet("leaderboard")}
          accent={isSignedIn ? Colors.green : Colors.amber}
          right={
            isSignedIn ? (
              <Ionicons
                name="checkmark-circle"
                size={19}
                color={Colors.green}
              />
            ) : undefined
          }
        />
      </Section>

      <Section label="ABOUT" hint="Flightcraft 0.7.0">
        <SettingRow
          icon="star-outline"
          label="Rate Flightcraft"
          description="Leave a review on the Play Store"
          onPress={openPlayStorePage}
          accent={Colors.amber}
        />
        <Divider />
        <SettingRow
          icon="shield-checkmark-outline"
          label="Privacy policy"
          description="How game and account data are handled"
          onPress={() => openSheet("privacy-policy")}
          accent={Colors.green}
        />
        <Divider />
        <SettingRow
          icon="information-circle-outline"
          label="App version"
          description="0.7.0"
          accent={Colors.muted}
          right={<Text style={styles.versionTag}>BUILD 20</Text>}
        />
      </Section>

      <View style={styles.dangerSection}>
        <View style={styles.dangerHeading}>
          <Text style={styles.dangerLabel}>DANGER ZONE</Text>
          <Text style={styles.dangerHint}>Permanent action</Text>
        </View>
        <View style={styles.dangerCard}>
          <SettingRow
            icon="trash-outline"
            label={deleting ? "Deleting airline…" : "Delete airline data"}
            description="Remove all Flightcraft progress from this account"
            onPress={handleDeleteAccount}
            danger
            disabled={deleting}
            right={
              deleting ? (
                <ActivityIndicator size="small" color={Colors.red} />
              ) : (
                <Ionicons name="chevron-forward" size={17} color={Colors.red} />
              )
            }
          />
        </View>
      </View>

      <GameAlert ref={gameAlert.ref} />
    </BottomSheetScrollView>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  dangerRow: {
    backgroundColor: "#FFF9F8",
  },
  disabledRow: {
    opacity: 0.58,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: Typography.weight.bold,
  },
  description: {
    color: Colors.muted,
    fontSize: 10,
    lineHeight: 14,
    marginTop: Spacing.xxs,
  },
});

const sectionStyles = StyleSheet.create({
  section: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  label: {
    color: Colors.muted,
    fontSize: 9,
    fontWeight: Typography.weight.bold,
    letterSpacing: 1.7,
  },
  hint: {
    color: Colors.dim,
    fontSize: 9,
  },
  card: {
    backgroundColor: Colors.panel,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginLeft: Spacing.md + 38 + Spacing.md,
  },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingBottom: Spacing.xxl,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
  headerMark: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: {
    flex: 1,
  },
  kicker: {
    color: Colors.skyDark,
    fontSize: 9,
    fontWeight: Typography.weight.bold,
    letterSpacing: 1.7,
  },
  screenTitle: {
    color: Colors.text,
    fontFamily: Typography.display,
    fontSize: 29,
    lineHeight: 31,
    letterSpacing: 0.5,
  },
  subtitle: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
  },
  closeButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.panel,
    alignItems: "center",
    justifyContent: "center",
  },
  airlineCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.panel,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 5,
    padding: Spacing.md,
    ...Shadow.card,
  },
  airlineIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  airlineCopy: {
    flex: 1,
    minWidth: 0,
  },
  airlineName: {
    color: Colors.text,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: Typography.weight.bold,
  },
  airlineMeta: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: 10,
    lineHeight: 14,
    marginTop: Spacing.xs,
  },
  activePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Palette.greenSoft,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.green,
  },
  activeText: {
    color: Colors.green,
    fontSize: 8,
    fontWeight: Typography.weight.bold,
    letterSpacing: 0.8,
  },
  versionTag: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: 9,
    fontWeight: Typography.weight.bold,
    backgroundColor: Colors.inset,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
  },
  dangerSection: {
    marginHorizontal: Spacing.lg,
  },
  dangerHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  dangerLabel: {
    color: Colors.red,
    fontSize: 9,
    fontWeight: Typography.weight.bold,
    letterSpacing: 1.7,
  },
  dangerHint: {
    color: Colors.dim,
    fontSize: 9,
  },
  dangerCard: {
    backgroundColor: "#FFF9F8",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: "rgba(217,72,65,0.28)",
    overflow: "hidden",
  },
});
