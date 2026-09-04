import { useSyncExternalStore } from "react";

import type { DailyHotResult } from "../../dailyHotTypes.ts";
import type { InspirationOverview } from "../../inspirationTypes.ts";
import type { KnowledgePreviewResult, MuziProjectListResult } from "../../muziTypes.ts";
import type { TrellisProjectListResult } from "../../trellisTypes.ts";
import type { DailyHotViewFace, InspirationViewFace, MuziViewFace, TrellisViewFace } from "../face.ts";

export interface ResourceSnapshot<T> {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
}

type Listener = () => void;

/** A last-good, single-flight read cache shared by the sidebar and central workbench. */
export class ReadonlyResource<T> {
  private snapshot: ResourceSnapshot<T> = {
    data: null,
    loading: false,
    refreshing: false,
    error: null,
  };
  private readonly listeners = new Set<Listener>();
  private inFlight: Promise<T> | null = null;

  constructor(private readonly loader: (force: boolean) => Promise<T>) {}

  readonly getSnapshot = (): ResourceSnapshot<T> => this.snapshot;

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish(patch: Partial<ResourceSnapshot<T>>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  /** Read once, or force a refresh while retaining the last successful value. */
  load(force = false): Promise<T> {
    if (!force && this.snapshot.data !== null) return Promise.resolve(this.snapshot.data);
    if (this.inFlight !== null) return this.inFlight;
    const hasData = this.snapshot.data !== null;
    this.publish({ loading: !hasData, refreshing: hasData, error: null });
    const request = this.loader(force).then((data) => {
      this.publish({ data, loading: false, refreshing: false, error: null });
      return data;
    }, (cause: unknown) => {
      this.publish({
        loading: false,
        refreshing: false,
        error: cause instanceof Error ? cause.message : String(cause),
      });
      throw cause;
    }).finally(() => {
      if (this.inFlight === request) this.inFlight = null;
    });
    this.inFlight = request;
    return request;
  }
}

export interface WorkbenchResources {
  hot: ReadonlyResource<DailyHotResult>;
  inspiration: ReadonlyResource<InspirationOverview>;
  content: ReadonlyResource<MuziProjectListResult>;
  knowledge: ReadonlyResource<KnowledgePreviewResult>;
  projects: ReadonlyResource<TrellisProjectListResult>;
}

/** Build the independent read controllers shared by sidebar and central surfaces. */
export function createWorkbenchResources(
  hotFace: DailyHotViewFace,
  inspirationFace: InspirationViewFace,
  muziFace: MuziViewFace,
  trellisFace: TrellisViewFace,
): WorkbenchResources {
  return {
    hot: new ReadonlyResource(async (force) => {
      if (!hotFace.ready()) throw new Error("热点数据正在连接");
      return hotFace.getDailyHot(force);
    }),
    inspiration: new ReadonlyResource(async () => {
      if (!inspirationFace.ready()) throw new Error("灵感服务正在连接");
      return inspirationFace.list();
    }),
    content: new ReadonlyResource(async () => {
      if (!muziFace.ready()) throw new Error("内容数据正在连接");
      return muziFace.listProjects("", false);
    }),
    knowledge: new ReadonlyResource(async () => {
      if (!muziFace.ready()) throw new Error("知识库正在连接");
      return muziFace.getKnowledgePreview();
    }),
    projects: new ReadonlyResource(async () => {
      if (!trellisFace.ready()) throw new Error("项目数据正在连接");
      return trellisFace.listProjects();
    }),
  };
}

/** Subscribe a React surface to one read controller. */
export function useResourceSnapshot<T>(resource: ReadonlyResource<T>): ResourceSnapshot<T> {
  return useSyncExternalStore(resource.subscribe, resource.getSnapshot, resource.getSnapshot);
}
