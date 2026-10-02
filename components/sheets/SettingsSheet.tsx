/**
 * Flat, readable gameplay, sound, account, and data controls.
 */
import { AirlineBrandMark } from "@/components/airline-identity";
import { GameAlert, useGameAlert } from "@/components/ui/GameAlert";
import {
  Colors,
  MIN_TOUCH,
  Radius,
  Spacing,
  Typography,
} from "@/constants/theme";
import { setPlayerId } from "@/hooks/useAuth";
import { useGameSounds } from "@/hooks/useGameSounds";
import { useHaptics } from "@/hooks/useHaptics";
import { signOutPlayGames, usePlayGames } from "@/hooks/usePlayGames";
import { openPlayStorePage } from "@/hooks/useRateUs";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import { DEFAULT_AIRLINE_LOGO_ID, getAirlinePalette } from "@/lib/airlineBrand";
import { useAirline, useDay, useGameStore } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

type IconName = keyof typeof Ionicons.glyphMap;

interface SettingRowProps {
  icon: IconName;
  label: string;
  description?: string;
  onPress?: () => void;
  right?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}

function SettingRow({
  icon,
  label,
  description,
  onPress,
  right,
  danger = false,
  disabled = false,
}: SettingRowProps) {
  const interactive = Boolean(onPress) && !disabled;
  const foreground = danger ? Colors.red : Colors.text;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole={interactive ? "button" : undefined}
      accessibilityState={{ disabled }}
      disabled={!interactive}
      onPress={onPress}
      style={({ pressed }) => [
        rowStyles.row,
        pressed && interactive && rowStyles.pressed,
        disabled && rowStyles.disabled,
      ]}
    >
      <View style={rowStyles.iconArea}>
        <Ionicons name={icon} size={20} color={foreground} />
      </View>
      <View style={rowStyles.copy}>
        <Text style={[rowStyles.label, danger && rowStyles.dangerText]}>
          {label}
        </Text>
        {description ? (
          <Text style={rowStyles.description}>{description}</Text>
        ) : null}
      </View>
      {right ??
        (interactive ? (
          <Ionicons
            name="chevron-forward"
            size={18}
            color={danger ? Colors.red : Colors.dim}
          />
        ) : null)}
    </Pressable>
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
        {hint ? <Text style={sectionStyles.hint}>{hint}</Text> : null}
      </View>
      <View style={sectionStyles.rows}>{children}</View>
    </View>
  );
}

function Divider() {
  return <View style={sectionStyles.divider} />;
}

async function deleteAirlineRecords(airlineId: string) {
  const { supabase } = await import("@/lib/supabase");
  const results = await Promise.all([
    supabase.from("routes").delete().eq("airline_id", airlineId),
    supabase.from("demands").delete().eq("airline_id", airlineId),
    supabase.from("owned_planes").delete().eq("airline_id", airlineId),
    supabase.from("hubs").delete().eq("airline_id", airlineId),
    supabase.from("ledger").delete().eq("airline_id", airlineId),
    supabase.from("airport_presence").delete().eq("airline_id", airlineId),
  ]);
  const childError = results.find((result) => result.error)?.error;
  if (childError) throw childError;

  const { error } = await supabase
    .from("airlines")
    .delete()
    .eq("id", airlineId);
  if (error) throw error;
}

