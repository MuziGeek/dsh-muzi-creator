import { formatContentRef } from "../contentRef.ts";
import type { ContentDetail } from "../types.ts";
import type { KnowledgePageSummary, MuziProjectDetail, PendingKnowledgeReference } from "../muziTypes.ts";
import { getSelectedContentId, subscribeSelectedContentId } from "./contentSelection.ts";

interface TriggerCandidate {
  name: string;
  description?: string;
}

interface TriggerPick {
  candidate: TriggerCandidate;
}

type PickOutcome = { insert: {
  source: string;
  ref: string;
  label: string;
  clipboardText: string;
} } | { text: string } | undefined;

interface TriggerSource {
  trigger: "@" | "/";
  name: string;
  order?: number;
  candidates: (
    session: unknown,
    req: { query: string; signal: AbortSignal },
  ) => Promise<readonly TriggerCandidate[]>;
  onPick: (pick: TriggerPick) => PickOutcome;
  lexicon?: () => readonly string[] | undefined;
  subscribeLexicon?: (_session: unknown, listener: () => void) => () => void;
  codec?: {
    clipboardText: (ref: string) => string;
    serialize: (ref: string, signal: AbortSignal) => Promise<string>;
  };
}

interface TriggerService {
  registerSource: (src: TriggerSource) => () => void;
}

/** Composer chips occupy a fixed 4em cell; longer labels are centered and clipped. */
const CHIP_UNITS = 8;

function charUnits(ch: string): number {
  return /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? 2 : 1;
}

export function chipLabel(title: string): string {
  const chars = [...title.trim()];
  if (chars.length === 0) return "内容";
  let used = 0;
  const out: string[] = [];
  for (const ch of chars) {
    const w = charUnits(ch);
    if (used + w > CHIP_UNITS) {
      while (used > CHIP_UNITS - 1 && out.length > 0) {
        used -= charUnits(out[out.length - 1] ?? "");
        out.pop();
      }
      while (out.length > 0 && out[out.length - 1] === " ") {
        used -= 1;
        out.pop();
      }
      out.push("…");
      return out.join("");
    }
    out.push(ch);
    used += w;
  }
  return out.join("");
}

export function registerContentTriggers(
  inputTriggers: TriggerService | undefined,
  load: (id: string) => Promise<ContentDetail>,
  list: () => Promise<ReadonlyArray<{ id: string; title: string }>>,
): () => void {
  if (inputTriggers === undefined) return () => undefined;

  const serialize = async (ref: string): Promise<string> => {
    const id = ref === "current" ? getSelectedContentId() : ref;
    if (id === null || id === "") return "当前没有打开的内容。用 @ 选一条，或先在左侧打开详情。";
    return formatContentRef(await load(id));
  };

  const insert = (ref: string, title: string): PickOutcome => ({
    insert: {
      source: "oil",
      ref,
      label: chipLabel(title),
      clipboardText: `@${title}`,
    },
  });

  const atSource: TriggerSource = {
    trigger: "@",
    name: "oil",
    order: 30,
    async candidates(_session, req) {
      const query = req.query.trim().toLowerCase();
      const items = await list();
      const rows: TriggerCandidate[] = [];
      const selected = getSelectedContentId();
      if (selected !== null && ("当前".includes(query) || query === "")) {
        const current = items.find((item) => item.id === selected);
        rows.push({
          name: "当前详情",
          description: current?.title ?? selected,
        });
      }
      for (const item of items) {
        if (query !== "" && !item.title.toLowerCase().includes(query) && !item.id.toLowerCase().includes(query)) {
          continue;
        }
        rows.push({ name: item.title, description: item.id });
      }
      return rows.slice(0, 20);
    },
    onPick({ candidate }) {
      if (candidate.name === "当前详情") return insert("current", "当前详情");
      return insert(candidate.description ?? candidate.name, candidate.name);
    },
    lexicon() {
      return ["当前详情"];
    },
    subscribeLexicon(_session, listener) {
      return subscribeSelectedContentId(listener);
    },
    codec: {
      clipboardText: (ref) => (ref === "current" ? "@当前详情" : `@${ref}`),
      serialize,
    },
  };

  const slashSource: TriggerSource = {
    trigger: "/",
    name: "oil",
    order: 40,
    async candidates(_session, req) {
      const query = req.query.trim().toLowerCase();
      const name = "current content";
      if (query !== "" && !name.includes(query) && !"当前内容".includes(query)) {
        return [];
      }
      return [{ name, description: "把当前打开的内容交给对话" }];
    },
    onPick() {
      return insert("current", "当前内容");
    },
    lexicon() {
      return ["current content", "当前内容"];
    },
    codec: {
      clipboardText: () => "/current content",
      serialize,
    },
  };

  const stopAt = inputTriggers.registerSource(atSource);
  const stopSlash = inputTriggers.registerSource(slashSource);
  return () => {
    stopAt();
    stopSlash();
  };
}

