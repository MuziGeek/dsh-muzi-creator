import type { ContentFilter } from "../types.ts";

export const CREATOR_STORAGE_KEY = "dsh-muzi-creator/ui/v3";
export const LEGACY_CREATOR_STORAGE_KEY = "dsh-muzi-creator/ui/v2";

export type SidebarTab = "sessions" | "hot" | "inspiration" | "content" | "knowledge" | "projects";

export type KnowledgeSelection =
  | { kind: "page"; locator: string }
  | { kind: "pending"; id: string }
  | null;

export type InspirationSelection =
  | { kind: "item"; id: string; runId?: string }
  | { kind: "task"; id: string; runId?: string }
  | null;

export interface FeatureSelections {
  hotId: string | null;
  inspiration: InspirationSelection;
  contentId: string | null;
  knowledge: KnowledgeSelection;
  project: { projectId: string; taskKey?: string } | null;
}

export interface CreatorUiState {
  schemaVersion: 3;
  selections: FeatureSelections;
  filter: ContentFilter;
  query: string;
  sidebarTab: SidebarTab;
}

export const DEFAULT_SELECTIONS: FeatureSelections = {
  hotId: null,
  inspiration: null,
  contentId: null,
  knowledge: null,
  project: null,
};

export const DEFAULT_UI_STATE: CreatorUiState = {
  schemaVersion: 3,
  selections: { ...DEFAULT_SELECTIONS },
  filter: "all",
  query: "",
  sidebarTab: "sessions",
};

export interface CreatorStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export function browserCreatorStorage(): CreatorStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSidebarTab(value: unknown): SidebarTab {
  return value === "hot" || value === "inspiration" || value === "content" || value === "knowledge" || value === "projects"
    ? value
    : "sessions";
}

function parseInspirationSelection(value: unknown): InspirationSelection {
  if (!isRecord(value) || (value.kind !== "item" && value.kind !== "task")) return null;
  if (typeof value.id !== "string" || value.id === "") return null;
  return {
    kind: value.kind,
    id: value.id,
    ...(typeof value.runId === "string" && value.runId !== "" ? { runId: value.runId } : {}),
  };
}

function parseFilter(value: unknown): ContentFilter {
  return value === "cover" || value === "subtitle" || value === "article" ? value : "all";
}

function parseKnowledgeSelection(value: unknown): KnowledgeSelection {
  if (!isRecord(value)) return null;
  if (value.kind === "page" && typeof value.locator === "string" && value.locator !== "") {
    return { kind: "page", locator: value.locator };
  }
  if (value.kind === "pending" && typeof value.id === "string" && value.id !== "") {
    return { kind: "pending", id: value.id };
  }
  return null;
}

function parseSelections(value: unknown): FeatureSelections {
  if (!isRecord(value)) return { ...DEFAULT_SELECTIONS };
  const project = isRecord(value.project) && typeof value.project.projectId === "string" && value.project.projectId !== ""
    ? {
        projectId: value.project.projectId,
        ...(typeof value.project.taskKey === "string" && value.project.taskKey !== ""
          ? { taskKey: value.project.taskKey }
          : {}),
      }
    : null;
  return {
    hotId: typeof value.hotId === "string" && value.hotId !== "" ? value.hotId : null,
    inspiration: parseInspirationSelection(value.inspiration),
    contentId: typeof value.contentId === "string" && value.contentId !== "" ? value.contentId : null,
    knowledge: parseKnowledgeSelection(value.knowledge),
    project,
  };
}

function migrateLegacySelection(value: unknown): Pick<FeatureSelections, "contentId" | "knowledge"> {
  if (typeof value !== "string" || value === "" || value === "knowledge-preview") {
    return { contentId: null, knowledge: null };
  }
  if (value.startsWith("knowledge-pending:")) {
    const id = value.slice("knowledge-pending:".length);
    return { contentId: null, knowledge: id === "" ? null : { kind: "pending", id } };
  }
  if (value.startsWith("knowledge:")) {
    const locator = value.slice("knowledge:".length);
    return { contentId: null, knowledge: locator === "" ? null : { kind: "page", locator } };
  }
  return { contentId: value, knowledge: null };
}

/** Load schema 3 or migrate prior selection schemas without retaining inspector geometry. */
export function loadCreatorUiState(storage: CreatorStorage | undefined): CreatorUiState {
  if (storage === undefined) return { ...DEFAULT_UI_STATE, selections: { ...DEFAULT_SELECTIONS } };
  try {
    const currentRaw = storage.getItem(CREATOR_STORAGE_KEY);
    const raw = currentRaw ?? storage.getItem(LEGACY_CREATOR_STORAGE_KEY);
    if (raw === null) return { ...DEFAULT_UI_STATE, selections: { ...DEFAULT_SELECTIONS } };
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return { ...DEFAULT_UI_STATE, selections: { ...DEFAULT_SELECTIONS } };
    const sidebarTab = parseSidebarTab(parsed.sidebarTab);
    const common = {
      schemaVersion: 3 as const,
      filter: parseFilter(parsed.filter),
      query: typeof parsed.query === "string" ? parsed.query : "",
      sidebarTab,
    };
    if (parsed.schemaVersion === 3 || parsed.schemaVersion === 2) {
      return { ...common, selections: parseSelections(parsed.selections) };
    }
    const legacy = migrateLegacySelection(parsed.selectedId);
    return {
      ...common,
      selections: { ...DEFAULT_SELECTIONS, ...legacy },
    };
  } catch {
    return { ...DEFAULT_UI_STATE, selections: { ...DEFAULT_SELECTIONS } };
  }
}

export function saveCreatorUiState(
  storage: CreatorStorage | undefined,
  state: CreatorUiState,
): boolean {
  if (storage === undefined) return false;
  try {
    storage.setItem(CREATOR_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
