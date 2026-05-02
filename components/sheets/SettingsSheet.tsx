/**
 * components/sheets/SettingsSheet.tsx
 *
 * Worldwide Rush-style settings panel.
 */

import { GameAlert, useGameAlert } from "@/components/ui/GameAlert";
import { Colors, Radius, Spacing } from "@/constants/theme";
import { getCurrentUser, useAuth } from "@/hooks/useAuth";
import { useGameSounds } from "@/hooks/useGameSounds";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import { fmtCash } from "@/lib/revenue";
import { supabase } from "@/lib/supabase";
import {
  useAirline,
  useDay,
  useGameStore,
  useIsAnonymous,
  useLoadComplete,
} from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useEffect, useState } from "react";
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
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const isAnonymous = useIsAnonymous();
  const loadComplete = useLoadComplete();
  const { linkGoogleAccount } = useAuth();
  const sounds = useGameSounds();
  const color = airline?.color ?? Colors.sky;
  const [sfxOn, setSfxOn] = useState(sounds.isSfxEnabled());
  const [musicOn, setMusicOn] = useState(sounds.isMusicEnabled());
  const gameAlert = useGameAlert();

  useEffect(() => {
    getCurrentUser().then((user) => setUserEmail(user?.email ?? null));
  }, []);

  const handleLinkGoogle = async () => {
    setLinking(true);
    setLinkError(null);

    const result = await linkGoogleAccount();

    setLinking(false);

    if (result.error) {
      setLinkError(result.error);
      return;
    }

    if (result.conflict && result.onOverwrite && result.onKeepGuest) {
      gameAlert.show({
        icon: "warning-outline",
        title: "Account Conflict",
        message:
          "Your Google account already has saved progress.\n\nKeep this current airline, or cancel to keep the Google account progress.",
        buttons: [
          {
            label: "Keep Current",
            style: "destructive",
            onPress: async () => {
              setLinking(true);
              const { error } = await result.onOverwrite!();
              setLinking(false);

              if (error) {
                setLinkError(error);
                return;
              }

              useGameStore.getState().setIsAnonymous(false);
              const user = await getCurrentUser();
              setUserEmail(user?.email ?? null);
            },
          },
          {
            label: "Cancel",
            style: "cancel",
            onPress: result.onKeepGuest,
          },
        ],
      });
      return;
    }

    useGameStore.getState().setIsAnonymous(false);
    const user = await getCurrentUser();
    setUserEmail(user?.email ?? null);
  };

  const handleDeleteAccount = () => {
    gameAlert.show({
      icon: "trash-outline",
      title: "Delete Account",
      message:
        "This permanently deletes your airline, progress, routes, hubs, planes, missions, and achievements. This cannot be undone.",
      buttons: [
        { label: "Cancel", style: "cancel" },
        {
          label: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);

            try {
              const { error: rpcError } = await supabase.rpc(
                "delete_user_account",
              );

              if (rpcError) {
                console.warn(
                  "delete_user_account RPC error:",
                  rpcError.message,
                );
              }

              await supabase.auth.signOut();

              useGameStore.setState({
                phase: "auth",
                airline: null,
                hubs: [],
                demands: [],
                ownedPlanes: [],
                routes: [],
                ledger: [],
                earnedAchievements: {},
                dailyMissions: [],
                missionsCompleted: 0,
                activeSheet: null,
                selectedAirport: null,
                pendingDemand: null,
                routeCreationMode: false,
                creationWaypoints: [],
                loadComplete: false,
              });
            } catch (error) {
              console.error("Delete account error:", error);
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
            <Text style={s.title}>Control Panel</Text>
            <Text style={s.subtitle}>Settings and game links</Text>
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

      <SectionHeader label="QUICK ACCESS" />

      <View style={s.card}>
        <SettingRow
          icon="flag-outline"
          label="Mission Rush"
          sublabel="Daily contracts and rewards"
          onPress={() => openSheet("missions")}
          color={color}
        />
        <Divider />
        <SettingRow
          icon="trophy-outline"
          label="Trophy Rush"
          sublabel="Achievements and progress"
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
        {!loadComplete && (
          <SettingRow
            icon="person-circle-outline"
            label="Loading account..."
            sublabel="Checking saved progress"
            color={Colors.dim}
          />
        )}

        {loadComplete && isAnonymous && (
          <>
            <SettingRow
              icon="person-outline"
              label="Guest Airline"
              sublabel="Progress is saved on this device"
              color={Colors.amber}
            />
            <Divider />
            <SettingRow
              icon="logo-google"
              label={linking ? "Connecting..." : "Sync with Google"}
              sublabel="Save progress across devices"
              onPress={linking ? undefined : handleLinkGoogle}
              color={Colors.sky}
              right={
                linking ? (
                  <ActivityIndicator size="small" color={Colors.sky} />
                ) : (
                  <Ionicons
                    name="chevron-forward"
                    size={15}
                    color={Colors.dim}
                  />
                )
              }
            />
          </>
        )}

        {loadComplete && !isAnonymous && (
          <SettingRow
            icon="logo-google"
            label="Google Sync Active"
            sublabel={userEmail ?? "Progress synced across devices"}
            color={GREEN}
            right={<Ionicons name="checkmark-circle" size={17} color={GREEN} />}
          />
        )}

        {!!linkError && (
          <View style={s.inlineError}>
            <Text style={s.inlineErrorText}>{linkError}</Text>
          </View>
        )}

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

      <SectionHeader label="GAME FEEL" />

      <View style={s.card}>
        <SettingRow
          icon="volume-high-outline"
          label="Sound Effects"
          sublabel="Planes, rewards, purchases"
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
          sublabel="0.1.1"
          color={Colors.dim}
        />
        {/* <Divider />
        <SettingRow
          icon="shield-checkmark-outline"
          label="Privacy Policy"
          sublabel="How Flightcraft handles data"
          onPress={() => openSheet("privacy-policy")}
          color={Colors.green}
        /> */}
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
  inlineError: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  inlineErrorText: {
    fontSize: 10,
    color: Colors.red,
    lineHeight: 14,
  },
});
