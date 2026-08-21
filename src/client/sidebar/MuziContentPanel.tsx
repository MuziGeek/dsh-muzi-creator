import { useEffect, useState } from "react";

import type { MuziPrimaryDocument } from "../../muziTypes.ts";
import type { MuziViewFace } from "../face.ts";
import { bumpLibrary, useLibraryEpoch, useSelectedContentId } from "../contentSelection.ts";
import "./MuziPanels.css";

const DOC_LABELS = { mother: "母内容", video: "视频稿", wechat: "公众号", xiaohongshu: "小红书", blog: "博客" } as const;

function statusCount(project: Awaited<ReturnType<MuziViewFace["listProjects"]>>["items"][number]): string {
  const ready = Object.values(project.documents).filter((item) => item.status === "ready").length;
  const published = Object.values(project.publications).filter((item) => item.status === "published").length;
  return `${ready}/5 稿件就绪 · ${published}/5 已发布`;
}
export function MuziContentPanel({ face }: { face: MuziViewFace }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Awaited<ReturnType<MuziViewFace["listProjects"]>>["items"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useSelectedContentId();
  const epoch = useLibraryEpoch();

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const result = await face.listProjects(query);
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
  }, [query, epoch]);

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
      <div className="muziPanelToolbar">
        <input aria-label="搜索内容" value={query} placeholder="搜索主题" onChange={(event) => { setQuery(event.target.value); }} />
        <button type="button" aria-label="刷新内容" onClick={() => { void load(); }}>↻</button>
        <button type="button" aria-label="新建内容" onClick={() => { void create(); }}>＋</button>
      </div>
      <div className="muziPanelList">
        {loading && items.length === 0 && <div className="muziEmpty">正在读取…</div>}
        {error !== null && <div className="muziEmpty error">{error}</div>}
        {!loading && error === null && items.length === 0 && <div className="muziEmpty">还没有创作项目，点右上角新建。</div>}
        {items.map((item) => (
          <button
            type="button"
            key={item.id}
            className={selectedId === item.id ? "muziListRow selected" : "muziListRow"}
            onClick={() => { setSelectedId(selectedId === item.id ? null : item.id); }}
          >
            <span className="muziListIcon">文</span>
            <span className="muziListBody">
              <span className="muziListTitle">{item.title}</span>
              <span className="muziListMeta">
                <span>{DOC_LABELS[item.primaryDocument]}</span>
                <span>·</span>
                <span>{item.stage}</span>
              </span>
              <span className="muziListSummary">{statusCount(item)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
