import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

import { describe, expect, it, vi } from "vitest";

import { openConfiguredObsidian } from "../src/obsidian.ts";

class FakeChild extends EventEmitter {
  readonly unref = vi.fn();
}

const executable = process.platform === "win32"
  ? "C:\\Apps\\Obsidian\\Obsidian.exe"
  : "/opt/obsidian/obsidian";
const uri = "obsidian://open?path=D%3A%5CMuzi%5Cmother-content.md";
const signal = (): AbortSignal => new AbortController().signal;

describe("configured Obsidian launcher", () => {
  it("launches the configured executable with the host-generated URI", async () => {
    const child = new FakeChild();
    const start = vi.fn((file: string, args: string[]) => {
      queueMicrotask(() => { child.emit("spawn"); });
      return child as unknown as ChildProcess;
    });

    await openConfiguredObsidian(executable, uri, signal(), {
      stat: async () => ({ isFile: () => true }),
      spawn: start,
    });

    expect(start).toHaveBeenCalledExactlyOnceWith(executable, [uri]);
    expect(child.unref).toHaveBeenCalledOnce();
  });

  it("fails before spawning when the executable is absent or invalid", async () => {
    await expect(openConfiguredObsidian("", uri, signal())).rejects.toThrow("尚未配置");
    await expect(openConfiguredObsidian("relative/Obsidian", uri, signal())).rejects.toThrow("绝对路径");
    await expect(openConfiguredObsidian(executable, uri, signal(), {
      stat: async () => ({ isFile: () => false }),
    })).rejects.toThrow("不是普通文件");
  });

  it("reports a native launch failure", async () => {
    const child = new FakeChild();
    const pending = openConfiguredObsidian(executable, uri, signal(), {
      stat: async () => ({ isFile: () => true }),
      spawn: () => {
        queueMicrotask(() => { child.emit("error", new Error("blocked")); });
        return child as unknown as ChildProcess;
      },
    });
    await expect(pending).rejects.toThrow("无法启动 Obsidian");
  });
});
