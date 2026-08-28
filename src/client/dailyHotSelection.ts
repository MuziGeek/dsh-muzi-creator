import { useEffect, useState } from "react";

import type { DailyHotItem } from "../dailyHotTypes.ts";

type Listener = () => void;

const listeners = new Set<Listener>();
let selectedItem: DailyHotItem | null = null;

/** Return the hotspot currently shown in the shared inspector. */
export function getSelectedDailyHotItem(): DailyHotItem | null {
  return selectedItem;
}

/** Select a hotspot for this browser session without persisting external data. */
export function selectDailyHotItem(item: DailyHotItem | null): void {
  if (selectedItem === item) return;
  selectedItem = item;
  for (const listener of listeners) listener();
}

/** Subscribe to hotspot selection changes. */
export function subscribeDailyHotSelection(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Read the current hotspot selection from a React view. */
export function useDailyHotSelection(): DailyHotItem | null {
  const [item, setItem] = useState(getSelectedDailyHotItem);
  useEffect(() => subscribeDailyHotSelection(() => {
    setItem(getSelectedDailyHotItem());
  }), []);
  return item;
}
