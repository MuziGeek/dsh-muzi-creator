import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  inspirationItemSchema,
  inspirationRunSchema,
  inspirationTaskSchema,
} from "./inspirationSchemas.ts";
import type { InspirationItem, InspirationRun, InspirationTask } from "./inspirationTypes.ts";

/** Durable contents of the Creator inspiration ledger. */
export interface InspirationIndex {
  schemaVersion: 1;
  revision: number;
  items: Record<string, InspirationItem>;
  tasks: Record<string, InspirationTask>;
  runs: Record<string, InspirationRun>;
}

/** Return the sole durable ledger path below a Creator data directory. */
export function inspirationIndexPath(dataDir: string): string {
  return join(dataDir, "inspiration", "index.json");
}

/** Return a new empty ledger. */
export function emptyInspirationIndex(): InspirationIndex {
  return { schemaVersion: 1, revision: 0, items: {}, tasks: {}, runs: {} };
}

function decodeIndex(value: unknown): InspirationIndex {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("灵感研究台账根记录无效");
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== 1) throw new Error("不支持的灵感研究台账版本");
  if (!Number.isInteger(raw.revision) || (raw.revision as number) < 0) throw new Error("灵感研究台账 revision 无效");
  if (typeof raw.items !== "object" || raw.items === null || Array.isArray(raw.items)) throw new Error("灵感研究条目索引无效");
  if (typeof raw.tasks !== "object" || raw.tasks === null || Array.isArray(raw.tasks)) throw new Error("灵感研究任务索引无效");
  if (typeof raw.runs !== "object" || raw.runs === null || Array.isArray(raw.runs)) throw new Error("灵感研究运行索引无效");
  const result = { ...emptyInspirationIndex(), revision: raw.revision as number };
  for (const [id, item] of Object.entries(raw.items)) {
    const parsed = inspirationItemSchema.safeParse(item);
    if (!parsed.success || parsed.data.id !== id) throw new Error(`灵感研究条目无效：${id}`);
    result.items[id] = parsed.data as InspirationItem;
  }
  for (const [id, task] of Object.entries(raw.tasks)) {
    const parsed = inspirationTaskSchema.safeParse(task);
    if (!parsed.success || parsed.data.id !== id) throw new Error(`灵感研究任务无效：${id}`);
    result.tasks[id] = parsed.data as InspirationTask;
  }
  for (const [id, run] of Object.entries(raw.runs)) {
    const parsed = inspirationRunSchema.safeParse(run);
    if (!parsed.success || parsed.data.id !== id) throw new Error(`灵感研究运行无效：${id}`);
    result.runs[id] = parsed.data as InspirationRun;
  }
  return result;
}

function cloneIndex(index: InspirationIndex): InspirationIndex {
  return JSON.parse(JSON.stringify(index)) as InspirationIndex;
}

const tails = new Map<string, Promise<void>>();

/** Serialize ledger mutations for one data directory, including separate service instances. */
export function withInspirationLock<T>(dataDir: string, work: () => Promise<T>): Promise<T> {
  const previous = tails.get(dataDir) ?? Promise.resolve();
  const run = previous.then(work, work);
  tails.set(dataDir, run.then(() => undefined, () => undefined));
  return run;
}

/** Atomic, revisioned local persistence for the inspiration ledger. */
export class InspirationStore {
  private loaded: InspirationIndex | undefined;

  constructor(readonly dataDir: string) {}

  /** Load the ledger and turn a crash-left running attempt into an interrupted one. */
  async read(): Promise<InspirationIndex> {
    return withInspirationLock(this.dataDir, async () => {
      if (this.loaded === undefined) {
        this.loaded = await this.readDisk();
        let repaired = false;
        for (const run of Object.values(this.loaded.runs)) {
          if (run.status !== "running") continue;
          run.status = "interrupted";
          run.finishedAt = new Date().toISOString();
          run.error = { code: "HOST_RESTART", message: "Host restarted while this research run was active." };
          run.revision += 1;
          repaired = true;
        }
        if (repaired) {
          this.loaded.revision += 1;
          await this.persist(this.loaded);
        }
      }
      return cloneIndex(this.loaded);
    });
  }

  /** Make one atomic mutation and persist it before exposing its result. */
  async mutate<T>(work: (index: InspirationIndex) => T | Promise<T>): Promise<T> {
    return withInspirationLock(this.dataDir, async () => {
      if (this.loaded === undefined) {
        this.loaded = await this.readDisk();
        let repaired = false;
        for (const run of Object.values(this.loaded.runs)) {
          if (run.status !== "running") continue;
          run.status = "interrupted";
          run.finishedAt = new Date().toISOString();
          run.error = { code: "HOST_RESTART", message: "Host restarted while this research run was active." };
          run.revision += 1;
          repaired = true;
        }
        if (repaired) {
          this.loaded.revision += 1;
          await this.persist(this.loaded);
        }
      }
      const current = this.loaded!;
      const result = await work(current);
      current.revision += 1;
      await this.persist(current);
      return result;
    });
  }

  private async readDisk(): Promise<InspirationIndex> {
    try {
      return decodeIndex(JSON.parse(await readFile(inspirationIndexPath(this.dataDir), "utf8")) as unknown);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyInspirationIndex();
      throw new Error(`无法读取灵感研究台账：${String(error)}`, { cause: error });
    }
  }

  private async persist(index: InspirationIndex): Promise<void> {
    const path = inspirationIndexPath(this.dataDir);
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(index, null, 2)}\n`, "utf8");
    await rename(temporary, path);
  }
}
