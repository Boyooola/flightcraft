/**
 * components/sheets/MissionsSheet.tsx
 *
 * Worldwide Rush-style mission board.
 */

import { Colors, Radius, Spacing } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/useSheetLayout";
import {
  useWeeklyChallenge,
  useWeeklyProgress,
} from "@/hooks/useWeeklyChallenge";
import type { Mission } from "@/lib/missions";
import { fmtCash } from "@/lib/revenue";
import {
  useAirline,
  useBoughtPlaneToday,
  useDailyMissions,
  useDay,
  useDemands,
  useGameStore,
  useHubs,
  useRoutes,
} from "@/store";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

const GREEN = "#22c55e";
const AMBER = "#F59E0B";

const MISSION_ICONS: Record<string, string> = {
  route_create: "airplane-outline",
  pax_carry: "people-outline",
  revenue_earn: "cash-outline",
  trust_grow: "heart-outline",
  loan_repay: "shield-checkmark-outline",
  fill_rate: "speedometer-outline",
  clear_crowding: "alert-circle-outline",
  plane_buy: "construct-outline",
  no_crowding: "checkmark-done-outline",
};

function useMissionProgress(mission: Mission) {
  const demands = useDemands();
  const routes = useRoutes();
  const hubs = useHubs();
  const airline = useAirline();
  const ledger = useGameStore((s) => s.ledger);
  const boughtPlane = useBoughtPlaneToday();

  return useMemo(() => {
    if (mission.completed) return { progress: 1, complete: true };
    const t = mission.target;

    switch (mission.type) {
      case "route_create": {
        const found =
          t.originIata && t.destIata
            ? routes.some(
                (r) =>
                  r.active &&
                  r.demand.origin.iata === t.originIata &&
                  r.demand.dest.iata === t.destIata,
              )
            : routes.some((r) => r.active && r.demand.haul === t.haul);

        return { progress: found ? 1 : 0, complete: found };
      }

      case "pax_carry": {
        const moved = demands.reduce(
          (sum, d) => sum + (d.delivered_pax_today ?? 0),
          0,
        );
        const progress = Math.min(1, moved / (t.paxTarget ?? 1));
        return { progress, complete: progress >= 1 };
      }

      case "revenue_earn": {
        const day = airline?.day ?? 1;
        const earned = ledger
          .filter(
            (e) =>
              e.day === day &&
              e.type === "revenue" &&
              !e.label.startsWith("Mission:"),
          )
          .reduce((sum, e) => sum + e.amount, 0);

        const progress = Math.max(
          0,
          Math.min(1, earned / (t.revenueTarget ?? 1)),
        );

        return { progress, complete: progress >= 1 };
      }

      case "trust_grow": {
        const hub = hubs.find((h) => h.airport.iata === t.hubIata);
        const progress = hub
          ? Math.min(1, hub.trust / (t.trustTarget ?? 1))
          : 0;
        return { progress, complete: progress >= 1 };
      }

      case "loan_repay": {
        const currentLoan = airline?.loan ?? 0;
        if (currentLoan <= 0) return { progress: 1, complete: true };
        return { progress: 0.5, complete: false };
      }

      case "fill_rate": {
        const best = demands.reduce((max, d) => {
          if (d.base_pax_day <= 0) return max;
          return Math.max(max, (d.delivered_pax_today ?? 0) / d.base_pax_day);
        }, 0);

        const progress = Math.min(1, best / ((t.fillTarget ?? 100) / 100));
        return { progress, complete: progress >= 1 };
      }

      case "clear_crowding": {
        const remaining = demands.filter(
          (d) => d.hub_iata === t.crowdHubIata && d.status === "pending",
        );

        const complete = remaining.length === 0;
        return { progress: complete ? 1 : 0.5, complete };
      }

      case "plane_buy":
        return { progress: boughtPlane ? 1 : 0, complete: boughtPlane };

      case "no_crowding":
        return { progress: 0, complete: false };

      default:
        return { progress: 0, complete: false };
    }
  }, [
    mission.completed,
    mission.target,
    mission.type,
    boughtPlane,
    routes,
    demands,
    airline?.day,
    airline?.loan,
    ledger,
    hubs,
  ]);
}

