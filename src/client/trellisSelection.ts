import { useEffect, useState } from "react";

import type { TrellisProjectId, TrellisTaskKey } from "../trellisTypes.ts";
import { browserCreatorStorage, loadCreatorUiState, saveCreatorUiState } from "./persistence.ts";

type Listener = () => void;

const selectionListeners = new Set<Listener>();
const revisionListeners = new Set<Listener>();
const initialProject = loadCreatorUiState(browserCreatorStorage()).selections.project;
let selectedProjectId = (initialProject?.projectId ?? null) as TrellisProjectId | null;
let selectedTaskKey = (initialProject?.taskKey ?? null) as TrellisTaskKey | null;
let trellisEpoch = 0;

function persist(): void {
  const storage = browserCreatorStorage();
  const state = loadCreatorUiState(storage);
  saveCreatorUiState(storage, {
    ...state,
    selections: {
      ...state.selections,
      project: selectedProjectId === null
        ? null
        : {
            projectId: selectedProjectId,
            ...(selectedTaskKey === null ? {} : { taskKey: selectedTaskKey }),
          },
    },
  });
}

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
  if (selectedProjectId === projectId) return;
  selectedProjectId = projectId;
  selectedTaskKey = null;
  persist();
  emitSelection();
}

export function selectTrellisTask(taskKey: TrellisTaskKey | null): void {
  if (selectedTaskKey === taskKey) return;
  selectedTaskKey = taskKey;
  persist();
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
