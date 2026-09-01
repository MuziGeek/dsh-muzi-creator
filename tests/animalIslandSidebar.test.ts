import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("Animal Island sidebar controls", () => {
  it("uses the shared public control adapter for sidebar actions and the create dialog", async () => {
    const [root, dialog, settings, workbench] = await Promise.all([
      readFile(new URL("../src/client/sidebar/OilSidebarRoot.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/client/sidebar/CreateProjectDialog.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/client/CreatorSettingsCard.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/client/IslandWorkbench.css", import.meta.url), "utf8"),
    ]);

    expect(root).toContain('import { IslandButton } from "../ui/IslandControls.tsx"');
    expect(dialog).toContain("IslandModal");
    expect(dialog).toContain("maskClosable={!submitting}");
    expect(dialog).toContain('form="muzi-create-project-form"');
    expect(dialog).not.toContain("<dialog");
    expect(settings).toContain("IslandCheckbox");
    expect(settings).toContain("IslandInput");
    expect(workbench).toContain("--muzi-island-text-muted: var(--muzi-island-text-soft)");
    expect(workbench).toContain("--muzi-island-mint: var(--muzi-island-leaf-soft)");
    expect(workbench).toContain("body[data-ds-dark-theme] .muziCreateModal");
  });
});
