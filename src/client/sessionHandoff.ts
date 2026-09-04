interface HandoffInput {
  setDraft: (text: string) => void;
  insertReference: (
    reference: { source: string; ref: string; label: string; clipboardText: string },
    span: { start: number; end: number; draftRev: number },
  ) => boolean;
  notify: (level: "info" | "error", text: string) => void;
  submit?: (mode?: "queue" | "steer") => void;
  state: { getSnapshot: () => { draft: string; draftRev: number } };
}

export interface SessionHandoffOptions {
  prompt: string;
  label: string;
  ref: string;
  requireLlmWiki?: boolean;
  autoSubmit?: boolean;
}

export interface SessionHandoffDependencies<TId extends string> {
  create: () => Promise<TId>;
  inputFor: (sessionId: TId) => HandoffInput;
  reveal: (sessionId: TId) => void;
  hasLlmWiki: (sessionId: TId) => Promise<boolean>;
}

/** Creates one fresh session and stages a model-serialized reference without sending it. */
export async function stageSessionHandoff<TId extends string>(
  dependencies: SessionHandoffDependencies<TId>,
  options: SessionHandoffOptions,
): Promise<void> {
  const sessionId = await dependencies.create();
  const input = dependencies.inputFor(sessionId);
  if (options.requireLlmWiki === true) {
    let available = false;
    try {
      available = await dependencies.hasLlmWiki(sessionId);
    } catch (cause) {
      dependencies.reveal(sessionId);
      input.notify("error", `读取 Skill 列表失败：${cause instanceof Error ? cause.message : "未知错误"}`);
      return;
    }
    if (!available) {
      dependencies.reveal(sessionId);
      input.notify("error", "当前 Agent 未安装 llm-wiki Skill，无法进入知识消化流程");
      return;
    }
  }

  const token = `@${options.label}`;
  input.setDraft(`${options.prompt}\n\n${token}`);
  const state = input.state.getSnapshot();
  const start = state.draft.lastIndexOf(token);
  const inserted = start >= 0 && input.insertReference({
    source: "muzi",
    ref: options.ref,
    label: options.label,
    clipboardText: token,
  }, { start, end: start + token.length, draftRev: state.draftRev });
  if (!inserted) throw new Error("引用预填失败，请刷新后重试");
  if (options.autoSubmit === true) {
    if (input.submit === undefined) throw new Error("当前会话不支持自动提交，请打开会话后手动发送");
    input.submit("queue");
  }
  dependencies.reveal(sessionId);
}
