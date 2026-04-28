/**
 * components/sheets/PrivacyPolicySheet.tsx
 * Privacy policy for FlightCraft.
 */

import { Colors, Spacing } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import { useGameStore } from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

const LAST_UPDATED = "April 2025";

function Section({
  title,
  children,
}: {
  title: string;
  children: string | string[];
}) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <Text style={s.sectionBody}>{children}</Text>
    </View>
  );
}

export default function PrivacyPolicySheet() {
  const closeSheet = useGameStore((s) => s.closeSheet);
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
            size={20}
            color={Colors.sky}
          />
          <Text style={s.title}>Privacy Policy</Text>
        </View>
        <TouchableOpacity
          onPress={closeSheet}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={22} color={Colors.dim} />
        </TouchableOpacity>
      </View>

      <Text style={s.lastUpdated}>Last updated: {LAST_UPDATED}</Text>
      <View style={s.divider} />

      <Section title="Who We Are">
        FlightCraft is a mobile airline tycoon simulation game. This policy
        explains what data we collect, how we use it, and your rights regarding
        your information.
      </Section>

      <Section title="Data We Collect">
        When you play FlightCraft, we collect and store the following
        information:{"\n\n"}• Game progress — your airline name, cash, routes,
        hubs, fleet, day count, and achievements{"\n"}• Anonymous user
        identifier — a randomly generated ID used to save your progress across
        sessions{"\n"}• Device type and operating system version — used for
        crash reporting and compatibility{"\n\n"}
        We do NOT collect your name, email address, phone number, location, or
        any other personally identifiable information unless you choose to link
        an account.
      </Section>

      <Section title="How We Use Your Data">
        Your game data is used exclusively to:{"\n\n"}• Save and restore your
        game progress{"\n"}• Display your score on the global leaderboard{"\n"}•
        Improve gameplay balance and fix bugs{"\n\n"}
        We do not use your data for advertising, profiling, or any commercial
        purpose beyond operating the game.
      </Section>

      <Section title="Data Storage">
        Your game data is stored securely using Supabase, a cloud database
        provider. Data is stored in encrypted form and protected by
        industry-standard security practices. We retain your data for as long as
        your account is active. You can request deletion at any time using the
        Delete Account option in Settings.
      </Section>

      <Section title="Leaderboard">
        If you appear on the global leaderboard, your airline name and score are
        visible to other players. No other personal information is shared. Your
        airline name is set by you and does not have to be your real name.
      </Section>

      <Section title="Third-Party Services">
        FlightCraft uses the following third-party services:{"\n\n"}• Supabase —
        database and authentication (supabase.com/privacy){"\n"}• Expo / React
        Native — app framework{"\n\n"}
        Future versions may include advertising (Google AdMob) and in-app
        purchases. This policy will be updated before those features are
        enabled.
      </Section>

      <Section title="Children">
        FlightCraft is rated for all ages. We do not knowingly collect personal
        information from children under 13. If you believe a child has provided
        personal information, please contact us and we will delete it promptly.
      </Section>

      <Section title="Your Rights">
        You have the right to:{"\n\n"}• Access the data we hold about you{"\n"}•
        Request correction of inaccurate data{"\n"}• Request deletion of your
        account and all associated data{"\n"}• Withdraw consent at any time
        {"\n\n"}
        To exercise these rights, use the Delete Account option in Settings or
        contact us directly.
      </Section>

      <Section title="Contact">
        If you have questions about this privacy policy or how we handle your
        data, please contact us through the FlightCraft page on the Google Play
        Store.
      </Section>

      <View style={s.footer}>
        <Text style={s.footerTxt}>FlightCraft · {LAST_UPDATED}</Text>
      </View>
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
    paddingBottom: Spacing.sm,
  },
  hdrL: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  title: { fontSize: 20, color: Colors.text, fontWeight: "700" },
  lastUpdated: {
    fontSize: 10,
    color: Colors.dim,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginBottom: Spacing.md,
  },
  section: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  sectionTitle: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: "700",
    marginBottom: Spacing.sm,
  },
  sectionBody: { fontSize: 12, color: Colors.muted, lineHeight: 20 },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    alignItems: "center",
  },
  footerTxt: { fontSize: 10, color: Colors.dim },
});