export default function SettingsSheet() {
  const airline = useAirline();
  const day = useDay();
  const closeSheet = useGameStore((state) => state.closeSheet);
  const openSheet = useGameStore((state) => state.openSheet);
  const tabBarHeight = useTabBarHeight();
  const sounds = useGameSounds();
  const haptics = useHaptics();
  const { player, isSignedIn } = usePlayGames();
  const gameAlert = useGameAlert();
  const [deleting, setDeleting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [sfxOn, setSfxOn] = useState(sounds.isSfxEnabled());
  const [musicOn, setMusicOn] = useState(sounds.isMusicEnabled());
  const defaultPalette = getAirlinePalette("aviation-blue");
  const airlineName = airline?.name ?? "Your airline";
  const airlineCode = airline?.airline_code ?? "AIR";
  const airlineLogoId = airline?.logo_id ?? DEFAULT_AIRLINE_LOGO_ID;
  const airlinePrimaryColor = airline?.color ?? defaultPalette.primary;
  const airlineSecondaryColor =
    airline?.secondary_color ?? defaultPalette.secondary;

  const navigate = (sheet: Parameters<typeof openSheet>[0]) => {
    haptics.tap();
    openSheet(sheet);
  };

  const finishSession = async () => {
    await signOutPlayGames();
    setPlayerId(null);
    closeSheet();
    useGameStore.getState().resetGame();
    useGameStore.getState().setPhase("auth");
  };

  const handleSignOut = () => {
    haptics.warning();
    gameAlert.show({
      icon: "log-out-outline",
      title: "Sign out of Play Games?",
      message:
        "Your airline will remain saved. Sign in with this account again to continue it.",
      buttons: [
        { label: "Stay signed in", style: "cancel" },
        {
          label: "Sign out",
          onPress: async () => {
            setSigningOut(true);
            try {
              await finishSession();
            } catch {
              setSigningOut(false);
              haptics.error();
              gameAlert.show({
                icon: "warning-outline",
                title: "Unable to sign out",
                message: "Check your connection and try again.",
                buttons: [{ label: "Close", style: "cancel" }],
              });
            }
          },
        },
      ],
    });
  };

  const handleDeleteAccount = () => {
    haptics.warning();
    gameAlert.show({
      icon: "trash-outline",
      title: "Delete airline data?",
      message:
        "This permanently removes your airline, routes, hubs, fleet, finances, and saved progress. Play Games achievements and leaderboard scores remain. This cannot be undone.",
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
              await deleteAirlineRecords(airlineId);
              await AsyncStorage.removeItem(
                `flightcraft:weekly-progress:${airlineId}`,
              );
              await finishSession();
            } catch {
              setDeleting(false);
              haptics.error();
              gameAlert.show({
                icon: "warning-outline",
                title: "Deletion failed",
                message:
                  "Your airline was not fully deleted. Check your connection and try again.",
                buttons: [{ label: "Close", style: "cancel" }],
              });
            }
          },
        },
      ],
    });
  };

  const handleSfxChange = (value: boolean) => {
    haptics.tap();
    setSfxOn(value);
    sounds.setSfxEnabled(value);
  };

  const handleMusicChange = (value: boolean) => {
    haptics.tap();
    setMusicOn(value);
    sounds.setMusicEnabled(value);
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
          <Text style={styles.screenTitle}>Settings</Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {airlineName} · {airlineCode} · Day {day}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Close settings"
          accessibilityRole="button"
          onPress={closeSheet}
          style={({ pressed }) => [
            styles.closeButton,
            pressed && styles.closeButtonPressed,
          ]}
        >
          <Ionicons name="close" size={22} color={Colors.text} />
        </Pressable>
      </View>

      <Section label="Progress" hint="Missions and records">
        <SettingRow
          icon="flag-outline"
          label="Missions"
          description="Daily assignments and weekly challenges"
          onPress={() => navigate("missions")}
        />
        <Divider />
        <SettingRow
          icon="trophy-outline"
          label="Achievements"
          description="Milestones and completed goals"
          onPress={() => navigate("achievements")}
        />
        <Divider />
        <SettingRow
          icon="podium-outline"
          label="Rankings"
          description="Rival airlines and Play Games standings"
          onPress={() => navigate("leaderboard")}
        />
      </Section>

      <Section label="Sound" hint="Saved on this device">
        <SettingRow
          icon="volume-high-outline"
          label="Sound effects"
          description="Controls, purchases, and alerts"
          right={
            <Switch
              accessibilityLabel="Toggle sound effects"
              value={sfxOn}
              onValueChange={handleSfxChange}
              trackColor={{ false: Colors.inset, true: Colors.skyDim }}
              thumbColor={sfxOn ? Colors.sky : Colors.dim}
            />
          }
        />
        <Divider />
        <SettingRow
          icon="musical-notes-outline"
          label="Music"
          description="FlightCraft background music"
          right={
            <Switch
              accessibilityLabel="Toggle music"
              value={musicOn}
              onValueChange={handleMusicChange}
              trackColor={{ false: Colors.inset, true: Colors.skyDim }}
              thumbColor={musicOn ? Colors.sky : Colors.dim}
            />
          }
        />
      </Section>

      <Section label="Account" hint="Play Games">
        <SettingRow
          icon="game-controller-outline"
          label={
            isSignedIn && player
              ? player.displayName
              : "Play Games not connected"
          }
          description={
            isSignedIn
              ? "Connected to this airline"
              : "Open Rankings to connect"
          }
          onPress={() => navigate("leaderboard")}
          right={
            isSignedIn ? (
              <View style={styles.connectedStatus}>
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color={Colors.green}
                />
                <Text style={styles.connectedText}>Connected</Text>
              </View>
            ) : undefined
          }
        />
        {isSignedIn ? (
          <>
            <Divider />
            <SettingRow
              icon="log-out-outline"
              label={signingOut ? "Signing out..." : "Sign out"}
              description="Keep this airline saved and change accounts"
              onPress={handleSignOut}
              disabled={signingOut || deleting}
              right={
                signingOut ? (
                  <ActivityIndicator size="small" color={Colors.sky} />
                ) : undefined
              }
            />
          </>
        ) : null}
      </Section>

      <Section label="App" hint="FlightCraft 0.7.0">
        <SettingRow
          icon="star-outline"
          label="Rate FlightCraft"
          description="Leave a review on the Play Store"
          onPress={() => {
            haptics.tap();
            openPlayStorePage();
          }}
        />
        <Divider />
        <SettingRow
          icon="shield-checkmark-outline"
          label="Privacy policy"
          description="How game and account data are handled"
          onPress={() => navigate("privacy-policy")}
        />
        <Divider />
        <SettingRow
          icon="information-circle-outline"
          label="App version"
          description="Release 0.7.0"
          right={<Text style={styles.version}>Build 20</Text>}
        />
      </Section>

      <Section label="Data" hint="Permanent action">
        <SettingRow
          icon="trash-outline"
          label={deleting ? "Deleting airline..." : "Delete airline data"}
          description="Remove all FlightCraft progress from this account"
          onPress={handleDeleteAccount}
          danger
          disabled={deleting || signingOut}
          right={
            deleting ? (
              <ActivityIndicator size="small" color={Colors.red} />
            ) : (
              <Ionicons name="chevron-forward" size={18} color={Colors.red} />
            )
          }
        />
      </Section>
      <GameAlert ref={gameAlert.ref} />
    </BottomSheetScrollView>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  pressed: { backgroundColor: Colors.inset },
  disabled: { opacity: 0.55 },
  iconArea: {
    width: 32,
    minHeight: MIN_TOUCH,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, minWidth: 0 },
  label: {
    color: Colors.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: Typography.weight.semibold,
  },
  dangerText: { color: Colors.red },
  description: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
    marginTop: Spacing.xxs,
  },
});

const sectionStyles = StyleSheet.create({
  section: { marginHorizontal: Spacing.lg, marginBottom: Spacing.xl },
  heading: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  label: {
    color: Colors.text,
    fontSize: Typography.size.label,
    lineHeight: Typography.lineHeight.label,
    fontWeight: Typography.weight.bold,
  },
  hint: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
  },
  rows: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSection,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginLeft: 32 + Spacing.md + Spacing.sm,
  },
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingBottom: Spacing.xxl },
  header: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  screenTitle: {
    color: Colors.text,
    fontSize: Typography.size.title,
    lineHeight: Typography.lineHeight.title,
    fontWeight: Typography.weight.bold,
  },
  subtitle: {
    color: Colors.muted,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
    marginTop: Spacing.xxs,
  },
  closeButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonPressed: { backgroundColor: Colors.inset },
  connectedStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  connectedText: {
    color: Colors.green,
    fontSize: Typography.size.caption,
    lineHeight: Typography.lineHeight.caption,
    fontWeight: Typography.weight.semibold,
  },
  version: {
    color: Colors.muted,
    fontFamily: Typography.mono,
    fontSize: 11,
    lineHeight: 16,
  },
});
