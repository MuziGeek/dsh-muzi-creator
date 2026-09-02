import { useEffect, useState } from "react";

import {
  browserCreatorStorage,
  loadCreatorUiState,
  saveCreatorUiState,
  type FeatureSelections,
  type KnowledgeSelection,
  type SidebarTab,
} from "./persistence.ts";

type Listener = () => void;

const selectionListeners = new Set<Listener>();
const libraryListeners = new Set<Listener>();
const profileListeners = new Set<Listener>();
const chromeListeners = new Set<Listener>();
const statusListeners = new Set<Listener>();
const initialUi = loadCreatorUiState(browserCreatorStorage());
let selections: FeatureSelections = initialUi.selections;
let sidebarTab: SidebarTab = initialUi.sidebarTab;
let libraryEpoch = 0;
let profileEpoch = 0;
let sidebarWidthPx = 360;
let workbenchSlotError: string | null = null;

let sidebarWidthStyleCaptured = false;
let previousSidebarWidthStyle = "";
let previousSidebarWidthPriority = "";

function persist(patch: Partial<ReturnType<typeof loadCreatorUiState>> = {}): void {
  const current = loadCreatorUiState(browserCreatorStorage());
  const mergedSelections = {
    ...current.selections,
    contentId: selections.contentId,
    knowledge: selections.knowledge,
  };
  saveCreatorUiState(browserCreatorStorage(), {
    ...current,
    ...patch,
    schemaVersion: 2,
    selections: mergedSelections,
    sidebarTab,
  });
  selections = mergedSelections;
}

function emitSelection(): void {
  for (const listener of selectionListeners) listener();
}

function emitChrome(): void {
  for (const listener of chromeListeners) listener();
}

export function subscribeSidebarChrome(listener: Listener): () => void {
  chromeListeners.add(listener);
  return () => { chromeListeners.delete(listener); };
}

export function setSidebarChromeWidth(px: number): void {
  if (sidebarWidthPx === px && (typeof document === "undefined" || sidebarWidthStyleCaptured)) return;
  sidebarWidthPx = px;
  if (typeof document !== "undefined") {
    if (!sidebarWidthStyleCaptured) {
      previousSidebarWidthStyle = document.documentElement.style.getPropertyValue("--oil-sidebar-width");
      previousSidebarWidthPriority = document.documentElement.style.getPropertyPriority("--oil-sidebar-width");
      sidebarWidthStyleCaptured = true;
    }
    document.documentElement.style.setProperty("--oil-sidebar-width", `${px}px`);
  }
  emitChrome();
}

export function releaseShellChrome(): void {
  if (typeof document !== "undefined" && sidebarWidthStyleCaptured) {
    if (previousSidebarWidthStyle === "") {
      document.documentElement.style.removeProperty("--oil-sidebar-width");
    } else {
      document.documentElement.style.setProperty(
        "--oil-sidebar-width",
        previousSidebarWidthStyle,
        previousSidebarWidthPriority,
      );
    }
  }
  sidebarWidthStyleCaptured = false;
  previousSidebarWidthStyle = "";
  previousSidebarWidthPriority = "";
}

export function getSidebarChromeWidth(): number {
  return sidebarWidthPx;
}

/** Subscribe React views to the current sidebar width. */
export function useSidebarChromeWidth(): number {
  const [width, setWidth] = useState(getSidebarChromeWidth);
  useEffect(() => subscribeSidebarChrome(() => { setWidth(getSidebarChromeWidth()); }), []);
  return width;
}

export function bumpLibrary(): void {
  libraryEpoch += 1;
  for (const listener of libraryListeners) listener();
}

export function getLibraryEpoch(): number {
  return libraryEpoch;
}

export function subscribeLibrary(listener: Listener): () => void {
  libraryListeners.add(listener);
  return () => { libraryListeners.delete(listener); };
}

export function useLibraryEpoch(): number {
  const [epoch, setEpoch] = useState(getLibraryEpoch);
  useEffect(() => subscribeLibrary(() => { setEpoch(getLibraryEpoch()); }), []);
  return epoch;
}

export function bumpProfile(): void {
  profileEpoch += 1;
  for (const listener of profileListeners) listener();
}

export function getProfileEpoch(): number {
  return profileEpoch;
}

