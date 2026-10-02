/**
 * Small in-memory channel for temporary operations news.
 * Items are day-scoped and are not written to the saved game.
 */

import { useEffect, useState } from "react";

export type DispatchNewsTone = "neutral" | "positive" | "warning" | "negative";

export interface DispatchNewsItem {
  id: string;
  day: number;
  text: string;
  tone: DispatchNewsTone;
}

type Listener = (items: DispatchNewsItem[]) => void;

let items: DispatchNewsItem[] = [];
const listeners = new Set<Listener>();

function notifyListeners() {
  listeners.forEach((listener) => listener(items));
}

export function publishDispatchNews(item: DispatchNewsItem) {
  items = [item, ...items.filter((existing) => existing.id !== item.id)].slice(
    0,
    6,
  );
  notifyListeners();
}

export function useDispatchNews(day: number): DispatchNewsItem[] {
  const [currentItems, setCurrentItems] = useState(items);

  useEffect(() => {
    const listener: Listener = (nextItems) => setCurrentItems(nextItems);
    listeners.add(listener);
    setCurrentItems(items);

    return () => {
      listeners.delete(listener);
    };
  }, []);

  return currentItems.filter((item) => item.day === day);
}
