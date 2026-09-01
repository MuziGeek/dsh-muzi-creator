import { useEffect, useState } from "react";

import {
  browserCreatorStorage,
  loadCreatorUiState,
  saveCreatorUiState,
  type SidebarTab,
} from "./persistence.ts";
import {
  clampInspectorPreference,
  INSPECTOR_DEFAULT,
  INSPECTOR_MAX,
  INSPECTOR_MIN,
} from "./inspectorLayout.ts";

export { INSPECTOR_DEFAULT, INSPECTOR_MAX, INSPECTOR_MIN } from "./inspectorLayout.ts";

type Listener = () => void;

const listeners = new Set<Listener>();
const libraryListeners = new Set<Listener>();
const profileListeners = new Set<Listener>();
const initialUi = loadCreatorUiState(browserCreatorStorage());
let selectedId = initialUi.selectedId;
let sidebarTab: SidebarTab = initialUi.sidebarTab;
let libraryEpoch = 0;
let profileEpoch = 0;
let sidebarWidthPx = 360;
let inspectorWidthPx = clampInspectorPreference(initialUi.inspectorWidth ?? INSPECTOR_DEFAULT);

const chromeListeners = new Set<Listener>();

let sidebarWidthStyleCaptured = false;
let previousSidebarWidthStyle = "";
let previousSidebarWidthPriority = "";

function emitChrome(): void {
  for (const listener of chromeListeners) listener();
}

export function subscribeSidebarChrome(listener: Listener): () => void {
  chromeListeners.add(listener);
  return () => {
    chromeListeners.delete(listener);
  };
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
  if (typeof document !== "undefined") {
    if (sidebarWidthStyleCaptured) {
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
  useEffect(() => subscribeSidebarChrome(() => {
    setWidth(getSidebarChromeWidth());
  }), []);
  return width;
}

export function setInspectorWidth(px: number): void {
  const next = clampInspectorPreference(px);
  if (inspectorWidthPx === next) return;
  inspectorWidthPx = next;
  const state = loadCreatorUiState(browserCreatorStorage());
  saveCreatorUiState(browserCreatorStorage(), { ...state, inspectorWidth: next });
}

export function getInspectorWidth(): number {
  return inspectorWidthPx;
}

function emit(): void {
  for (const listener of listeners) listener();
}

function emitLibrary(): void {
  for (const listener of libraryListeners) listener();
}

export function bumpLibrary(): void {
  libraryEpoch += 1;
  emitLibrary();
}

export function getLibraryEpoch(): number {
  return libraryEpoch;
}

export function subscribeLibrary(listener: Listener): () => void {
  libraryListeners.add(listener);
  return () => {
    libraryListeners.delete(listener);
  };
}

export function useLibraryEpoch(): number {
  const [epoch, setEpoch] = useState(getLibraryEpoch);
  useEffect(() => subscribeLibrary(() => {
    setEpoch(getLibraryEpoch());
  }), []);
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
  return () => {
    profileListeners.delete(listener);
  };
}

export function useProfileEpoch(): number {
  const [epoch, setEpoch] = useState(getProfileEpoch);
  useEffect(() => subscribeProfile(() => {
    setEpoch(getProfileEpoch());
  }), []);
  return epoch;
}

export function getSidebarTab(): SidebarTab {
  return sidebarTab;
}

export function setSidebarTab(tab: SidebarTab): void {
  if (sidebarTab === tab) return;
  sidebarTab = tab;
  const state = loadCreatorUiState(browserCreatorStorage());
  saveCreatorUiState(browserCreatorStorage(), { ...state, sidebarTab });
  emitChrome();
}

export function useSidebarTab(): SidebarTab {
  const [tab, setTab] = useState(getSidebarTab);
  useEffect(() => subscribeSidebarChrome(() => {
    setTab(getSidebarTab());
  }), []);
  return tab;
}

export function inspectorIsOpen(): boolean {
  return selectedId !== null;
}

export function getSelectedContentId(): string | null {
  return selectedId;
}

export function setSelectedContentId(id: string | null): void {
  if (selectedId === id) return;
  selectedId = id;
  const state = loadCreatorUiState(browserCreatorStorage());
  saveCreatorUiState(browserCreatorStorage(), { ...state, selectedId });
  emit();
}

export function subscribeSelectedContentId(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSelectedContentId(): [string | null, (id: string | null) => void] {
  const [selectedId, setSelectedId] = useState(getSelectedContentId);
  useEffect(() => subscribeSelectedContentId(() => {
    setSelectedId(getSelectedContentId());
  }), []);
  return [selectedId, setSelectedContentId];
}
