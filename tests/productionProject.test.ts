import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { scanLibrary } from "../src/catalog.ts";
import { emptyOverlay, loadOverlay, saveOverlay } from "../src/overlay.ts";
import {
  folderOpenCommand,
  openProductionProjectFolder,
  productionProjectFolder,
  resolveProductionProjectPath,
  type FolderOpenCommand,
} from "../src/productionProject.ts";
import { MzCreatorService } from "../src/service.ts";
import { bindProductionProjectRequestSchema } from "../src/schemas.ts";
import { emptyBurn, emptyPublish } from "../src/publishStatus.ts";
import { registerCreatorTools } from "../src/tools.ts";
import type { ContentDetail, ContentSummary, OverlayItem } from "../src/types.ts";

describe("production project paths", () => {
  it("normalizes Chinese paths with spaces for both files and directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "mz-生产 工程-"));
    const directory = join(root, "剪辑 工程");
    const file = join(directory, "最终 成片.prproj");
    await mkdir(directory);
    await writeFile(file, "project");

    await expect(resolveProductionProjectPath(directory)).resolves.toBe(await realpath(directory));
    await expect(resolveProductionProjectPath(file)).resolves.toBe(await realpath(file));
    await expect(productionProjectFolder(file)).resolves.toBe(await realpath(directory));
    await expect(productionProjectFolder(directory)).resolves.toBe(await realpath(directory));
  });

  it("rejects relative and missing paths", async () => {
    await expect(resolveProductionProjectPath("relative/project.prproj")).rejects.toThrow("绝对路径");
    await expect(resolveProductionProjectPath(join(tmpdir(), "mz-production-project-missing")))
      .rejects.toThrow("不存在");
  });

  it("opens only the containing directory for a file on each supported platform", async () => {
    const root = await mkdtemp(join(tmpdir(), "mz-open-production-"));
    const file = join(root, "剪辑 工程.prproj");
    await writeFile(file, "project");
    const commands: FolderOpenCommand[] = [];

    await expect(openProductionProjectFolder(file, "win32", async (command) => {
      commands.push(command);
    })).resolves.toBe(await realpath(root));

    expect(commands).toEqual([{ file: "explorer.exe", args: [await realpath(root)] }]);
    expect(folderOpenCommand("/project", "darwin")).toEqual({ file: "open", args: ["/project"] });
    expect(folderOpenCommand("/project", "linux")).toEqual({ file: "xdg-open", args: ["/project"] });
  });
});

describe("production project catalog compatibility", () => {
  it("falls back only to a stored legacy studio binding, never a discovered folder", async () => {
    const root = await mkdtemp(join(tmpdir(), "mz-production-catalog-"));
    const id = "2026-09-07_中文 空格";
    const folder = join(root, id);
    const discoveredStudio = join(folder, "captured.screenstudio");
    await mkdir(discoveredStudio, { recursive: true });

    const legacy = emptyOverlay();
    legacy.items[id] = { studioPath: "D:\\legacy\\capture.screenstudio" };
    expect((await scanLibrary(root, legacy))[0]?.productionProjectPath).toBe("D:\\legacy\\capture.screenstudio");

    const explicit = emptyOverlay();
    explicit.items[id] = {
      productionProjectPath: "D:\\projects\\edit.prproj",
      studioPath: "D:\\legacy\\capture.screenstudio",
    };
    expect((await scanLibrary(root, explicit))[0]?.productionProjectPath).toBe("D:\\projects\\edit.prproj");

    const unbound = emptyOverlay();
    unbound.items[id] = { productionProjectPath: null };
    await saveOverlay(root, unbound);
    const afterRestart = await scanLibrary(root, await loadOverlay(root));
    expect(afterRestart[0]?.studioPath).toBeUndefined();
    expect(afterRestart[0]?.productionProjectPath).toBeUndefined();
  });

  it("clears the legacy fallback for both an explicit bind and unbind", async () => {
    const root = await mkdtemp(join(tmpdir(), "mz-production-bind-"));
    const file = join(root, "剪辑.prproj");
    await writeFile(file, "project");
    const item: OverlayItem = { studioPath: "D:\\legacy\\capture.screenstudio" };
    const service = Object.create(MzCreatorService.prototype) as MzCreatorService;
    const probe = service as unknown as {
      patchItem: (
        id: string,
        mutate: (next: OverlayItem) => void,
        signal: AbortSignal,
      ) => Promise<ContentDetail>;
    };
    probe.patchItem = async (_id, mutate) => {
      mutate(item);
      return {} as ContentDetail;
    };

    await service.bindProductionProject({ id: "demo", path: file }, new AbortController().signal);
    expect(item).toEqual({ productionProjectPath: await realpath(file) });

    await service.bindProductionProject({ id: "demo", path: null }, new AbortController().signal);
    expect(item).toEqual({ productionProjectPath: null });
    expect(bindProductionProjectRequestSchema.parse({ id: "demo", path: null })).toEqual({ id: "demo", path: null });
  });
});

