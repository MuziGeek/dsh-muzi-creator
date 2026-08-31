import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { Config } from "../src/config.ts";
import type { MuziCreatorService } from "../src/muziService.ts";
import { VideoPublisherService } from "../src/videoPublisher.ts";

const PROJECT_ID = `mc_${"1".repeat(24)}`;
const SESSION_ID = `vas-${"2".repeat(24)}`;
const DIGEST = "a".repeat(64);

const task = {
  ok: true,
  taskId: "vp-test-task",
  projectId: PROJECT_ID,
  revision: 4,
  status: "READY",
  createdAt: "2026-08-31T00:00:00.000Z",
  updatedAt: "2026-08-31T00:01:00.000Z",
  platforms: {
    xiaohongshu: {
      platform: "xiaohongshu",
      accountProfile: "xiaohongshu-main",
      mode: "publish_now",
      scheduledAt: null,
      status: "PUBLISHED_CONFIRMED",
      ready: true,
      commitEnabled: false,
      commitBlocker: null,
      approvalSummary: { platform: "xiaohongshu", accountProfile: "xiaohongshu-main", title: "验收作品", mode: "publish_now", scheduledAt: null },
      authorizationDigest: null,
      authorizationExpiresAt: null,
      commitAttemptedAt: "2026-08-31T00:00:30.000Z",
      confirmedAt: "2026-08-31T00:01:00.000Z",
      remoteId: "remote-1",
      url: "https://example.invalid/remote-1",
      acceptanceSessionId: SESSION_ID,
      acceptanceEvidence: { path: "C:\\evidence\\acceptance.json", sha256: DIGEST },
    },
  },
};

async function fixture(): Promise<{
  service: VideoPublisherService;
  patchPublicationStates: ReturnType<typeof vi.fn>;
}> {
  const root = await mkdtemp(join(tmpdir(), "dsh-video-acceptance-"));
  const skillDir = join(root, "skill");
  const projectDir = join(root, "project");
  const dataDir = join(root, "data");
  await mkdir(join(skillDir, "scripts", "v3"), { recursive: true });
  await mkdir(projectDir, { recursive: true });
  await writeFile(join(skillDir, "SKILL.md"), "# Fixture\n");
  await writeFile(join(projectDir, "publish-package.json"), "{}\n");
  await writeFile(join(projectDir, "project.yml"), "revision: 4\n");
  await writeFile(join(skillDir, "scripts", "v3", "publisher.mjs"), `
const command = process.argv[2];
const task = ${JSON.stringify(task)};
if (command === "finalize-acceptance") {
  console.log(JSON.stringify({ ok: true, platform: "xiaohongshu", accountProfile: "xiaohongshu-main", capability: "publish_now", adapterVersion: "xiaohongshu-patchright-publish/2", acceptedAt: "2026-08-31T00:02:00.000Z", evidencePath: "C:\\\\evidence\\\\acceptance.json", sessionId: "${SESSION_ID}", commitEnabled: false, authorizationDigest: null }));
} else if (command === "commit") {
  console.log(JSON.stringify({ task }));
} else if (command === "status") {
  console.log(JSON.stringify(task));
} else {
  process.exitCode = 2;
}
`);
  const patchPublicationStates = vi.fn(async () => ({ revision: 5 }));
  const muzi = {
    getProject: vi.fn(async () => ({ revision: 4 })),
    projectRootPath: vi.fn(async () => projectDir),
    patchPublicationStates,
  } as unknown as MuziCreatorService;
  const config = { creatorRoot: root, videoPublisherSkillDir: skillDir } as Config;
  return { service: new VideoPublisherService(config, dataDir, muzi), patchPublicationStates };
}

describe("controlled publish acceptance project facts", () => {
  it("does not change project revision during the session-bound commit", async () => {
    const { service, patchPublicationStates } = await fixture();
    await expect(service.commit({
      id: PROJECT_ID,
      expectedRevision: 4,
      taskId: task.taskId,
      platform: "xiaohongshu",
      authorizationDigest: DIGEST,
      confirmed: true,
      acceptanceSessionId: SESSION_ID,
    }, new AbortController().signal)).resolves.toMatchObject({ taskId: task.taskId });
    expect(patchPublicationStates).not.toHaveBeenCalled();
  });

  it("writes the confirmed publication fact only after acceptance finalization", async () => {
    const { service, patchPublicationStates } = await fixture();
    await expect(service.finalizeAcceptance({
      id: PROJECT_ID,
      expectedRevision: 4,
      taskId: task.taskId,
      platform: "xiaohongshu",
      capability: "publish_now",
      acceptanceSessionId: SESSION_ID,
      confirmed: true,
    }, new AbortController().signal)).resolves.toMatchObject({
      accountProfile: "xiaohongshu-main",
      capability: "publish_now",
      adapterVersion: "xiaohongshu-patchright-publish/2",
    });
    expect(patchPublicationStates).toHaveBeenCalledOnce();
    expect(patchPublicationStates).toHaveBeenCalledWith(PROJECT_ID, 4, {
      xiaohongshu: {
        status: "published",
        remoteId: "remote-1",
        url: "https://example.invalid/remote-1",
        scheduledAt: null,
        publishedAt: "2026-08-31T00:01:00.000Z",
        source: "publisher",
      },
    });
  });
});
