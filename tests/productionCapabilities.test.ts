import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { inspectCreatorSetup } from "../src/capabilities.ts";
import type { LibrarySettings } from "../src/types.ts";

function settings(libraryRoot: string): LibrarySettings {
  return {
    libraryRoot,
    profile: { enabledPlatforms: [] },
    secrets: {
      subtitle: { kind: "subtitle", ref: "subtitle", configured: false, writable: true },
      cover: { kind: "cover", ref: "cover", configured: false, writable: true },
    },
    trellisProjectsRoot: "/projects",
  };
}

async function writeSubtitleFiles(root: string): Promise<void> {
  await Promise.all([
    writeFile(join(root, "setup.sh"), "#!/bin/bash\n"),
    writeFile(join(root, "scripts", "preview_editor.py"), ""),
    writeFile(join(root, "scripts", "burn_subtitles.py"), ""),
    writeFile(join(root, "scripts", "prepare_subtitles.py"), ""),
    writeFile(join(root, "scripts", "review_subtitles.py"), ""),
  ]);
}

describe("production capability inspection", () => {
  it("requires a real macOS app executable and skill entry before showing the exclusive editor as ready", async () => {
    const root = await mkdtemp(join(tmpdir(), "mz-production-mac-"));
    const app = join(root, "Applications", "Screen Studio.app");
    const editor = join(root, "skills", "screen-studio-editor");
    await Promise.all([
      mkdir(app, { recursive: true }),
      mkdir(editor, { recursive: true }),
    ]);
    await writeFile(join(editor, "SKILL.md"), "# screen-studio-editor\n");

    const options = {
      libraryRoot: root,
      dataDir: join(root, "data"),
      subtitleSkillDir: join(root, "missing-subtitle"),
      coverSkillDir: join(root, "missing-cover"),
      settings: settings(root),
      platform: "darwin" as const,
      env: { PATH: "" },
      home: root,
      findSkillDir: (name: string) => name === "screen-studio-editor" ? editor : undefined,
    };

    const withoutRuntime = await inspectCreatorSetup(options);
    expect(withoutRuntime.capabilities.screenStudio.state).toBe("missing");
    expect(withoutRuntime.capabilities.editingSkill.state).toBe("missing");

    const executable = join(app, "Contents", "MacOS", "Screen Studio");
    await mkdir(join(app, "Contents", "MacOS"), { recursive: true });
    await writeFile(executable, "");
    await chmod(executable, 0o755);

    const ready = await inspectCreatorSetup(options);
    expect(ready.capabilities.screenStudio.state).toBe("ready");
    expect(ready.capabilities.editingSkill.state).toBe("ready");
  });

  it("does not mark the Screen Studio editor ready or recommend it outside macOS", async () => {
    const root = await mkdtemp(join(tmpdir(), "mz-production-win-"));
    const editor = join(root, "skills", "screen-studio-editor");
    await mkdir(editor, { recursive: true });
    await writeFile(join(editor, "SKILL.md"), "# screen-studio-editor\n");

    const result = await inspectCreatorSetup({
      libraryRoot: root,
      dataDir: join(root, "data"),
      subtitleSkillDir: join(root, "missing-subtitle"),
      coverSkillDir: join(root, "missing-cover"),
      settings: settings(root),
      platform: "win32",
      env: { Path: "" },
      home: root,
      findSkillDir: (name) => name === "screen-studio-editor" ? editor : undefined,
    });

    expect(result.capabilities.screenStudio.state).toBe("unsupported");
    expect(result.capabilities.editingSkill.state).toBe("unsupported");
    expect(result.capabilities.subtitleSkill.detail).toContain("Git Bash");
    expect(result.recommendations.join("\n")).not.toContain("Screen Studio");
    expect(result.recommendations.join("\n")).not.toContain("screen-studio-editor");
  });

  it("does not treat a virtual-environment Python directory as an executable interpreter", async () => {
    const root = await mkdtemp(join(tmpdir(), "mz-production-python-"));
    const subtitle = join(root, "oil-subtitle");
    const cover = join(root, "oil-cover");
    await Promise.all([
      mkdir(join(subtitle, ".venv", "bin"), { recursive: true }),
      mkdir(join(subtitle, "scripts"), { recursive: true }),
      mkdir(join(cover, ".venv", "bin"), { recursive: true }),
      mkdir(join(cover, "scripts"), { recursive: true }),
    ]);
    await writeSubtitleFiles(subtitle);
    await Promise.all([
      mkdir(join(subtitle, ".venv", "bin", "python3"), { recursive: true }),
      mkdir(join(cover, ".venv", "bin", "python3"), { recursive: true }),
      writeFile(join(cover, "scripts", "generate_oil_cover.py"), ""),
    ]);

    const result = await inspectCreatorSetup({
      libraryRoot: root,
      dataDir: join(root, "data"),
      subtitleSkillDir: subtitle,
      coverSkillDir: cover,
      settings: settings(root),
      platform: "linux",
      env: { PATH: "" },
      home: root,
      findSkillDir: () => undefined,
    });

    expect(result.capabilities.subtitleSkill.state).toBe("missing");
    expect(result.capabilities.subtitleSkill.detail).toContain("解释器不可执行");
    expect(result.capabilities.coverSkill.state).toBe("missing");
    expect(result.capabilities.coverSkill.detail).toContain("可执行的 Python");
  });
});