function MissionCard({ mission, color }: { mission: Mission; color: string }) {
  const { progress, complete } = useMissionProgress(mission);
  const done = mission.completed || complete;
  const accent = done ? GREEN : color;
  const icon = MISSION_ICONS[mission.type] ?? "flag-outline";
  const pct = Math.round(progress * 100);

  return (
    <View
      style={[
        mc.card,
        done && {
          borderColor: GREEN + "44",
          backgroundColor: GREEN + "07",
        },
      ]}
    >
      <View style={[mc.stripe, { backgroundColor: accent }]} />

      <View style={mc.body}>
        <View style={mc.top}>
          <View style={[mc.icon, { backgroundColor: accent + "18" }]}>
            <Ionicons name={icon as any} size={17} color={accent} />
          </View>

          <View style={{ flex: 1 }}>
            <View style={mc.titleRow}>
              <Text style={[mc.title, done && mc.doneTitle]} numberOfLines={1}>
                {mission.title}
              </Text>
              <View
                style={[
                  mc.status,
                  {
                    backgroundColor: accent + "15",
                    borderColor: accent + "33",
                  },
                ]}
              >
                <Text style={[mc.statusText, { color: accent }]}>
                  {done ? "CLEARED" : "ACTIVE"}
                </Text>
              </View>
            </View>

            <Text style={mc.desc} numberOfLines={2}>
              {mission.desc}
            </Text>
          </View>
        </View>

        <View style={mc.progressRow}>
          <View style={mc.track}>
            <View
              style={[
                mc.fill,
                {
                  width: `${pct}%` as any,
                  backgroundColor: accent,
                },
              ]}
            />
          </View>
          <Text style={[mc.pct, { color: accent }]}>{pct}%</Text>
        </View>

        <View style={mc.footer}>
          <View
            style={[
              mc.reward,
              {
                backgroundColor: accent + "12",
                borderColor: accent + "33",
              },
            ]}
          >
            <Ionicons name="cash-outline" size={11} color={accent} />
            <Text style={[mc.rewardText, { color: accent }]}>
              {fmtCash(mission.reward)}
            </Text>
          </View>

          <Text style={[mc.note, done && { color: GREEN }]}>
            {mission.completed
              ? "Reward earned"
              : done
                ? "Reward on day advance"
                : "Clear this contract"}
          </Text>
        </View>
      </View>
    </View>
  );
}

function WeeklyChallengeCard({
  challenge,
  onComplete,
  completing,
}: {
  challenge: import("@/hooks/useWeeklyChallenge").WeeklyChallenge;
  onComplete: () => void;
  completing: boolean;
}) {
  const progress = useWeeklyProgress(challenge);
  const pct = Math.round(progress * 100);
  const done = challenge.completed;

  return (
    <View
      style={[
        wc.card,
        done && {
          borderColor: GREEN + "44",
          backgroundColor: GREEN + "07",
        },
      ]}
    >
      <View style={wc.stripe} />

      <View style={wc.body}>
        <View style={wc.badge}>
          <Text style={wc.badgeText}>WEEKLY RUSH</Text>
        </View>

        <View style={wc.titleRow}>
          <View style={wc.icon}>
            <Ionicons name={challenge.icon as any} size={17} color={AMBER} />
          </View>
          <Text style={wc.title}>{challenge.title}</Text>
        </View>

        <Text style={wc.desc}>{challenge.desc}</Text>

        <View style={wc.progressRow}>
          <View style={wc.track}>
            <View
              style={[
                wc.fill,
                {
                  width: `${pct}%` as any,
                  backgroundColor: done ? GREEN : AMBER,
                },
              ]}
            />
          </View>
          <Text style={[wc.pct, { color: done ? GREEN : AMBER }]}>{pct}%</Text>
        </View>

        <View style={wc.footer}>
          <View style={wc.reward}>
            <Ionicons name="cash-outline" size={11} color={AMBER} />
            <Text style={wc.rewardText}>{fmtCash(challenge.reward)}</Text>
          </View>

          {!done && progress >= 1 ? (
            <TouchableOpacity
              style={wc.claimBtn}
              onPress={onComplete}
              disabled={completing}
              activeOpacity={0.85}
            >
              <Text style={wc.claimText}>
                {completing ? "Claiming..." : "Claim"}
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={[wc.note, done && { color: GREEN }]}>
              {done ? "Earned this week" : "Big weekly reward"}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

export default function MissionsSheet() {
  const missions = useDailyMissions();
  const airline = useAirline();
  const day = useDay();
  const closeSheet = useGameStore((s) => s.closeSheet);
  const {
    challenge: weekly,
    completeWeekly,
    completing,
  } = useWeeklyChallenge();
  const tabBarH = useTabBarHeight();

  const color = airline?.color ?? Colors.sky;
  const doneCount = missions.filter((m) => m.completed).length;
  const allDone = doneCount === 3 && missions.length === 3;

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
            <Text style={s.title}>Mission Rush</Text>
            <Text style={s.subtitle}>Clear contracts before day ends</Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={closeSheet}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={22} color={Colors.dim} />
        </TouchableOpacity>
      </View>

      <View
        style={[s.hero, { borderColor: allDone ? GREEN + "44" : color + "44" }]}
      >
        <View>
          <Text style={s.heroLabel}>DAY {day} CONTRACTS</Text>
          <Text style={[s.heroValue, { color: allDone ? GREEN : color }]}>
            {doneCount}/3
          </Text>
          <Text style={s.heroSub}>
            {allDone
              ? "Board cleared. Rewards soon."
              : "Complete missions to boost your airline."}
          </Text>
        </View>

        <View style={s.dots}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={[
                s.dot,
                {
                  backgroundColor:
                    i < doneCount ? GREEN : "rgba(255,255,255,.14)",
                },
              ]}
            />
          ))}
        </View>
      </View>

      {allDone && (
        <View style={s.allDone}>
          <Ionicons name="trophy" size={14} color={GREEN} />
          <Text style={s.allDoneText}>
            Daily board cleared. Rewards credit on next day advance.
          </Text>
        </View>
      )}

      {weekly && (
        <View style={s.cards}>
          <WeeklyChallengeCard
            challenge={weekly}
            onComplete={completeWeekly}
            completing={completing}
          />
        </View>
      )}

      <Text style={s.sectionTitle}>TODAY&apos;S CONTRACTS</Text>

      {missions.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="flag-outline" size={40} color={Colors.dim} />
          <Text style={s.emptyText}>
            Missions generate at the start of each day.
          </Text>
        </View>
      ) : (
        <View style={s.cards}>
          {missions.map((mission) => (
            <MissionCard key={mission.id} mission={mission} color={color} />
          ))}
        </View>
      )}

      <View style={s.divider} />
    </BottomSheetScrollView>
  );
}

