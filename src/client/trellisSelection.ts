import { useEffect, useState } from "react";

import type { TrellisProjectId, TrellisTaskKey } from "../trellisTypes.ts";

type Listener = () => void;

const selectionListeners = new Set<Listener>();
const revisionListeners = new Set<Listener>();
let selectedProjectId: TrellisProjectId | null = null;
let selectedTaskKey: TrellisTaskKey | null = null;
let trellisEpoch = 0;

function emitSelection(): void {
  for (const listener of selectionListeners) listener();
}

export function getSelectedTrellisProjectId(): TrellisProjectId | null {
  return selectedProjectId;
}

export function getSelectedTrellisTaskKey(): TrellisTaskKey | null {
  return selectedTaskKey;
}

export function selectTrellisProject(projectId: TrellisProjectId | null): void {
  if (selectedProjectId === projectId && (projectId !== null || selectedTaskKey === null)) return;
  selectedProjectId = projectId;
  selectedTaskKey = null;
  emitSelection();
}

export function selectTrellisTask(taskKey: TrellisTaskKey | null): void {
  if (selectedTaskKey === taskKey) return;
  selectedTaskKey = taskKey;
  emitSelection();
}

export function subscribeTrellisSelection(listener: Listener): () => void {
  selectionListeners.add(listener);
  return () => { selectionListeners.delete(listener); };
}

export function useTrellisSelection(): {
  projectId: TrellisProjectId | null;
  taskKey: TrellisTaskKey | null;
} {
  const [selection, setSelection] = useState(() => ({
    projectId: selectedProjectId,
    taskKey: selectedTaskKey,
  }));
  useEffect(() => subscribeTrellisSelection(() => {
    setSelection({ projectId: selectedProjectId, taskKey: selectedTaskKey });
  }), []);
  return selection;
}

export function bumpTrellis(): void {
  trellisEpoch += 1;
  for (const listener of revisionListeners) listener();
}

export function getTrellisEpoch(): number {
  return trellisEpoch;
}

export function subscribeTrellis(listener: Listener): () => void {
  revisionListeners.add(listener);
  return () => { revisionListeners.delete(listener); };
}

export function useTrellisEpoch(): number {
  const [epoch, setEpoch] = useState(getTrellisEpoch);
  useEffect(() => subscribeTrellis(() => { setEpoch(getTrellisEpoch()); }), []);
  return epoch;
}
