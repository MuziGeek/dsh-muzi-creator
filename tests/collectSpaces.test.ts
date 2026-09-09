import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  LEGACY_COLLECT_SPACE,
  collectCleanupNames,
  collectRegistryPath,
  collectRegistryPathForDataDir,
  defaultCollectSpaceName,
  parseCollectRegistry,
  pidIsAlive,
  registerCollectSpace,
  unregisterCollectSpace,
} from "../src/collectSpaces.ts";

describe("collectSpaces", () => {
  it("keeps the collect registry inside the configured data directory", () => {
    expect(collectRegistryPathForDataDir("/tmp/mz-data")).toBe(
      join("/tmp/mz-data", "collect-spaces.json"),
    );
  });

  it("uses the shared data-directory resolver for the default registry", () => {
    const home = mkdtempSync(join(tmpdir(), "dsh-mz-collect-home-"));
    expect(collectRegistryPath(home)).toBe(join(home, ".dsh-mz-creator", "collect-spaces.json"));

    const legacy = join(home, ".dsh-oil-creator");
    mkdirSync(legacy);
    const history = join(legacy, "collect-spaces.json");
    writeFileSync(history, "[]\n", "utf8");
    expect(collectRegistryPath(home)).toBe(history);
  });

  it("builds a unique collect space name", () => {
    expect(defaultCollectSpaceName()).toMatch(/^mz-collect-[a-z0-9]+-[a-z0-9]+$/);
    expect(defaultCollectSpaceName()).not.toBe(defaultCollectSpaceName());
  });

  it("treats the current process as alive", () => {
    expect(pidIsAlive(process.pid)).toBe(true);
    expect(pidIsAlive(-1)).toBe(false);
  });

  it("registers live spaces and reports dead leftovers", () => {
    const file = join(mkdtempSync(join(tmpdir(), "mz-collect-spaces-")), "collect-spaces.json");
    writeFileSync(file, JSON.stringify([
      { name: "mz-collect-dead", pid: 99999999, startedAt: 1 },
      { name: "mz-collect-live", pid: process.pid, startedAt: 2 },
    ]));
    const stale = registerCollectSpace(file, { name: "mz-collect-now", pid: process.pid, startedAt: 3 });
    expect(stale).toEqual(["mz-collect-dead"]);
    unregisterCollectSpace(file, "mz-collect-now");
    const left = parseCollectRegistry(
      JSON.stringify([{ name: "mz-collect-live", pid: process.pid, startedAt: 2 }]),
    );
    expect(left).toHaveLength(1);
  });

  it("always includes the legacy shared collect name unless disabled", () => {
    expect(collectCleanupNames({ stale: ["mz-collect-dead"] })).toEqual([
      LEGACY_COLLECT_SPACE,
      "mz-collect-dead",
    ]);
    expect(collectCleanupNames({ extra: ["custom"], includeLegacy: false })).toEqual(["custom"]);
  });

  it("preserves legacy registry names so their working directories are cleaned up", () => {
    expect(parseCollectRegistry(JSON.stringify([
      { name: "oil-collect-history", pid: process.pid, startedAt: 1 },
    ]))).toEqual([
      { name: "oil-collect-history", pid: process.pid, startedAt: 1 },
    ]);
  });

  it("keeps every live row across sequential register calls", () => {
    const file = join(mkdtempSync(join(tmpdir(), "mz-collect-lock-")), "collect-spaces.json");
    const names = Array.from({ length: 8 }, (_, index) => `mz-collect-${index}`);
    for (const name of names) {
      registerCollectSpace(file, { name, pid: process.pid, startedAt: Date.now() });
    }
    const stored = JSON.parse(readFileSync(file, "utf8")) as Array<{ name: string }>;
    expect(stored.map((row) => row.name).sort()).toEqual([...names].sort());
    unregisterCollectSpace(file, "mz-collect-0");
    expect(JSON.parse(readFileSync(file, "utf8"))).toHaveLength(7);
  });
});
