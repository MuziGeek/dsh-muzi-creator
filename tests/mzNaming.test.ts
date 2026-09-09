import { describe, expect, it } from "vitest";
import { registerCreatorTools } from "../src/tools.ts";
import { MZ_CREATOR_SERVICE } from "../src/service.ts";
import { REMOTE_NAMESPACE } from "../src/remote-contract.ts";
import { externalActionKind } from "../src/externalActions.ts";
it("registers only the new MZ tool names and remote namespace", () => {
  const names: string[] = [];
  registerCreatorTools({tools:{register(tool){names.push(tool.name);}}}, {} as never);
  expect(names).toEqual([
    "mz_creator_guide", "mz_script_rules", "mz_creator_setup", "mz_create_content",
    "mz_update_content", "mz_creator_profile", "mz_organize_library", "mz_sync_publish",
    "mz_open_production_project_folder", "mz_open_studio", "mz_wait_export",
    "mz_open_subtitle_preview", "mz_burn_subtitles", "mz_generate_subtitles", "mz_generate_cover",
  ]);
  expect(names).not.toContain("oil_wait_export");
  expect(REMOTE_NAMESPACE).toBe("mzCreator");
  expect(MZ_CREATOR_SERVICE).toBe(REMOTE_NAMESPACE);
  expect(externalActionKind("mz_sync_publish")).toBe("metrics");
  expect(externalActionKind("oil_sync_publish")).toBeNull();
});