describe("production project tools", () => {
  it("registers a nullable production path and rejects it beside studioPath", async () => {
    const tools: Array<{ name: string; parameters: { properties: Record<string, unknown> }; execute: (args: Record<string, unknown>, exec: { signal: AbortSignal }) => Promise<unknown> }> = [];
    const service = {
      bindProductionProject: vi.fn(async () => ({})),
      getContent: vi.fn(async () => ({})),
    };
    registerCreatorTools(
      { tools: { register: (tool) => { tools.push(tool as unknown as typeof tools[number]); } } },
      service as never,
    );
    const update = tools.find((tool) => tool.name === "mz_update_content");
    expect(update?.parameters.properties.productionProjectPath).toMatchObject({
      oneOf: [{ type: "string" }, { type: "null" }],
    });
    if (update === undefined) throw new Error("mz_update_content was not registered");

    await update.execute({ id: "demo", productionProjectPath: null }, { signal: new AbortController().signal });
    expect(service.bindProductionProject).toHaveBeenCalledWith(
      { id: "demo", path: null },
      expect.any(AbortSignal),
    );
    await expect(update.execute(
      { id: "demo", productionProjectPath: null, studioPath: "/tmp/capture.screenstudio" },
      { signal: new AbortController().signal },
    )).rejects.toThrow("cannot be sent together");
  });
});

function waitingItem(folderPath: string): ContentSummary {
  return {
    id: "2026-09-07_wait",
    folderPath,
    title: "等待导出",
    recordedAt: 1,
    createdMs: 1,
    covers: {},
    subtitles: {},
    hasPublishPackage: false,
    hasArticle: false,
    waitingForExport: false,
    tags: [],
    pipeline: "raw",
    workflow: "idle",
    publish: emptyPublish(),
    burn: emptyBurn(),
    subtitleJob: emptyBurn(),
    coverJob: emptyBurn(),
  };
}

