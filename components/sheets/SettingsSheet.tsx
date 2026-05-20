/**
 * components/sheets/SettingsSheet.tsx
 *
 * Worldwide Rush-style settings panel.
 */

import { GameAlert, useGameAlert } from "@/components/ui/GameAlert";
import { Colors, Radius, Spacing } from "@/constants/theme";
import { useGameSounds } from "@/hooks/useGameSounds";
import {
  showAchievements,
  showLeaderboard,
  signOutPlayGames,
  usePlayGames,
} from "@/hooks/usePlayGames";
import { openPlayStorePage } from "@/hooks/useRateUs";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import { fmtCash } from "@/lib/revenue";

import { useAirline, useDay, useGameStore } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

function SettingRow({
  icon,
  label,
  sublabel,
  onPress,
  right,
  danger,
  color,
}: {
  icon: string;
  label: string;
  sublabel?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  danger?: boolean;
  color?: string;
}) {
  const accent = danger ? Colors.red : (color ?? Colors.muted);

  return (
    <TouchableOpacity
      style={[sr.row, danger && sr.dangerRow]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.78 : 1}
    >
      <View style={[sr.iconWrap, { backgroundColor: accent + "14" }]}>
        <Ionicons name={icon as any} size={16} color={accent} />
      </View>

      <View style={sr.body}>
        <Text style={[sr.label, danger && { color: Colors.red }]}>{label}</Text>
        {!!sublabel && <Text style={sr.sub}>{sublabel}</Text>}
      </View>

      {right ??
        (onPress && !danger ? (
          <Ionicons name="chevron-forward" size={15} color={Colors.dim} />
        ) : null)}
    </TouchableOpacity>
  );
}

function SectionHeader({ label }: { label: string }) {
  return <Text style={s.sectionTitle}>{label}</Text>;
}

function Divider() {
  return <View style={s.divider} />;
}

