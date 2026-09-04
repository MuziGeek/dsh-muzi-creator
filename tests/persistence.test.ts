import { describe, expect, it } from "vitest";

import {
  CREATOR_STORAGE_KEY,
  DEFAULT_UI_STATE,
  LEGACY_CREATOR_STORAGE_KEY,
  loadCreatorUiState,
  saveCreatorUiState,
  type CreatorStorage,
} from "../src/client/persistence.ts";

function memoryStorage(seed: Record<string, string> = {}): CreatorStorage {
  const data = { ...seed };
  return {
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => { data[key] = value; },
  };
}

describe("loadCreatorUiState", () => {
  it("returns isolated schema 3 defaults when storage is absent or broken", () => {
    expect(loadCreatorUiState(undefined)).toEqual(DEFAULT_UI_STATE);
    expect(loadCreatorUiState(memoryStorage({ [CREATOR_STORAGE_KEY]: "{" }))).toEqual(DEFAULT_UI_STATE);
  });

  it("migrates a legacy content selection and discards inspector width", () => {
    const storage = memoryStorage({
      [LEGACY_CREATOR_STORAGE_KEY]: JSON.stringify({
        schemaVersion: 1,
        selectedId: "2026-01-23_demo",
        filter: "cover",
        query: "harness",
        sidebarTab: "content",
        inspectorWidth: 720,
      }),
    });
    expect(loadCreatorUiState(storage)).toEqual({
      schemaVersion: 3,
      selections: {
        hotId: null,
        inspiration: null,
        contentId: "2026-01-23_demo",
        knowledge: null,
        project: null,
      },
      filter: "cover",
      query: "harness",
      sidebarTab: "content",
    });
  });

  it("migrates legacy knowledge details and maps knowledge-preview to the overview", () => {
    const page = memoryStorage({
      [LEGACY_CREATOR_STORAGE_KEY]: JSON.stringify({
        schemaVersion: 1,
        selectedId: "knowledge:atlas://wiki/topics/testing.md",
        sidebarTab: "knowledge",
      }),
    });
    expect(loadCreatorUiState(page).selections.knowledge).toEqual({
      kind: "page",
      locator: "atlas://wiki/topics/testing.md",
    });

    const overview = memoryStorage({
      [LEGACY_CREATOR_STORAGE_KEY]: JSON.stringify({
        schemaVersion: 1,
        selectedId: "knowledge-preview",
        sidebarTab: "knowledge",
      }),
    });
    expect(loadCreatorUiState(overview).selections.knowledge).toBeNull();
  });

  it("migrates all independent schema 2 selections and initializes inspiration", () => {
    const storage = memoryStorage({
      [LEGACY_CREATOR_STORAGE_KEY]: JSON.stringify({
        schemaVersion: 2,
        selections: {
          hotId: "hot-1",
          contentId: "content-1",
          knowledge: { kind: "pending", id: "pk_1" },
          project: { projectId: "project-1", taskKey: "task-1" },
        },
        filter: "article",
        query: "muzi",
        sidebarTab: "projects",
      }),
    });
    expect(loadCreatorUiState(storage)).toEqual({
      schemaVersion: 3,
      selections: {
        hotId: "hot-1",
        inspiration: null,
        contentId: "content-1",
        knowledge: { kind: "pending", id: "pk_1" },
        project: { projectId: "project-1", taskKey: "task-1" },
      },
      filter: "article",
      query: "muzi",
      sidebarTab: "projects",
    });
  });

  it("sanitizes unknown fields without losing the selected feature", () => {
    const storage = memoryStorage({
      [CREATOR_STORAGE_KEY]: JSON.stringify({
        schemaVersion: 3,
        selections: { hotId: 1, inspiration: { kind: "other" }, contentId: false, knowledge: { kind: "other" }, project: {} },
        filter: "published",
        query: null,
        sidebarTab: "hot",
      }),
    });
    expect(loadCreatorUiState(storage)).toEqual({ ...DEFAULT_UI_STATE, sidebarTab: "hot" });
  });
});

describe("saveCreatorUiState", () => {
  it("round-trips schema 3 with an independent inspiration selection", () => {
    const storage = memoryStorage();
    const state = {
      schemaVersion: 3 as const,
      selections: {
        hotId: "hot-2",
        inspiration: { kind: "task" as const, id: "it_task", runId: "ir_run" },
        contentId: "demo",
        knowledge: { kind: "page" as const, locator: "atlas://wiki/topics/demo.md" },
        project: null,
      },
      filter: "subtitle" as const,
      query: "油",
      sidebarTab: "content" as const,
    };
    expect(saveCreatorUiState(storage, state)).toBe(true);
    expect(loadCreatorUiState(storage)).toEqual(state);
  });
});
