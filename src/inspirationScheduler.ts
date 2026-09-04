import type { InspirationTask } from "./inspirationTypes.ts";

/** The only timezone accepted by the current daily research scheduler. */
export const INSPIRATION_TIME_ZONE = "Asia/Shanghai";

function dayAt(time: string, date: Date): Date {
  const [hour, minute] = time.split(":").map(Number) as [number, number];
  // Asia/Shanghai has no daylight-saving transition; its offset is UTC+08:00.
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour - 8, minute));
}

/** Return the latest scheduled instant that is not in the future. */
export function latestDailyOccurrence(task: Pick<InspirationTask, "dailyTime" | "timeZone">, now: Date): Date {
  if (task.timeZone !== INSPIRATION_TIME_ZONE) throw new Error("灵感定时任务目前只支持 Asia/Shanghai");
  const shanghai = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const candidate = dayAt(task.dailyTime, shanghai);
  return candidate.getTime() > now.getTime()
    ? new Date(candidate.getTime() - 24 * 60 * 60 * 1000)
    : candidate;
}

/** Return the next daily instant strictly after now. */
export function nextDailyOccurrence(task: Pick<InspirationTask, "dailyTime" | "timeZone">, now: Date): Date {
  const latest = latestDailyOccurrence(task, now);
  return latest.getTime() <= now.getTime() ? new Date(latest.getTime() + 24 * 60 * 60 * 1000) : latest;
}

/** Minimal scheduler seam: the service owns durable deduplication and execution. */
export interface InspirationScheduleTarget {
  listEnabledTasks(): Promise<InspirationTask[]>;
  enqueueScheduled(task: InspirationTask, scheduledFor: Date, trigger: "scheduled" | "catch-up"): Promise<void>;
}

/** Daily Asia/Shanghai scheduler which only catches up the single latest missed instant. */
export class InspirationScheduler {
  private timer: NodeJS.Timeout | undefined;
  private started = false;

  constructor(private readonly target: InspirationScheduleTarget, private readonly now: () => Date = () => new Date()) {}

  /** Start polling and perform the bounded startup catch-up once. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.tick(true);
    this.timer = setInterval(() => { void this.tick(false); }, 60_000);
    this.timer.unref?.();
  }

  /** Stop scheduling without changing any task authorization. */
  stop(): void {
    this.started = false;
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Evaluate all enabled tasks once. Exported for deterministic unit tests. */
  async tick(startup: boolean): Promise<void> {
    const now = this.now();
    for (const task of await this.target.listEnabledTasks()) {
      const latest = latestDailyOccurrence(task, now);
      const next = task.nextRunAt === null ? null : new Date(task.nextRunAt);
      if (startup && (next === null || next.getTime() <= now.getTime())) {
        await this.target.enqueueScheduled(task, latest, "catch-up");
      } else if (!startup && latest.getTime() <= now.getTime() && (next === null || next.getTime() <= latest.getTime())) {
        await this.target.enqueueScheduled(task, latest, "scheduled");
      }
    }
  }
}