export default function SettingsSheet() {
  const airline = useAirline();
  const day = useDay();
  const closeSheet = useGameStore((state) => state.closeSheet);
  const openSheet = useGameStore((state) => state.openSheet);
  const tabBarH = useTabBarHeight();

  const [deleting, setDeleting] = useState(false);
  const { player, isSignedIn } = usePlayGames();
  const sounds = useGameSounds();
  const color = airline?.color ?? Colors.sky;
  const [sfxOn, setSfxOn] = useState(sounds.isSfxEnabled());
  const [musicOn, setMusicOn] = useState(sounds.isMusicEnabled());
  const gameAlert = useGameAlert();

  const handleDeleteAccount = () => {
    gameAlert.show({
      icon: "trash-outline",
      title: "Delete Account",
      message:
        "This permanently deletes your airline, routes, hubs, fleet, and all saved progress from our servers. Your Google Play Games achievements and leaderboard score are managed by Google and will not be affected. This cannot be undone.",
      buttons: [
        { label: "Cancel", style: "cancel" },
        {
          label: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              const { supabase } = await import("@/lib/supabase");
              const playerId = player?.playerId;
              if (playerId) {
                // Delete all data associated with this player
                const { data: airlineData } = await supabase
                  .from("airlines")
                  .select("id")
                  .eq("player_id", playerId)
                  .maybeSingle();

                if (airlineData?.id) {
                  const id = airlineData.id;
                  await Promise.all([
                    supabase.from("routes").delete().eq("airline_id", id),
                    supabase.from("demands").delete().eq("airline_id", id),
                    supabase.from("owned_planes").delete().eq("airline_id", id),
                    supabase.from("hubs").delete().eq("airline_id", id),
                    supabase.from("ledger").delete().eq("airline_id", id),
                    supabase
                      .from("airport_presence")
                      .delete()
                      .eq("airline_id", id),
                  ]);
                  await supabase.from("airlines").delete().eq("id", id);
                }
              }

              await signOutPlayGames();
              useGameStore.getState().resetGame?.();
              useGameStore.getState().setPhase("auth");
            } catch (err) {
              gameAlert.show({
                title: "Error",
                message: "Failed to delete account. Please try again.",
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
            <Text style={s.title}>Settings</Text>
            <Text style={s.subtitle}>Your airline and preferences</Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={closeSheet}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={22} color={Colors.dim} />
        </TouchableOpacity>
      </View>

      <View style={[s.airlineCard, { borderColor: color + "44" }]}>
        <View
          style={[
            s.airlineIcon,
            {
              backgroundColor: color + "18",
              borderColor: color + "33",
            },
          ]}
        >
          <Ionicons name="airplane" size={21} color={color} />
        </View>

        <View style={s.airlineInfo}>
          <Text style={s.airlineName}>{airline?.name ?? "Your Airline"}</Text>
          <Text style={s.airlineMeta}>
            Day {day} · {fmtCash(airline?.cash ?? 0)} cash
          </Text>
        </View>

        <View style={[s.statusPill, { backgroundColor: color + "14" }]}>
          <Text style={[s.statusText, { color }]}>LIVE</Text>
        </View>
      </View>

      <SectionHeader label="SHORTCUTS" />

      <View style={s.card}>
        <SettingRow
          icon="flag-outline"
          label="Missions"
          sublabel="Daily contracts and rewards"
          onPress={() => openSheet("missions")}
          color={color}
        />
        <Divider />
        <SettingRow
          icon="trophy-outline"
          label="Achievements"
          sublabel="Your progress and unlocks"
          onPress={() => openSheet("achievements")}
          color="#a78bfa"
        />
        <Divider />
        <SettingRow
          icon="podium-outline"
          label="Leaderboard"
          sublabel="Compare against other airlines"
          onPress={() => openSheet("leaderboard")}
          color={Colors.amber}
        />
      </View>

      <SectionHeader label="ACCOUNT" />

      <View style={s.card}>
        {/* Play Games player info */}
        {isSignedIn && player ? (
          <SettingRow
            icon="game-controller-outline"
            label={player.displayName}
            sublabel="Signed in with Google Play Games"
            color={GREEN}
            right={<Ionicons name="checkmark-circle" size={17} color={GREEN} />}
          />
        ) : (
          <SettingRow
            icon="game-controller-outline"
            label="Not signed in"
            sublabel="Play Games sign-in required"
            color={Colors.amber}
          />
        )}

        <Divider />

        {/* Play Games native screens */}
        <SettingRow
          icon="trophy-outline"
          label="Play Games Achievements"
          sublabel="View progress in Google Play Games"
          onPress={showAchievements}
          color="#a78bfa"
        />
        <Divider />
        <SettingRow
          icon="podium-outline"
          label="Play Games Leaderboard"
          sublabel="Global net worth rankings"
          onPress={showLeaderboard}
          color={Colors.amber}
        />

        <Divider />

        <SettingRow
          icon="trash-outline"
          label={deleting ? "Deleting..." : "Delete Account"}
          sublabel="Permanently remove all progress"
          onPress={deleting ? undefined : handleDeleteAccount}
          danger
          right={
            deleting ? (
              <ActivityIndicator size="small" color={Colors.red} />
            ) : undefined
          }
        />
      </View>

      <SectionHeader label="SOUND" />

      <View style={s.card}>
        <SettingRow
          icon="volume-high-outline"
          label="Sound Effects"
          sublabel="Tap sounds and reward effects"
          color={Colors.sky}
          right={
            <Switch
              value={sfxOn}
              onValueChange={(value) => {
                setSfxOn(value);
                sounds.setSfxEnabled(value);
              }}
              trackColor={{ false: Colors.border, true: Colors.sky + "88" }}
              thumbColor={sfxOn ? Colors.sky : Colors.dim}
            />
          }
        />
        <SettingRow
          icon="musical-notes-outline"
          label="Background Music"
          sublabel="Ambient game soundtrack"
          color={Colors.purple}
          right={
            <Switch
              value={musicOn}
              onValueChange={(value) => {
                setMusicOn(value);
                sounds.setMusicEnabled(value);

                if (value) sounds.tap(); // quick feedback
              }}
              trackColor={{ false: Colors.border, true: Colors.purple + "88" }}
              thumbColor={musicOn ? Colors.purple : Colors.dim}
            />
          }
        />
      </View>

      <SectionHeader label="ABOUT" />

      <View style={s.card}>
        <SettingRow
          icon="information-circle-outline"
          label="Version"
          sublabel="0.6.1"
          color={Colors.dim}
        />
        <Divider />
        <SettingRow
          icon="star-outline"
          label="Rate Flightcraft"
          sublabel="Leave a review on the Play Store"
          onPress={() => openPlayStorePage()}
          color={Colors.amber}
        />
      </View>

      <GameAlert ref={gameAlert.ref} />
    </BottomSheetScrollView>
  );
}

const GREEN = "#22c55e";

const sr = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  dangerRow: {
    backgroundColor: Colors.red + "04",
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: "800",
  },
  sub: {
    fontSize: 10,
    color: Colors.dim,
    lineHeight: 14,
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

  airlineCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: Radius.xl,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,.035)",
    padding: Spacing.md,
  },
  airlineIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  airlineInfo: {
    flex: 1,
    minWidth: 0,
  },
  airlineName: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: "900",
  },
  airlineMeta: {
    fontSize: 11,
    color: Colors.dim,
    marginTop: 2,
  },
  statusPill: {
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  sectionTitle: {
    fontSize: 9,
    color: Colors.dim,
    letterSpacing: 2.5,
    fontWeight: "900",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
  card: {
    marginHorizontal: Spacing.lg,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(255,255,255,.025)",
    overflow: "hidden",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginLeft: Spacing.md + 32 + Spacing.md,
  },
});
