import { describe, expect, it } from "vitest";

import { videoPublishTaskResultSchema } from "../src/muziSchemas.ts";
import { applyRevisionGate, mapTask } from "../src/videoPublisher.ts";

describe("Windows video publisher bridge", () => {
  it("maps the digest-bound approval summary and WeChat platform name", () => {
    const task = mapTask({
      ok: true,
      taskId: "vp-12345678",
      projectId: "mc_0123456789abcdef01234567",
      revision: 4,
      status: "READY",
      createdAt: "2026-08-28T01:00:00.000Z",
      updatedAt: "2026-08-28T01:01:00.000Z",
      platforms: {
        wechat_channels: {
          accountProfile: "木子的野生实验",
          mode: "schedule",
          scheduledAt: "2026-09-01T20:00:00+08:00",
          status: "READY_TO_SCHEDULE",
          ready: true,
          commitEnabled: true,
          commitBlocker: null,
          approvalSummary: {
            platform: "wechat_channels",
            accountProfile: "木子的野生实验",
            title: "平台标题",
            mode: "schedule",
            scheduledAt: "2026-09-01T20:00:00+08:00",
          },
          authorizationDigest: "a".repeat(64),
          authorizationExpiresAt: "2026-08-28T01:10:00.000Z",
        },
      },
    });

    expect(task.platforms.wechat?.approvalSummary).toEqual({
      platform: "wechat",
      accountProfile: "木子的野生实验",
      title: "平台标题",
      mode: "schedule",
      scheduledAt: "2026-09-01T20:00:00+08:00",
    });
    expect(videoPublishTaskResultSchema.parse(task)).toEqual(task);
  });

  it("does not expose a malformed approval summary for final confirmation", () => {
    const task = mapTask({
      ok: true,
      taskId: "vp-12345678",
      projectId: "mc_0123456789abcdef01234567",
      revision: 4,
      status: "READY",
      createdAt: "2026-08-28T01:00:00.000Z",
      updatedAt: "2026-08-28T01:01:00.000Z",
      platforms: {
        douyin: {
          accountProfile: "default",
          mode: "publish_now",
          status: "READY_TO_PUBLISH",
          ready: true,
          commitEnabled: true,
          commitBlocker: null,
          approvalSummary: { platform: "bilibili", title: "错误平台", mode: "publish_now" },
          authorizationDigest: "b".repeat(64),
        },
      },
    });
    expect(task.platforms.douyin?.approvalSummary).toBeNull();
  });

  it("invalidates unused platform authorizations after the project revision changes", () => {
    const task = mapTask({
      ok: true,
      taskId: "vp-12345678",
      projectId: "mc_0123456789abcdef01234567",
      revision: 4,
      status: "READY",
      createdAt: "2026-08-28T01:00:00.000Z",
      updatedAt: "2026-08-28T01:01:00.000Z",
      platforms: {
        douyin: {
          accountProfile: "default",
          mode: "publish_now",
          status: "READY_TO_PUBLISH",
          ready: true,
          commitEnabled: true,
          commitBlocker: null,
          authorizationDigest: "c".repeat(64),
          authorizationExpiresAt: "2026-08-28T01:10:00.000Z",
        },
      },
    });
    const gated = applyRevisionGate(task, 5);
    expect(gated.platforms.douyin).toMatchObject({
      commitEnabled: false,
      authorizationDigest: null,
      authorizationExpiresAt: null,
      commitBlocker: { code: "REVISION_CONFLICT" },
    });
  });
});
