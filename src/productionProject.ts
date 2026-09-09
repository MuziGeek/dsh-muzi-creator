import { spawn } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";

/** The platform command used to reveal a directory without launching a bound file. */
export interface FolderOpenCommand {
  file: string;
  args: string[];
}

export type FolderOpenRunner = (command: FolderOpenCommand) => Promise<void>;

/** Resolve a production-project file or directory to its existing canonical local path. */
export async function resolveProductionProjectPath(path: string): Promise<string> {
  if (!isAbsolute(path)) throw new Error("生产工程路径必须是绝对路径");
  const resolved = await realpath(path).catch(() => undefined);
  if (resolved === undefined) throw new Error("生产工程路径不存在");
  const info = await stat(resolved).catch(() => undefined);
  if (info === undefined || (!info.isFile() && !info.isDirectory())) {
    throw new Error("生产工程必须是普通文件或目录");
  }
  return resolved;
}

/** Return the actual directory that contains a bound production project. */
export async function productionProjectFolder(path: string): Promise<string> {
  const resolved = await resolveProductionProjectPath(path);
  const info = await stat(resolved);
  return info.isDirectory() ? resolved : dirname(resolved);
}

/** Pick the native command that opens a directory on a supported desktop platform. */
export function folderOpenCommand(
  directory: string,
  platform: NodeJS.Platform = process.platform,
): FolderOpenCommand {
  if (platform === "darwin") return { file: "open", args: [directory] };
  if (platform === "win32") return { file: "explorer.exe", args: [directory] };
  return { file: "xdg-open", args: [directory] };
}

/** Run a native folder-reveal command. */
export function runFolderOpenCommand(command: FolderOpenCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command.file, command.args, { stdio: "ignore" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0 || code === null) resolve();
      else reject(new Error(`${command.file} failed: ${code}`));
    });
  });
}

/** Reveal the bound project's directory and never execute the bound project file itself. */
export async function openProductionProjectFolder(
  path: string,
  platform: NodeJS.Platform = process.platform,
  run: FolderOpenRunner = runFolderOpenCommand,
): Promise<string> {
  const directory = await productionProjectFolder(path);
  await run(folderOpenCommand(directory, platform));
  return directory;
}
