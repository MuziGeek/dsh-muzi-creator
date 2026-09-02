import { useEffect, useState } from "react";

import type { DailyHotItem, DailyHotItemId } from "../dailyHotTypes.ts";
import { browserCreatorStorage, loadCreatorUiState, saveCreatorUiState } from "./persistence.ts";

type Listener = () => void;

const listeners = new Set<Listener>();
let selectedItem: DailyHotItem | null = null;
let selectedItemId = loadCreatorUiState(browserCreatorStorage()).selections.hotId as DailyHotItemId | null;

function persist(): void {
  const storage = browserCreatorStorage();
  const state = loadCreatorUiState(storage);
  saveCreatorUiState(storage, {
    ...state,
    selections: { ...state.selections, hotId: selectedItemId },
  });
}

function emit(): void {
  for (const listener of listeners) listener();
}

/** Return the hotspot currently shown in the shared inspector. */
export function getSelectedDailyHotItem(): DailyHotItem | null {
  return selectedItem;
}

/** Return the persisted hotspot identity even before its read-only snapshot has loaded. */
export function getSelectedDailyHotId(): DailyHotItemId | null {
  return selectedItemId;
}

/** Select a hotspot for this browser session without persisting external data. */
export function selectDailyHotItem(item: DailyHotItem | null): void {
  if (selectedItem === item) return;
  selectedItem = item;
  selectedItemId = item?.id ?? null;
  persist();
  emit();
}

/** Restore or invalidate the persisted hotspot against the latest aggregate. */
export function resolveDailyHotSelection(items: readonly DailyHotItem[]): DailyHotItem | null {
  if (selectedItemId === null) {
    if (selectedItem !== null) {
      selectedItem = null;
      emit();
    }
    return null;
  }
  const resolved = items.find((item) => item.id === selectedItemId) ?? null;
  if (resolved === null) {
    selectedItem = null;
    selectedItemId = null;
    persist();
    emit();
    return null;
  }
  if (selectedItem !== resolved) {
    selectedItem = resolved;
    emit();
  }
  return resolved;
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

/** Read the persisted hotspot id from React while data is still loading. */
export function useDailyHotSelectionId(): DailyHotItemId | null {
  const [id, setId] = useState(getSelectedDailyHotId);
  useEffect(() => subscribeDailyHotSelection(() => { setId(getSelectedDailyHotId()); }), []);
  return id;
}
