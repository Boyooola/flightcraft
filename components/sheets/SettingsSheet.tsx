/**
 * components/sheets/SettingsSheet.tsx
 *
 * Settings — clean, no "Build with" row.
 * Sections: Account, Game, About, Links.
 * Missions link for quick access.
 */

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
  Alert,
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
}: {
  icon: string;
  label: string;
  sublabel?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      style={sr.row}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={sr.iconWrap}>
        <Ionicons
          name={icon as any}
          size={16}
          color={danger ? Colors.red : Colors.muted}
        />
      </View>
      <View style={sr.body}>
        <Text style={[sr.label, danger && { color: Colors.red }]}>{label}</Text>
        {sublabel && <Text style={sr.sub}>{sublabel}</Text>}
      </View>
      {right ??
        (onPress && !danger && (
          <Ionicons name="chevron-forward" size={14} color={Colors.dim} />
        ))}
    </TouchableOpacity>
  );
}

const sr = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.lg,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, gap: 1 },
  label: { fontSize: 13, color: Colors.text, fontWeight: "500" },
  sub: { fontSize: 10, color: Colors.dim },
});

function SectionHeader({ label }: { label: string }) {
  return <Text style={sh.txt}>{label}</Text>;
}
const sh = StyleSheet.create({
  txt: {
    fontSize: 9,
    color: Colors.dim,
    letterSpacing: 2.5,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
});

function Divider() {
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: Colors.border,
        marginHorizontal: Spacing.lg,
      }}
    />
  );
}