const mc = StyleSheet.create({
  card: {
    flexDirection: "row",
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
    marginBottom: Spacing.sm,
    backgroundColor: "rgba(255,255,255,.025)",
  },
  stripe: { width: 4 },
  body: { flex: 1, padding: Spacing.md, gap: Spacing.sm },
  top: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.sm },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  title: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
    fontWeight: "900",
  },
  doneTitle: {
    color: Colors.dim,
    textDecorationLine: "line-through",
  },
  status: {
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  statusText: {
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1,
  },
  desc: {
    fontSize: 11,
    color: Colors.dim,
    lineHeight: 16,
    marginTop: 2,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  track: {
    flex: 1,
    height: 5,
    backgroundColor: "rgba(255,255,255,.08)",
    borderRadius: 999,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 999,
  },
  pct: {
    fontSize: 10,
    fontWeight: "900",
    minWidth: 34,
    textAlign: "right",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reward: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  rewardText: {
    fontSize: 11,
    fontWeight: "900",
  },
  note: {
    fontSize: 9,
    color: Colors.dim,
  },
});

const wc = StyleSheet.create({
  card: {
    flexDirection: "row",
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
    marginBottom: Spacing.md,
    backgroundColor: "rgba(255,255,255,.025)",
  },
  stripe: {
    width: 4,
    backgroundColor: AMBER,
  },
  body: {
    flex: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: AMBER + "44",
    backgroundColor: AMBER + "16",
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 7,
    color: AMBER,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: AMBER + "18",
  },
  title: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
    fontWeight: "900",
  },
  desc: {
    fontSize: 11,
    color: Colors.muted,
    lineHeight: 16,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  track: {
    flex: 1,
    height: 5,
    backgroundColor: "rgba(255,255,255,.08)",
    borderRadius: 999,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 999,
  },
  pct: {
    fontSize: 10,
    fontWeight: "900",
    minWidth: 34,
    textAlign: "right",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reward: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: AMBER + "33",
    backgroundColor: AMBER + "12",
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  rewardText: {
    fontSize: 11,
    color: AMBER,
    fontWeight: "900",
  },
  claimBtn: {
    borderRadius: Radius.md,
    backgroundColor: GREEN,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  claimText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#fff",
  },
  note: {
    fontSize: 10,
    color: Colors.dim,
    fontWeight: "700",
  },
});

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
    backgroundColor: "rgba(255,255,255,.035)",
    padding: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroLabel: {
    fontSize: 8,
    color: Colors.dim,
    letterSpacing: 1.8,
    fontWeight: "900",
  },
  heroValue: {
    fontSize: 32,
    fontWeight: "900",
    marginTop: 3,
  },
  heroSub: {
    fontSize: 10,
    color: Colors.dim,
    marginTop: 2,
  },
  dots: {
    flexDirection: "row",
    gap: 7,
  },
  dot: {
    width: 11,
    height: 11,
    borderRadius: 999,
  },

  allDone: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: GREEN + "10",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: GREEN + "33",
    padding: Spacing.sm,
  },
  allDoneText: {
    fontSize: 11,
    color: GREEN,
    flex: 1,
    fontWeight: "700",
  },

  sectionTitle: {
    fontSize: 9,
    color: Colors.dim,
    letterSpacing: 2.5,
    fontWeight: "900",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionTitleNoPad: {
    fontSize: 9,
    color: Colors.dim,
    letterSpacing: 2.5,
    fontWeight: "900",
    marginBottom: Spacing.sm,
  },
  cards: {
    paddingHorizontal: Spacing.lg,
  },

  empty: {
    paddingVertical: Spacing.xxl * 2,
    alignItems: "center",
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: 12,
    color: Colors.dim,
    textAlign: "center",
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },

  stats: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  statBox: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,.04)",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.md,
    alignItems: "center",
    gap: 3,
  },
  statVal: {
    fontSize: 22,
    fontWeight: "900",
  },
  statLbl: {
    fontSize: 9,
    color: Colors.dim,
    letterSpacing: 0.5,
  },
});
