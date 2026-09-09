import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  livePreviewRecord,
  loadPreviewRegistry,
  parsePreviewRegistry,
  previewRegistryPath,
  previewRegistryPathForDataDir,
  upsertPreviewRecord,
} from "../src/previewServers.ts";

describe("previewServers", () => {
  it("keeps the preview registry inside the configured data directory", () => {
    expect(previewRegistryPathForDataDir("/tmp/mz-data")).toBe(
      join("/tmp/mz-data", "preview-servers.json"),
    );
  });

  it("uses the shared data-directory resolver for the default registry", () => {
    const home = mkdtempSync(join(tmpdir(), "dsh-mz-preview-home-"));
    expect(previewRegistryPath(home)).toBe(join(home, ".dsh-mz-creator", "preview-servers.json"));

    const legacy = join(home, ".dsh-oil-creator");
    mkdirSync(legacy);
    const history = join(legacy, "preview-servers.json");
    writeFileSync(history, "[]\n", "utf8");
    expect(previewRegistryPath(home)).toBe(history);
  });

  it("keeps a live preview and drops a dead pid", () => {
    const file = join(mkdtempSync(join(tmpdir(), "mz-preview-")), "preview-servers.json");
    upsertPreviewRecord(file, {
      id: "alive",
      url: "http://127.0.0.1:9",
      port: 9,
      pid: process.pid,
      startedAt: 1,
    });
    upsertPreviewRecord(file, {
      id: "dead",
      url: "http://127.0.0.1:8",
      port: 8,
      pid: 99999999,
      startedAt: 1,
    });
    const rows = loadPreviewRegistry(file);
    expect(rows.some((row) => row.id === "alive")).toBe(true);
    expect(livePreviewRecord(rows, "dead")).toBeUndefined();
    expect(parsePreviewRegistry("nope")).toEqual([]);
  });
});
