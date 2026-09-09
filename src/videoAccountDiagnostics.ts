import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

/** Resolve the same private registry used by the account subprocess.
 * @returns Absolute registry path after environment overrides.
 */
export function videoAccountConfigPath(): string {
  return process.env.VIDEO_PUBLISHER_CONFIG ? resolve(process.env.VIDEO_PUBLISHER_CONFIG)
    : join(process.env.XDG_CONFIG_HOME ? resolve(process.env.XDG_CONFIG_HOME) : join(homedir(), ".config"), "video-publisher", "config.json");
}

/** Record local operational fields only; never pass request bodies, page text, or credentials.
 * @param event Operation stage.
 * @param fields Non-sensitive identifiers, paths, counts and states.
 */
export function recordVideoAccountTrace(event: string, fields: Record<string, string | number | boolean | null>): void {
  const file = join(dirname(videoAccountConfigPath()), "account-diagnostics.jsonl");
  try {
    mkdirSync(dirname(file), { recursive: true });
    if (existsSync(file) && statSync(file).size > 1_048_576) renameSync(file, file + ".previous");
    appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), layer: "plugin", event, pid: process.pid, ...fields }) + "\n", { mode: 0o600 });
  } catch { /* Diagnostic I/O must not change account operation outcomes. */ }
}
