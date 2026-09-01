import { describe, expect, it } from "vitest";

import { selectableIslandOptions } from "../src/client/ui/selectOptions.ts";

describe("Animal Island select adapter", () => {
  it("keeps unavailable capabilities outside the focusable option list", () => {
    expect(selectableIslandOptions([
      { key: "ready", label: "仅准备" },
      { key: "publish", label: "立即发布", disabled: true, disabledReason: "尚未验收" },
    ])).toEqual([{ key: "ready", label: "仅准备" }]);
  });
});
