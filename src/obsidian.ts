import { spawn, type ChildProcess } from "node:child_process";
import type { Stats } from "node:fs";
import { stat } from "node:fs/promises";
import { isAbsolute } from "node:path";

import { expandHomePath } from "./config.ts";

export interface ObsidianLaunchInternals {
  stat?: (path: string) => Promise<Pick<Stats, "isFile">>;
  spawn?: (file: string, args: string[]) => ChildProcess;
}

function configuredExecutable(value: string | undefined): string {
  const executable = expandHomePath(value ?? "");
  if (executable === "") {
    throw new Error("尚未配置 Obsidian 可执行文件路径，请设置 obsidianExecutable 后重试");
  }
  if (!isAbsolute(executable)) {
    throw new Error("Obsidian 可执行文件必须使用绝对路径");
  }
  return executable;
}

/**
 * Launch the configured Obsidian application with one host-generated URI.
 * The browser supplies only a project id and document key; it never chooses
 * the executable or URI handed to the operating system.
 */
export async function openConfiguredObsidian(
  configured: string | undefined,
  uri: string,
  signal: AbortSignal,
  internals: ObsidianLaunchInternals = {},
): Promise<void> {
  const executable = configuredExecutable(configured);
  const info = await (internals.stat ?? stat)(executable).catch((cause: unknown) => {
    throw new Error(`Obsidian 可执行文件不可用：${executable}`, { cause });
  });
  if (!info.isFile()) throw new Error(`Obsidian 可执行文件不是普通文件：${executable}`);
  signal.throwIfAborted();

  await new Promise<void>((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = internals.spawn?.(executable, [uri])
        ?? spawn(executable, [uri], { detached: true, stdio: "ignore" });
    } catch (cause) {
      reject(new Error("无法启动 Obsidian", { cause }));
      return;
    }
    child.once("error", (cause) => {
      reject(new Error("无法启动 Obsidian", { cause }));
    });
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}
