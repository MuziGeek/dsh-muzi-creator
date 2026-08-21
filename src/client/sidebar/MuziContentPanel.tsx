import { useEffect, useState } from "react";
import { IconFolderClose16 } from "@deepseek-ai/dsh-client-ui-primitives";

import type { MuziPrimaryDocument } from "../../muziTypes.ts";
import type { MuziViewFace } from "../face.ts";
import { bumpLibrary, useLibraryEpoch, useSelectedContentId } from "../contentSelection.ts";
import { PanelSectionHeader } from "./PanelSectionHeader.tsx";
import "./MuziPanels.css";

const DOC_LABELS = { mother: "母内容", video: "视频稿", wechat: "公众号", xiaohongshu: "小红书", blog: "博客" } as const;
const STAGE_LABELS = { idea: "灵感", research: "研究中", mother_draft: "母内容草稿", adaptation: "渠道改编", review: "审阅中", ready: "已就绪", archived: "已归档" } as const;

function statusCount(project: Awaited<ReturnType<MuziViewFace["listProjects"]>>["items"][number]): string {
  const ready = Object.values(project.documents).filter((item) => item.status === "ready").length;
  const published = Object.values(project.publications).filter((item) => item.status === "published").length;
  return `${ready}/5 稿件就绪 · ${published}/5 已发布`;
}
export function MuziContentPanel({ face }: { face: MuziViewFace }) {
  const [query, setQuery] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [items, setItems] = useState<Awaited<ReturnType<MuziViewFace["listProjects"]>>["items"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useSelectedContentId();
  const epoch = useLibraryEpoch();

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const result = await face.listProjects(query, includeArchived);
      setItems(result.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "内容读取失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 180);
    return () => { window.clearTimeout(timer); };
  }, [query, includeArchived, epoch]);

  const create = async (): Promise<void> => {
    const title = window.prompt("新内容主题");
    if (title === null || title.trim() === "") return;
    const primary: MuziPrimaryDocument = window.confirm("确定以视频稿为主稿吗？\n选择“取消”将以母内容为主稿。") ? "video" : "mother";
    try {
      const created = await face.createProject(title, primary);
      bumpLibrary();
      setSelectedId(created.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建失败");
    }
  };

  return (
    <div className="muziPanel">
      <PanelSectionHeader
        label="内容目录"
        query={query}
        searchLabel="搜索内容"
        searchPlaceholder="搜索内容…"
        addLabel="新增内容目录"
        viewLabel="内容视图选项"
        onQueryChange={setQuery}
        onAdd={() => { void create(); }}
        onRefresh={() => { void load(); }}
        viewContent={(
          <label className="muziViewToggle">
            <input type="checkbox" checked={includeArchived} onChange={(event) => { setIncludeArchived(event.target.checked); }} />
            显示归档目录
          </label>
        )}
      />
      <div className="muziPanelList">
        {loading && items.length === 0 && <div className="muziEmpty">正在读取…</div>}
        {error !== null && <div className="muziEmpty error">{error}</div>}
        {!loading && error === null && items.length === 0 && <div className="muziEmpty">还没有创作目录，使用右上角按钮新建。</div>}
        {items.map((item) => (
          <button
            type="button"
            key={item.id}
            className={selectedId === item.id ? "muziListRow selected" : "muziListRow"}
            onClick={() => { setSelectedId(selectedId === item.id ? null : item.id); }}
          >
            <span className="muziListIcon"><IconFolderClose16 size={18} /></span>
            <span className="muziListBody">
              <span className="muziListTitle">{item.title}</span>
              <span className="muziListMeta">
                <span>{DOC_LABELS[item.primaryDocument]}</span>
                <span>·</span>
                <span>{STAGE_LABELS[item.stage]}</span>
              </span>
              <span className="muziListSummary">{statusCount(item)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
