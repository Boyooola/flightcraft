/**
 * Announces new rival routes that compete with a current player market.
 * Rival rosters are already simulated by useAITick, so this hook only compares
 * the completed before-and-after snapshots.
 */

import {
  getLatestAIRosterTransition,
  subscribeToAIRosterTransitions,
  type AIRosterTransition,
} from "@/hooks/useAITick";
import { publishDispatchNews } from "@/hooks/useDispatchNews";
import { useGameStore, type Demand } from "@/store";
import { useEffect, useRef } from "react";

interface RivalRouteConflict {
  rivalId: string;
  rivalName: string;
  originIata: string;
  destinationIata: string;
}

function corridorKey(originIata: string, destinationIata: string): string {
  return [originIata, destinationIata].sort().join(":");
}

function findNewRouteConflicts(
  transition: AIRosterTransition,
  playerMarkets: readonly Demand[],
): RivalRouteConflict[] {
  const activeMarketCorridors = new Set(
    playerMarkets.map((market) =>
      corridorKey(market.origin.iata, market.dest.iata),
    ),
  );
  const previousByRivalId = new Map(
    transition.previousRoster.map((rival) => [rival.id, rival]),
  );

  return transition.currentRoster.flatMap((rival) => {
    const previousRival = previousByRivalId.get(rival.id);
    const previousCorridors = new Set(
      (previousRival?.routes ?? []).map((route) =>
        corridorKey(route.originIata, route.destIata),
      ),
    );

    return rival.routes.flatMap((route) => {
      const corridor = corridorKey(route.originIata, route.destIata);
      if (
        previousCorridors.has(corridor) ||
        !activeMarketCorridors.has(corridor)
      ) {
        return [];
      }

      return [
        {
          rivalId: rival.id,
          rivalName: rival.name,
          originIata: route.originIata,
          destinationIata: route.destIata,
        },
      ];
    });
  });
}

function publishCompetitionNews(transition: AIRosterTransition) {
  if (transition.reason !== "day-advanced") return;

  const store = useGameStore.getState();
  if (
    !store.loadComplete ||
    store.phase !== "playing" ||
    store.airline?.day !== transition.day ||
    store.demands.length === 0
  ) {
    return;
  }

  const conflicts = findNewRouteConflicts(transition, store.demands);
  if (conflicts.length === 0) return;

  const first = conflicts[0];
  const additionalCount = conflicts.length - 1;
  const additionalText =
    additionalCount > 0
      ? ` ${additionalCount} more rival route${additionalCount === 1 ? "" : "s"} opened today.`
      : "";

  publishDispatchNews({
    id: `rival-route-${transition.day}-${first.rivalId}-${corridorKey(first.originIata, first.destinationIata)}`,
    day: transition.day,
    text: `${first.rivalName} opened ${first.originIata} to ${first.destinationIata}. It now competes for this market.${additionalText}`,
    tone: "warning",
  });
}

export function useAICompetition() {
  const handledTransition = useRef<AIRosterTransition | null>(null);
  const loadComplete = useGameStore((state) => state.loadComplete);
  const phase = useGameStore((state) => state.phase);

  useEffect(() => {
    if (!loadComplete || phase !== "playing") return;

    const handleTransition = (transition: AIRosterTransition) => {
      if (handledTransition.current === transition) return;
      handledTransition.current = transition;
      publishCompetitionNews(transition);
    };

    const unsubscribe = subscribeToAIRosterTransitions(handleTransition);

    // useAITick runs first in the game screen, so collect a transition that
    // may have completed before this effect subscribed.
    const latest = getLatestAIRosterTransition();
    if (latest) handleTransition(latest);

    return unsubscribe;
  }, [loadComplete, phase]);
}