export function subscribeProfile(listener: Listener): () => void {
  profileListeners.add(listener);
  return () => { profileListeners.delete(listener); };
}

export function useProfileEpoch(): number {
  const [epoch, setEpoch] = useState(getProfileEpoch);
  useEffect(() => subscribeProfile(() => { setEpoch(getProfileEpoch()); }), []);
  return epoch;
}

export function getSidebarTab(): SidebarTab {
  return sidebarTab;
}

export function setSidebarTab(tab: SidebarTab): void {
  if (sidebarTab === tab) return;
  sidebarTab = tab;
  persist();
  emitChrome();
  emitSelection();
}

export function useSidebarTab(): SidebarTab {
  const [tab, setTab] = useState(getSidebarTab);
  useEffect(() => subscribeSidebarChrome(() => { setTab(getSidebarTab()); }), []);
  return tab;
}

function encodedKnowledgeSelection(selection: KnowledgeSelection): string | null {
  if (selection === null) return null;
  return selection.kind === "page"
    ? `knowledge:${selection.locator}`
    : `knowledge-pending:${selection.id}`;
}

export function getFeatureSelections(): FeatureSelections {
  return selections;
}

export function getContentSelection(): string | null {
  return selections.contentId;
}

export function getKnowledgeSelection(): KnowledgeSelection {
  return selections.knowledge;
}

export function setContentSelection(id: string | null): void {
  if (selections.contentId === id) return;
  selections = { ...selections, contentId: id };
  persist();
  emitSelection();
}

export function setKnowledgeSelection(selection: KnowledgeSelection): void {
  const current = encodedKnowledgeSelection(selections.knowledge);
  const next = encodedKnowledgeSelection(selection);
  if (current === next) return;
  selections = { ...selections, knowledge: selection };
  persist();
  emitSelection();
}

/** Compatibility face used by existing content and knowledge views. */
export function getSelectedContentId(): string | null {
  if (sidebarTab === "content") return selections.contentId;
  if (sidebarTab === "knowledge") return encodedKnowledgeSelection(selections.knowledge);
  return null;
}

/** Route the legacy encoded id into the independent content or knowledge selection. */
export function setSelectedContentId(id: string | null): void {
  if (id !== null && id.startsWith("knowledge-pending:")) {
    setKnowledgeSelection({ kind: "pending", id: id.slice("knowledge-pending:".length) });
    return;
  }
  if (id !== null && id.startsWith("knowledge:")) {
    setKnowledgeSelection({ kind: "page", locator: id.slice("knowledge:".length) });
    return;
  }
  if (id === "knowledge-preview") {
    setKnowledgeSelection(null);
    return;
  }
  if (id === null && sidebarTab === "knowledge") {
    setKnowledgeSelection(null);
    return;
  }
  setContentSelection(id);
}

export function inspectorIsOpen(): boolean {
  return getSelectedContentId() !== null;
}

export function subscribeSelectedContentId(listener: Listener): () => void {
  selectionListeners.add(listener);
  return () => { selectionListeners.delete(listener); };
}

export const subscribeWorkbenchState = subscribeSelectedContentId;

export function useSelectedContentId(): [string | null, (id: string | null) => void] {
  const [selectedId, setSelectedId] = useState(getSelectedContentId);
  useEffect(() => subscribeSelectedContentId(() => { setSelectedId(getSelectedContentId()); }), []);
  return [selectedId, setSelectedContentId];
}

export function useFeatureSelections(): FeatureSelections {
  const [current, setCurrent] = useState(getFeatureSelections);
  useEffect(() => subscribeWorkbenchState(() => { setCurrent(getFeatureSelections()); }), []);
  return current;
}

export function getWorkbenchSlotError(): string | null {
  return workbenchSlotError;
}

export function setWorkbenchSlotError(error: string | null): void {
  if (workbenchSlotError === error) return;
  workbenchSlotError = error;
  for (const listener of statusListeners) listener();
}

export function useWorkbenchSlotError(): string | null {
  const [error, setError] = useState(getWorkbenchSlotError);
  useEffect(() => {
    statusListeners.add(setErrorFromStore);
    function setErrorFromStore(): void { setError(getWorkbenchSlotError()); }
    return () => { statusListeners.delete(setErrorFromStore); };
  }, []);
  return error;
}
