import { useEffect, useRef } from "react";

import type { MuziPrimaryDocument } from "../../muziTypes.ts";

export function isProjectTitleValid(title: string): boolean {
  return title.trim() !== "";
}

export interface CreateProjectDialogProps {
  title: string;
  primary: MuziPrimaryDocument;
  submitting: boolean;
  error: string | null;
  onTitleChange: (title: string) => void;
  onPrimaryChange: (primary: MuziPrimaryDocument) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

/** Oil-style modal for creating a Creator Studio project. */
export function CreateProjectDialog({
  title,
  primary,
  submitting,
  error,
  onTitleChange,
  onPrimaryChange,
  onCancel,
  onSubmit,
}: CreateProjectDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const valid = isProjectTitleValid(title);

  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;
    element.showModal();
    if (window.matchMedia("(min-width: 681px)").matches) titleInput.current?.focus();
    return () => {
      if (element.open) element.close();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      data-plugin="dsh-muzi-creator"
      data-surface="muzi-create-dialog"
      aria-labelledby="muzi-create-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!submitting) onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !submitting) onCancel();
      }}
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid && !submitting) onSubmit();
        }}
      >
        <header>
          <h2 id="muzi-create-title">新增内容</h2>
          <p>建立一个主题目录，再从母内容或视频稿开始创作。</p>
        </header>
        <label className="muziCreateField" htmlFor="muzi-project-title-input">
          <span>内容主题</span>
          <input
            ref={titleInput}
            id="muzi-project-title-input"
            name="project-title"
            type="text"
            value={title}
            autoComplete="off"
            placeholder="例如：AI Agent 的可靠运行时…"
            aria-describedby="muzi-project-title-help"
            onChange={(event) => { onTitleChange(event.target.value); }}
          />
          <small id="muzi-project-title-help">{valid ? "目录名称会根据主题自动生成。" : "请输入内容主题。"}</small>
        </label>
        <fieldset>
          <legend>从哪种主稿开始</legend>
          <label>
            <input type="radio" name="primary-document" value="mother" checked={primary === "mother"} onChange={() => { onPrimaryChange("mother"); }} />
            <span><strong>母内容</strong><small>先沉淀完整观点，再派生渠道稿件。</small></span>
          </label>
          <label>
            <input type="radio" name="primary-document" value="video" checked={primary === "video"} onChange={() => { onPrimaryChange("video"); }} />
            <span><strong>视频稿</strong><small>先完成口播脚本，再补充母内容。</small></span>
          </label>
        </fieldset>
        {error !== null && <p className="muziCreateError" role="alert">{error}，请检查后重试。</p>}
        <footer>
          <button type="button" className="secondary" disabled={submitting} onClick={onCancel}>取消</button>
          <button type="submit" className="primary" disabled={!valid || submitting}>{submitting ? "正在创建…" : "创建内容"}</button>
        </footer>
      </form>
    </dialog>
  );
}