describe("export waiters", () => {
  it("marks a timeout, then clears that error when a retry starts", async () => {
    const folder = await mkdtemp(join(tmpdir(), "mz-production-retry-"));
    const stored: OverlayItem = {};
    const summary = waitingItem(folder);
    const service = Object.create(MzCreatorService.prototype) as MzCreatorService;
    const probe = service as unknown as {
      exportWaiters: Map<string, AbortController>;
      find: (id: string) => Promise<ContentSummary | undefined>;
      patchItem: (
        id: string,
        mutate: (next: OverlayItem) => void,
        signal: AbortSignal,
      ) => Promise<ContentDetail>;
    };
    probe.exportWaiters = new Map();
    probe.find = async (id) => id === summary.id ? summary : undefined;
    probe.patchItem = async (_id, mutate) => {
      mutate(stored);
      return { ...summary, ...stored } as ContentDetail;
    };
    const signal = new AbortController().signal;

    await service.waitForExport({ id: summary.id, timeoutMs: 0 }, signal);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(stored).toMatchObject({ waitingForExport: true, exportTimedOut: true });

    await service.waitForExport({ id: summary.id, timeoutMs: 60_000 }, signal);
    expect(stored.waitingForExport).toBe(true);
    expect(stored.exportTimedOut).toBeUndefined();
    await service.cancelWaitForExport({ id: summary.id }, signal);
  });

  it("enters finish with an existing MOV and no bound production project", async () => {
    const root = await mkdtemp(join(tmpdir(), "mz-production-existing-mov-"));
    const folder = join(root, "2026-09-07_已有成片");
    const video = join(folder, "export.mov");
    await mkdir(folder);
    await writeFile(video, "movie");

    const item = (await scanLibrary(root, emptyOverlay()))[0];
    expect(item).toMatchObject({
      videoRaw: video,
      workflow: "finish",
    });
    expect(item?.productionProjectPath).toBeUndefined();
    expect(item?.studioPath).toBeUndefined();
  });

  it("finishes an unbound wait when a new stable MP4 appears", async () => {
    const folder = await mkdtemp(join(tmpdir(), "mz-production-stable-export-"));
    const stored: OverlayItem = {};
    const summary = waitingItem(folder);
    const service = Object.create(MzCreatorService.prototype) as MzCreatorService;
    const probe = service as unknown as {
      exportWaiters: Map<string, AbortController>;
      find: (id: string) => Promise<ContentSummary | undefined>;
      patchItem: (
        id: string,
        mutate: (next: OverlayItem) => void,
        signal: AbortSignal,
      ) => Promise<ContentDetail>;
    };
    probe.exportWaiters = new Map();
    probe.find = async (id) => id === summary.id ? summary : undefined;
    probe.patchItem = async (_id, mutate) => {
      mutate(stored);
      return { ...summary, ...stored } as ContentDetail;
    };

    await service.waitForExport({ id: summary.id, timeoutMs: 15_000 }, new AbortController().signal);
    await writeFile(join(folder, "new-export.mp4"), "movie");
    await new Promise((resolve) => setTimeout(resolve, 10_500));

    expect(stored.waitingForExport).toBeUndefined();
    expect(stored.exportTimedOut).toBeUndefined();
    expect(probe.exportWaiters.has(summary.id)).toBe(false);
  }, 15_000);

  it("keeps a replacement waiter and cancellation clears only this item's wait state", async () => {
    const folder = await mkdtemp(join(tmpdir(), "mz-production-wait-"));
    const stored: OverlayItem = {};
    const summary = waitingItem(folder);
    const service = Object.create(MzCreatorService.prototype) as MzCreatorService;
    const probe = service as unknown as {
      exportWaiters: Map<string, AbortController>;
      find: (id: string) => Promise<ContentSummary | undefined>;
      patchItem: (
        id: string,
        mutate: (next: OverlayItem) => void,
        signal: AbortSignal,
      ) => Promise<ContentDetail>;
    };
    probe.exportWaiters = new Map();
    probe.find = async (id) => id === summary.id ? summary : undefined;
    probe.patchItem = async (_id, mutate) => {
      mutate(stored);
      return { ...summary, ...stored } as ContentDetail;
    };
    const signal = new AbortController().signal;

    await service.waitForExport({ id: summary.id, timeoutMs: 60_000 }, signal);
    const first = probe.exportWaiters.get(summary.id);
    await service.waitForExport({ id: summary.id, timeoutMs: 60_000 }, signal);
    const second = probe.exportWaiters.get(summary.id);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
    expect(probe.exportWaiters.get(summary.id)).toBe(second);

    await service.cancelWaitForExport({ id: summary.id }, signal);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(probe.exportWaiters.has(summary.id)).toBe(false);
    expect(stored.waitingForExport).toBeUndefined();
  });
});

describe("Screen Studio platform boundary", () => {
  it.skipIf(process.platform === "darwin")("rejects opening Screen Studio outside macOS", async () => {
    const summary = { ...waitingItem("/tmp"), studioPath: "/tmp/capture.screenstudio" };
    const service = Object.create(MzCreatorService.prototype) as MzCreatorService;
    const probe = service as unknown as { find: () => Promise<ContentSummary> };
    probe.find = async () => summary;

    await expect(service.openStudio({ id: summary.id }, new AbortController().signal))
      .rejects.toThrow("only supported on macOS");
  });
});
