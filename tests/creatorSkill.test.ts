import { describe, expect, it, vi } from "vitest";

import { CREATOR_WORKBENCH_SKILL, registerCreatorWorkbenchSkill } from "../src/creatorSkill.ts";

describe("creator-workbench skill", () => {
  it("registers a model-visible onboarding workflow", () => {
    const dispose = vi.fn();
    const register = vi.fn(() => dispose);
    expect(registerCreatorWorkbenchSkill({ skills: { register } })).toBe(dispose);
    expect(register).toHaveBeenCalledWith(CREATOR_WORKBENCH_SKILL);
    expect(CREATOR_WORKBENCH_SKILL.content).toContain("muzi_knowledge_search");
    expect(CREATOR_WORKBENCH_SKILL.content).toContain("muzi_creator_create confirmed=false");
    expect(CREATOR_WORKBENCH_SKILL.content).toContain("muzi_creator_save confirmed=false");
    expect(CREATOR_WORKBENCH_SKILL.content).toContain("oil_script_rules");
    expect(CREATOR_WORKBENCH_SKILL.content).toContain("Creator Studio 是唯一可写创作事实源");
    expect(CREATOR_WORKBENCH_SKILL.content).toContain("不得搜索或引用 raw/");
    expect(CREATOR_WORKBENCH_SKILL.content).toContain("修订冲突");
    expect(CREATOR_WORKBENCH_SKILL.content).toContain("外部同步、上传和发布默认关闭");
    expect(CREATOR_WORKBENCH_SKILL.content).toContain("DSH 审批");
  });
});
