import { describe, expect, it } from "vitest";

import { externalActionKind } from "../src/externalActions.ts";

describe("explicit external action classification", () => {
  it("classifies only declared external tools", () => {
    expect(externalActionKind("muzi_creator_prepare_video_publish")).toBe("prepare");
    expect(externalActionKind("muzi_creator_commit_video_publish")).toBe("commit");
    expect(externalActionKind("muzi_creator_sync_video_metrics")).toBe("metrics");
    expect(externalActionKind("oil_sync_publish")).toBe("metrics");
    expect(externalActionKind("publish-looking-but-local")).toBeNull();
    expect(externalActionKind("upload_notes")).toBeNull();
  });
});
