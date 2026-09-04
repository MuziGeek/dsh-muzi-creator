import { useEffect, useState } from "react";

import {
  browserCreatorStorage,
  loadCreatorUiState,
  saveCreatorUiState,
  type InspirationSelection,
} from "./persistence.ts";

type Listener = () => void;

const listeners = new Set<Listener>();
let selection = loadCreatorUiState(browserCreatorStorage()).selections.inspiration;
let epoch = 0;

function persist(): void {
  const storage = browserCreatorStorage();
  const state = loadCreatorUiState(storage);
  saveCreatorUiState(storage, {
    ...state,
    selections: { ...state.selections, inspiration: selection },
  });
}

function emit(): void {
  for (const listener of listeners) listener();
}

export function getInspirationSelection(): InspirationSelection {
  return selection;
}

export function setInspirationSelection(next: InspirationSelection): void {
  if (JSON.stringify(selection) === JSON.stringify(next)) return;
  selection = next;
  persist();
  emit();
}

export function useInspirationSelection(): [InspirationSelection, (next: InspirationSelection) => void] {
  const [current, setCurrent] = useState(getInspirationSelection);
  useEffect(() => {
    listeners.add(update);
    function update(): void { setCurrent(getInspirationSelection()); }
    return () => { listeners.delete(update); };
  }, []);
  return [current, setInspirationSelection];
}

export function bumpInspiration(): void {
  epoch += 1;
  emit();
}

export function getInspirationEpoch(): number {
  return epoch;
}

export function useInspirationEpoch(): number {
  const [current, setCurrent] = useState(getInspirationEpoch);
  useEffect(() => {
    listeners.add(update);
    function update(): void { setCurrent(getInspirationEpoch()); }
    return () => { listeners.delete(update); };
  }, []);
  return current;
}
