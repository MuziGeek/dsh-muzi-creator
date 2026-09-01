import { describe, expect, it } from "vitest";

import { isProjectTitleValid } from "../src/client/sidebar/createProjectDialogModel.ts";

describe("isProjectTitleValid", () => {
  it("rejects blank titles and accepts meaningful text", () => {
    expect(isProjectTitleValid("   ")).toBe(false);
    expect(isProjectTitleValid("AI Agent 架构")).toBe(true);
  });
});
