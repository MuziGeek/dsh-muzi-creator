import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Lab scripts stay runnable ESM without adding a production TypeScript surface.
// @ts-expect-error JavaScript Lab helper is intentionally tested at runtime.
import { writeLabConfig } from "../scripts/lab-config.mjs";
// @ts-expect-error JavaScript Lab helper is intentionally tested at runtime.
import { confinedPath, labPaths } from "../scripts/lab-paths.mjs";
// @ts-expect-error JavaScript Lab helper is intentionally tested at runtime.
import { setupLab } from "../scripts/lab-setup.mjs";
// @ts-expect-error JavaScript Lab helper is intentionally tested at runtime.
import { assertLabConfiguration, findDshCli, startLab } from "../scripts/lab-start.mjs";

const sourceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:css|tsx?)$/.test(entry.name) ? [path] : [];
  }))).flat();
}

describe("isolated UI Lab", () => {
  let repositoryRoot: string;

  beforeEach(async () => {
    repositoryRoot = await mkdtemp(join(tmpdir(), "dsh-muzi-lab-"));
  });

  afterEach(async () => {
    const pluginLink = labPaths(repositoryRoot).pluginLink;
    try {
      if ((await lstat(pluginLink)).isSymbolicLink()) await unlink(pluginLink);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await rm(repositoryRoot, { recursive: true, force: true });
  });

  it("confines paths and rejects symlinked segments", async () => {
    const paths = labPaths(repositoryRoot);
    await mkdir(paths.lab, { recursive: true });
    await expect(confinedPath(paths.lab, join(paths.lab, "..", "outside"))).rejects.toThrow("路径逃逸");
    const link = join(paths.lab, "link");
    await symlink(paths.root, link, process.platform === "win32" ? "junction" : "dir");
    try {
      await expect(confinedPath(paths.lab, join(link, "file"))).rejects.toThrow("符号链接");
    } finally {
      await unlink(link);
    }
  });

  it("writes a real isolated Web profile with safe Muzi Creator paths", async () => {
    const { paths, config } = await writeLabConfig(repositoryRoot);
    const manifest = JSON.parse(await readFile(paths.profileManifest, "utf8"));
    const patch = await readFile(paths.profilePatch, "utf8");

    expect(manifest.dsh.profile.bundles).toEqual([
      "@deepseek-ai/dsh-base",
      "@deepseek-ai/dsh-web-app",
      "dsh-muzi-creator",
    ]);
    expect(manifest.dependencies["dsh-muzi-creator"]).toBe(`link:${paths.root.replaceAll("\\", "/")}`);
    expect(await realpath(paths.pluginLink)).toBe(await realpath(paths.root));
    expect(patch).toContain("- id: dsh-muzi-creator");
    expect(patch).toContain("externalActionsEnabled: false");
    expect(config.credentials).toEqual({});
    expect(config.enabledPublishTargets).toEqual([]);
    for (const key of [
      "libraryRoot",
      "creatorRoot",
      "atlasRoot",
      "trellisProjectsRoot",
      "dataDir",
      "subtitleSkillDir",
      "coverSkillDir",
      "videoPublisherSkillDir",
    ] as const) {
      await expect(confinedPath(paths.lab, config[key])).resolves.toBe(resolve(config[key]));
    }
    await expect(assertLabConfiguration(paths)).resolves.toEqual(config);
  });

  it("starts the built DSH CLI with the isolated profile contract", async () => {
    const paths = await setupLab(repositoryRoot);
    await writeLabConfig(repositoryRoot);
    const fakeCli = join(repositoryRoot, "fake-dsh.js");
    await writeFile(fakeCli, "// fixture\n", "utf8");

    const invocation = await startLab({ repositoryRoot, cli: fakeCli, port: 51873, dryRun: true });

    expect(invocation.executable).toBe(process.execPath);
    expect(invocation.args).toEqual([
      fakeCli,
      "--profile",
      "web",
      "--no-open",
      "--port",
      "51873",
    ]);
    expect(invocation.cwd).toBe(paths.root);
    expect(invocation.shell).toBe(false);
    expect(invocation.env.DSH_HOME).toBe(paths.home);
    expect(invocation.env.HOME).toBe(paths.home);
    expect(invocation.env.USERPROFILE).toBe(paths.home);
    expect(invocation.env.DEEPSEEK_API_KEY).toBe("");
    expect(invocation.env.DASHSCOPE_API_KEY).toBe("");
    expect(invocation.env.ZENMUX_API_KEY).toBe("");
  });

  it("keeps Animal Island imports and plugin ownership centralized", async () => {
    const files = await sourceFiles(join(sourceRoot, "src", "client"));
    const contents = await Promise.all(files.map(async (path) => ({ path, text: await readFile(path, "utf8") })));
    const styleImports = contents.flatMap(({ path, text }) => (
      text.includes('import "animal-island-ui/style"') ? [path] : []
    ));
    const deepImports = contents.filter(({ text }) => /animal-island-ui\/(?:dist|src)\//.test(text));
    const pluginCss = await readFile(join(sourceRoot, "src", "client", "pluginCss.ts"), "utf8");
    const ownedSurfaces = contents.filter(({ text }) => text.includes('data-plugin="dsh-muzi-creator"'));

    expect(styleImports).toEqual([join(sourceRoot, "src", "client", "index.tsx")]);
    expect(deepImports).toEqual([]);
    expect(pluginCss).toContain('const PLUGIN_ID = "dsh-muzi-creator"');
    expect(ownedSurfaces.length).toBeGreaterThan(0);
  });

  it("reports missing or source-only DSH CLIs clearly", async () => {
    const missing = join(repositoryRoot, "missing-dsh");
    await expect(findDshCli(missing)).rejects.toThrow("找不到指定 DSH CLI");
    await writeLabConfig(repositoryRoot);
    const sourceCli = join(repositoryRoot, "dsh.ts");
    await writeFile(sourceCli, "// fixture\n", "utf8");
    await expect(startLab({ repositoryRoot, cli: sourceCli, dryRun: true })).rejects.toThrow("不直接执行 TypeScript CLI");
  });
});