function formatMuziProject(project: MuziProjectDetail): string {
  const sections = [
    `# 当前创作：${project.title}`,
    `稳定 ID：${project.id}`,
    `修订号：${project.revision}`,
    `阶段：${project.stage}`,
    `主稿：${project.primaryDocument}`,
    "",
    "## 母内容",
    project.content.mother || "（空）",
    "",
    "## 视频稿",
    project.content.video || "（空）",
    "",
    "## Atlas 引用",
    ...project.atlasReferences.map((ref) => `- ${ref.title} | ${ref.locator} | sha256:${ref.sha256}`),
  ];
  return sections.join("\n");
}

/** Registers stable Muzi Creator and formal Wiki composer references. */
export function registerMuziTriggers(
  inputTriggers: TriggerService | undefined,
  loadProject: (id: string) => Promise<MuziProjectDetail>,
  listProjects: () => Promise<ReadonlyArray<{ id: string; title: string }>>,
  loadKnowledge: (locator: string) => Promise<{ title: string; locator: string; sha256: string; markdown: string }>,
  searchKnowledge: (query: string) => Promise<ReadonlyArray<KnowledgePageSummary>>,
  loadPending: (id: string, expectedSha256?: string) => Promise<PendingKnowledgeReference>,
): () => void {
  if (inputTriggers === undefined) return () => undefined;
  const source: TriggerSource = {
    trigger: "@",
    name: "muzi",
    order: 25,
    async candidates(_session, req) {
      const query = req.query.trim().toLocaleLowerCase();
      const [projects, pages] = await Promise.all([listProjects(), searchKnowledge(req.query.trim())]);
      const rows: TriggerCandidate[] = [];
      const selected = getSelectedContentId();
      if (selected !== null && !selected.startsWith("knowledge:") && (query === "" || "当前内容".includes(query))) {
        rows.push({ name: "当前内容", description: `creator:${selected}` });
      }
      for (const project of projects) {
        if (query === "" || project.title.toLocaleLowerCase().includes(query)) rows.push({ name: project.title, description: `creator:${project.id}` });
      }
      for (const page of pages) {
        if (query === "" || page.title.toLocaleLowerCase().includes(query)) rows.push({ name: `知识 · ${page.title}`, description: `knowledge:${page.locator}` });
      }
      return rows.slice(0, 30);
    },
    onPick({ candidate }) {
      const description = candidate.description ?? "";
      return {
        insert: {
          source: "muzi",
          ref: description,
          label: chipLabel(candidate.name),
          clipboardText: `@${candidate.name}`,
        },
      };
    },
    lexicon: () => ["当前内容", "知识页面"],
    subscribeLexicon(_session, listener) { return subscribeSelectedContentId(listener); },
    codec: {
      clipboardText: (ref) => `@${ref}`,
      async serialize(ref) {
        if (ref.startsWith("creator:")) return formatMuziProject(await loadProject(ref.slice("creator:".length)));
        if (ref.startsWith("knowledge:")) {
          const page = await loadKnowledge(ref.slice("knowledge:".length));
          return `# 正式知识：${page.title}\n定位符：${page.locator}\nSHA-256：${page.sha256}\n\n${page.markdown}`;
        }
        if (ref.startsWith("pending:")) {
          const [, id, expectedSha256] = ref.split(":");
          if (id === undefined) return "无效的待消化文件引用。";
          return (await loadPending(id, expectedSha256)).text;
        }
        return "无效的 Muzi 引用。";
      },
    },
  };
  return inputTriggers.registerSource(source);
}