export default function SettingsSheet() {
  const airline = useAirline();
  const day = useDay();
  const closeSheet = useGameStore((s) => s.closeSheet);
  const openSheet = useGameStore((s) => s.openSheet);
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

  // Load user email on mount
  useEffect(() => {
    getCurrentUser().then((u) => setUserEmail(u?.email ?? null));
  }, []);

  const handleLinkGoogle = async () => {
    setLinking(true);
    setLinkError(null);
    const { error } = await linkGoogleAccount();
    setLinking(false);
    if (error) {
      setLinkError(error);
    } else {
      const u = await getCurrentUser();
      setUserEmail(u?.email ?? null);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your airline and all progress. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              // 1. Delete all game data via RPC
              const { error: rpcError } = await supabase.rpc(
                "delete_user_account",
              );
              // If RPC fails (e.g. not yet created), still sign out and reset
              if (rpcError) {
                console.warn(
                  "delete_user_account RPC error:",
                  rpcError.message,
                );
              }

              // 2. Sign out of Supabase auth
              await supabase.auth.signOut();

              // 3. Reset the entire game store back to initial state
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
            } catch (e) {
              console.error("Delete account error:", e);
              Alert.alert(
                "Error",
                "Failed to delete account. Please try again.",
              );
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  return (
    <BottomSheetScrollView
      style={s.root}
      contentContainerStyle={[s.content, { paddingBottom: tabBarH }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={s.header}>
        <View style={s.hdrL}>
          <Ionicons name="settings-outline" size={20} color={color} />
          <Text style={s.title}>Settings</Text>
        </View>
        <TouchableOpacity
          onPress={closeSheet}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={22} color={Colors.dim} />
        </TouchableOpacity>
      </View>

      {/* Airline summary */}
      <View style={[s.airlineCard, { borderColor: color + "33" }]}>
        <View style={[s.airlineDot, { backgroundColor: color }]} />
        <View style={s.airlineInfo}>
          <Text style={s.airlineName}>{airline?.name ?? "Your Airline"}</Text>
          <Text style={s.airlineMeta}>
            Day {day} · {fmtCash(airline?.cash ?? 0)} cash
          </Text>
        </View>
      </View>

      {/* GAME */}
      <SectionHeader label="GAME" />
      <SettingRow
        icon="flag-outline"
        label="Daily Missions"
        sublabel="Today's challenges and rewards"
        onPress={() => openSheet("missions")}
        right={<Ionicons name="chevron-forward" size={14} color={Colors.dim} />}
      />
      <Divider />
      <SettingRow
        icon="trophy-outline"
        label="Achievements"
        sublabel="Your trophy cabinet"
        onPress={() => openSheet("achievements")}
        right={<Ionicons name="chevron-forward" size={14} color={Colors.dim} />}
      />
      <Divider />
      <SettingRow
        icon="podium-outline"
        label="Leaderboard"
        sublabel="Global rankings"
        onPress={() => openSheet("leaderboard")}
        right={<Ionicons name="chevron-forward" size={14} color={Colors.dim} />}
      />

      {/* ACCOUNT */}
      <SectionHeader label="ACCOUNT" />

      {/* Loading — session not yet confirmed */}
      {!loadComplete && (
        <SettingRow
          icon="person-circle-outline"
          label="Loading account..."
          sublabel=""
        />
      )}

      {/* Guest — show sync option */}
      {loadComplete && isAnonymous && (
        <>
          <SettingRow
            icon="person-outline"
            label="Playing as Guest"
            sublabel="Progress saved on this device only"
          />
          <Divider />
          <SettingRow
            icon="logo-google"
            label={linking ? "Connecting..." : "Sync with Google"}
            sublabel="Save progress across devices · required for purchases"
            onPress={linking ? undefined : handleLinkGoogle}
            right={
              linking ? (
                <ActivityIndicator size="small" color={Colors.sky} />
              ) : (
                <Ionicons name="chevron-forward" size={14} color={Colors.dim} />
              )
            }
          />
          {linkError && (
            <View
              style={{
                paddingHorizontal: Spacing.lg,
                marginTop: -Spacing.sm,
                marginBottom: Spacing.sm,
              }}
            >
              <Text style={{ fontSize: 10, color: Colors.red }}>
                {linkError}
              </Text>
            </View>
          )}
        </>
      )}

      {/* Google account — show account info only */}
      {loadComplete && !isAnonymous && (
        <SettingRow
          icon="logo-google"
          label="Google Account"
          sublabel={userEmail ?? "Signed in · progress synced across devices"}
          right={<Ionicons name="checkmark-circle" size={16} color="#22c55e" />}
        />
      )}

      <Divider />
      <SettingRow
        icon="trash-outline"
        label="Delete Account"
        sublabel="Permanently remove all data"
        onPress={handleDeleteAccount}
        danger
      />

      {/* ABOUT */}
      <SectionHeader label="SOUND" />
      <SettingRow
        icon="volume-high-outline"
        label="Sound Effects"
        sublabel="Planes, purchases, achievements"
        right={
          <Switch
            value={sfxOn}
            onValueChange={(v) => {
              setSfxOn(v);
              sounds.setSfxEnabled(v);
            }}
            trackColor={{ false: Colors.border, true: Colors.sky + "88" }}
            thumbColor={sfxOn ? Colors.sky : Colors.dim}
          />
        }
      />
      <Divider />

      <SectionHeader label="ABOUT" />
      <SettingRow
        icon="information-circle-outline"
        label="Version"
        sublabel="1.0.0"
      />
      <Divider />
      <SettingRow
        icon="shield-checkmark-outline"
        label="Privacy Policy"
        sublabel="How we handle your data"
        onPress={() => openSheet("privacy-policy")}
      />
    </BottomSheetScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingBottom: Spacing.xxl },

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

  airlineCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    backgroundColor: "rgba(255,255,255,.03)",
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.md,
  },
  airlineDot: { width: 14, height: 14, borderRadius: 7, flexShrink: 0 },
  airlineInfo: { flex: 1 },
  airlineName: { fontSize: 15, color: Colors.text, fontWeight: "700" },
  airlineMeta: { fontSize: 11, color: Colors.dim, marginTop: 2 },
});
