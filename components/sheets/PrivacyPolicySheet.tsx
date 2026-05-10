/**
 * components/sheets/PrivacyPolicySheet.tsx
 * Privacy policy for Flightcraft.
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import { useGameStore } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

const LAST_UPDATED = "May 2026";

function Section({
  icon,
  title,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <View style={s.sectionIcon}>
          <Ionicons name={icon} size={14} color={Colors.sky} />
        </View>
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      <Text style={s.sectionBody}>{children}</Text>
    </View>
  );
}

export default function PrivacyPolicySheet() {
  const closeSheet = useGameStore((state) => state.closeSheet);
  const tabBarH = useTabBarHeight();

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
          <Ionicons
            name="shield-checkmark-outline"
            size={21}
            color={Colors.sky}
          />
          <View>
            <Text style={s.title}>Privacy Policy</Text>
            <Text style={s.subtitle}>Flightcraft</Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={closeSheet}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={22} color={Colors.dim} />
        </TouchableOpacity>
      </View>

      <View style={s.hero}>
        <Text style={s.heroLabel}>LAST UPDATED</Text>
        <Text style={s.heroValue}>{LAST_UPDATED}</Text>
        <Text style={s.heroText}>
          This policy explains what data Flightcraft collects, how it is used,
          and what choices you have.
        </Text>
      </View>

      <Section icon="business-outline" title="Who We Are">
        Flightcraft is a mobile airline tycoon game. This privacy policy applies
        to the Flightcraft mobile app and related game services.
      </Section>

      <Section icon="server-outline" title="Data We Collect">
        We collect game-related data needed to operate the game, including your
        airline name, cash, routes, hubs, fleet, game day, achievements,
        leaderboard score, and saved progress.{"\n\n"}
        We also collect your Google Play Games player ID and display name to
        identify your account, save progress, and operate leaderboard features.
        We may collect device type, OS version, and basic crash or diagnostic
        information.{"\n\n"}
        We do not collect your email address, phone number, or precise location.
      </Section>

      <Section icon="game-controller-outline" title="How We Use Data">
        We use your data to save and restore game progress, operate leaderboard
        features, process in-app purchases, deliver rewarded ads, and maintain
        app stability.{"\n\n"}
        We do not sell your personal data to third parties.
      </Section>

      <Section icon="trophy-outline" title="Leaderboard">
        If you use the leaderboard, your airline name and score may be visible
        to other players. Your airline name is chosen by you and does not need
        to be your real name.
      </Section>

      <Section icon="cloud-outline" title="Storage and Security">
        Game data is stored on your device and in Supabase. Your account is
        identified by your Google Play Games player ID — no password is stored
        by Flightcraft.{"\n\n"}
        We use reasonable technical measures to protect your data.
      </Section>

      <Section icon="videocam-outline" title="Advertising">
        Flightcraft includes optional rewarded video ads powered by Google
        AdMob. These ads are shown only when you choose to watch them in
        exchange for in-game rewards. You are never shown ads without opting in.
        {"\n\n"}
        AdMob may use your advertising ID to serve relevant ads. You can reset
        or opt out of ad personalisation in your device settings under Privacy →
        Ads.
      </Section>

      <Section icon="notifications-outline" title="Notifications">
        Flightcraft may use local notifications to remind you about game
        progress, rewards, or leaderboard changes. You can disable notifications
        at any time in your device settings.
      </Section>

      <Section icon="link-outline" title="Third-Party Services">
        Flightcraft may use third-party services for authentication, database
        storage, crash reporting, app distribution, and app functionality. These
        include:{"\n"}• Google Play Games Services — authentication and
        leaderboards{"\n"}• Supabase — encrypted cloud storage{"\n"}• Google
        AdMob — opt-in rewarded video ads{"\n"}• RevenueCat — in-app purchases
        {"\n"}• Sentry — anonymous crash reporting{"\n"}• Expo / EAS — app
        distribution{"\n\n"}
        Each service operates under its own privacy policy.
      </Section>

      <Section icon="people-outline" title="Children">
        Flightcraft is intended for a general audience. We do not knowingly
        collect personal information from children under 13. If you believe a
        child has provided personal information, please contact us so we can
        delete it.
      </Section>

      <Section icon="person-circle-outline" title="Your Choices and Rights">
        You may delete your game data at any time using Delete Account in
        Settings. This permanently removes your airline and all progress from
        our servers.{"\n\n"}
        You can opt out of personalised ads through your Google account settings
        or device advertising preferences.
      </Section>

      <Section icon="refresh-outline" title="Policy Updates">
        We may update this privacy policy from time to time. When we make
        important changes, we will update the “Last updated” date and may notify
        you in the app or through the app store listing.
      </Section>

      <Section icon="mail-outline" title="Contact">
        For privacy questions or data requests, contact us through the
        Flightcraft page on the Google Play Store.
      </Section>

      <View style={s.footer}>
        <Text style={s.footerTxt}>
          Flightcraft · Privacy Policy · {LAST_UPDATED}
        </Text>
      </View>
    </BottomSheetScrollView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
  },
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
  hero: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.sky + "33",
    backgroundColor: "rgba(255,255,255,.035)",
    padding: Spacing.md,
  },
  heroLabel: {
    fontSize: 8,
    color: Colors.dim,
    letterSpacing: 1.8,
    fontWeight: "900",
  },
  heroValue: {
    fontSize: 22,
    color: Colors.sky,
    fontWeight: "900",
    marginTop: 3,
  },
  heroText: {
    fontSize: 11,
    color: Colors.muted,
    lineHeight: 17,
    marginTop: Spacing.sm,
  },
  section: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(255,255,255,.025)",
    padding: Spacing.md,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  sectionIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: Colors.sky + "16",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: "900",
  },
  sectionBody: {
    fontSize: 12,
    color: Colors.muted,
    lineHeight: 20,
  },
  footer: {
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  footerTxt: {
    fontSize: 10,
    color: Colors.dim,
  },
});
