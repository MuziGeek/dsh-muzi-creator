import { useEffect, useRef, type ChangeEvent, type FormEvent } from "react";
import type { MuziPrimaryDocument } from "../../muziTypes.ts";
import { IslandButton, IslandInput, IslandModal, IslandRadio } from "../ui/IslandControls.tsx";
import { isProjectTitleValid } from "./createProjectDialogModel.ts";

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

/** Creates a Creator Studio project without leaving the active sidebar context. */
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
  const valid = isProjectTitleValid(title);
  const returnFocus = useRef<HTMLElement | null>(
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );

  useEffect(() => {
    const modal = document.querySelector<HTMLElement>(".muziCreateModal");
    if (modal === null) return () => { returnFocus.current?.focus(); };
    modal.dataset.plugin = "dsh-muzi-creator";
    modal.dataset.surface = "muzi-create-dialog";
    return () => {
      delete modal.dataset.plugin;
      delete modal.dataset.surface;
      returnFocus.current?.focus();
    };
  }, []);

  return (
    <IslandModal
      open
      className="muziCreateModal"
      title="新增内容"
      width="min(430px, calc(100vw - 32px))"
      maskClosable={!submitting}
      typewriter={false}
      onClose={() => { if (!submitting) onCancel(); }}
      footer={(
        <div className="muziCreateActions">
          <IslandButton type="default" disabled={submitting} onClick={onCancel}>取消</IslandButton>
          <IslandButton type="primary" htmlType="submit" form="muzi-create-project-form" disabled={!valid || submitting} loading={submitting}>
            {submitting ? "正在创建…" : "创建内容"}
          </IslandButton>
        </div>
      )}
    >
      <form
        id="muzi-create-project-form"
        className="muziCreateForm"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          if (valid && !submitting) onSubmit();
        }}
      >
        <header className="muziCreateHeading">
          <p>建立一个主题目录，再从母内容或视频稿开始创作。</p>
        </header>
        <label className="muziCreateField" htmlFor="muzi-project-title-input">
          <span>内容主题</span>
          <IslandInput
            id="muzi-project-title-input"
            name="project-title"
            type="text"
            value={title}
            autoComplete="off"
            placeholder="例如：AI Agent 的可靠运行时…"
            aria-describedby="muzi-project-title-help"
            onChange={(event: ChangeEvent<HTMLInputElement>) => { onTitleChange(event.target.value); }}
          />
          <small id="muzi-project-title-help">{valid ? "目录名称会根据主题自动生成。" : "请输入内容主题。"}</small>
        </label>
        <fieldset>
          <legend>从哪种主稿开始</legend>
          <IslandRadio
            className="muziCreatePrimary"
            direction="vertical"
            size="middle"
            value={primary}
            options={[
              { value: "mother", label: <span><strong>母内容</strong><small>先沉淀完整观点，再派生渠道稿件。</small></span> },
              { value: "video", label: <span><strong>视频稿</strong><small>先完成口播脚本，再补充母内容。</small></span> },
            ]}
            onChange={(value: string | number) => { onPrimaryChange(value as MuziPrimaryDocument); }}
          />
        </fieldset>
        {error !== null && <p className="muziCreateError" role="alert">{error}，请检查后重试。</p>}
      </form>
    </IslandModal>
  );
}
