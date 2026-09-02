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
import { writePersonalLabConfig } from "../scripts/lab-personal-config.mjs";
// @ts-expect-error JavaScript Lab helper is intentionally tested at runtime.
import { confinedPath, labPaths } from "../scripts/lab-paths.mjs";
// @ts-expect-error JavaScript Lab helper is intentionally tested at runtime.
import { setupLab } from "../scripts/lab-setup.mjs";
// @ts-expect-error JavaScript Lab helper is intentionally tested at runtime.
import { assertDesktopLabConfiguration, assertLabConfiguration, assertPersonalLabConfiguration, findDshCli, startLab } from "../scripts/lab-start.mjs";
// @ts-expect-error JavaScript Lab helper is intentionally tested at runtime.
import { DSH_DESKTOP_FILE_VERSION, DSH_DESKTOP_PRODUCT_NAME, DSH_DESKTOP_PRODUCT_VERSION, prepareLocalTgzAcceptance, startDesktop } from "../scripts/lab-desktop.mjs";

const sourceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

async function createPersonalTargets(repositoryRoot: string): Promise<{
  libraryRoot: string;
  creatorRoot: string;
  atlasRoot: string;
  trellisProjectsRoot: string;
  obsidianExecutable: string;
}> {
  const creatorRoot = join(repositoryRoot, "real", "creator-studio");
  const libraryRoot = join(creatorRoot, "10-active");
  const atlasRoot = join(repositoryRoot, "real", "muzi-atlas");
  const trellisProjectsRoot = join(repositoryRoot, "real", "projects");
  const obsidianExecutable = join(repositoryRoot, "real", "Obsidian.exe");
  await Promise.all([
    mkdir(libraryRoot, { recursive: true }),
    mkdir(atlasRoot, { recursive: true }),
    mkdir(trellisProjectsRoot, { recursive: true }),
  ]);
  await writeFile(obsidianExecutable, "fixture\n", "utf8");
  return { libraryRoot, creatorRoot, atlasRoot, trellisProjectsRoot, obsidianExecutable };
}

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
    await mkdir(join(repositoryRoot, "lib"), { recursive: true });
    await Promise.all([
      "index.js",
      "client.js",
      "typert.host.js",
      "collect-publish.mjs",
    ].map((file) => writeFile(join(repositoryRoot, "lib", file), "// Lab build fixture\n", "utf8")));
  });

  afterEach(async () => {
    const paths = labPaths(repositoryRoot);
    for (const pluginLink of [paths.pluginLink, paths.desktopPluginLink, paths.personalPluginLink]) {
      try {
        if ((await lstat(pluginLink)).isSymbolicLink()) await unlink(pluginLink);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    await rm(repositoryRoot, { recursive: true, force: true });
  });

  it("resolves the source checkout when scripts omit an explicit root", () => {
    expect(labPaths().root).toBe(sourceRoot);
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
    expect(await realpath(paths.desktopPluginLink)).toBe(await realpath(paths.root));
    expect(JSON.parse(await readFile(paths.desktopProfileSelection, "utf8"))).toEqual({
      version: 2,
      active: "web",
    });
    expect(JSON.parse(await readFile(paths.desktopMarketSelection, "utf8"))).toEqual({
      version: 1,
      requested: "disabled",
      legacyDefaulted: false,
    });
    expect(await readFile(paths.desktopSettings, "utf8")).toBe("dsh-desktop:\n  mode: compatibility\n");
    for (const directory of [...paths.homeShellDirectories, ...paths.desktopHomeShellDirectories]) {
      expect((await lstat(directory)).isDirectory()).toBe(true);
      expect((await lstat(directory)).isSymbolicLink()).toBe(false);
    }
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
    await expect(assertDesktopLabConfiguration(paths)).resolves.toEqual(config);
  }, 15_000);

  it("fails closed when an isolated Windows shell directory is unavailable", async () => {
    const { paths } = await writeLabConfig(repositoryRoot);
    await rm(paths.desktopHomeShellDirectories[0], { recursive: true });

    await expect(assertDesktopLabConfiguration(paths)).rejects.toThrow("Windows 用户目录不可用");
  }, 15_000);

  it("writes an isolated personal profile for validated real roots without overwriting it", async () => {
    const targets = await createPersonalTargets(repositoryRoot);
    const { paths, config } = await writePersonalLabConfig(repositoryRoot, targets);
    const firstConfig = await readFile(paths.personalConfig, "utf8");

    expect(config).toMatchObject({
      version: 1,
      mode: "personal",
      externalActionsEnabled: false,
      enabledPublishTargets: [],
      credentials: {},
      ...targets,
    });
    expect(config.dataDir).toBe(paths.personalData);
    expect(paths.personalHome).not.toBe(paths.desktopHome);
    expect(paths.personalUserData).not.toBe(paths.desktopUserData);
    expect(await realpath(paths.personalPluginLink)).toBe(await realpath(paths.root));
    await expect(assertPersonalLabConfiguration(paths, targets)).resolves.toEqual(config);

    const persistedSafeSettings = [
      "dsh-desktop:",
      "  mode: compatibility",
      "  windowsMaterial: off",
      "  openBrowser: false",
      "  networkExposure: loopback",
      "ui-theme:",
      "  preference: dark",
      "",
    ].join("\n");
    await writeFile(paths.personalSettings, persistedSafeSettings, "utf8");
    await writePersonalLabConfig(repositoryRoot, targets);
    expect(await readFile(paths.personalConfig, "utf8")).toBe(firstConfig);
    expect(await readFile(paths.personalSettings, "utf8")).toBe(persistedSafeSettings);
  }, 15_000);

  it("launches personal Desktop with real shell discovery and isolated application state", async () => {
    const targets = await createPersonalTargets(repositoryRoot);
    const { paths } = await writePersonalLabConfig(repositoryRoot, targets);
    const fakeDesktop = join(repositoryRoot, "fake-personal-desktop.exe");
    await writeFile(fakeDesktop, "fixture\n", "utf8");

    const invocation = await startDesktop({
      repositoryRoot,
      desktop: fakeDesktop,
      personal: true,
      personalPaths: targets,
      dryRun: true,
      inspectVersion: async () => ({
        fileVersion: DSH_DESKTOP_FILE_VERSION,
        productVersion: DSH_DESKTOP_PRODUCT_VERSION,
        productName: DSH_DESKTOP_PRODUCT_NAME,
      }),
      inspectInstances: async () => [],
    });

    expect(invocation.args).toEqual([`--user-data-dir=${paths.personalUserData}`]);
    expect(invocation.env.DSH_HOME).toBe(paths.personalHome);
    expect(invocation.env.APPDATA).toBe(paths.personalUserData);
    expect(invocation.env.LOCALAPPDATA).toBe(paths.personalUserData);
    expect(invocation.env.XDG_CONFIG_HOME).toBe(paths.personalUserData);
    expect(invocation.env.HOME).toBe(process.env.HOME);
    expect(invocation.env.USERPROFILE).toBe(process.env.USERPROFILE);
    expect(invocation.env.DEEPSEEK_API_KEY).toBe("");
    expect(invocation.env.DSH_EXTERNAL_ACTIONS_ENABLED).toBe("0");
  }, 15_000);

  it("rejects conflicting personal configuration and overlay files without replacing them", async () => {
    const targets = await createPersonalTargets(repositoryRoot);
    const { paths } = await writePersonalLabConfig(repositoryRoot, targets);
    const originalConfig = await readFile(paths.personalConfig, "utf8");
    const conflictingConfig = "{\"mode\":\"unexpected\"}\n";
    await writeFile(paths.personalConfig, conflictingConfig, "utf8");

    await expect(writePersonalLabConfig(repositoryRoot, targets)).rejects.toThrow("已拒绝覆盖");
    expect(await readFile(paths.personalConfig, "utf8")).toBe(conflictingConfig);

    await writeFile(paths.personalConfig, originalConfig, "utf8");
    const overlayPath = join(paths.personalData, "overlay.json");
    const conflictingOverlay = `${JSON.stringify({
      schemaVersion: 1,
      libraryRoot: join(repositoryRoot, "other-library"),
      items: {},
    })}\n`;
    await writeFile(overlayPath, conflictingOverlay, "utf8");
    await expect(writePersonalLabConfig(repositoryRoot, targets)).rejects.toThrow("overlay 的 libraryRoot");
    expect(await readFile(overlayPath, "utf8")).toBe(conflictingOverlay);

    await unlink(overlayPath);
    const unsafeSettings = "dsh-desktop:\n  mode: advanced\n";
    await writeFile(paths.personalSettings, unsafeSettings, "utf8");
    await expect(writePersonalLabConfig(repositoryRoot, targets)).rejects.toThrow("个人 Desktop 设置已存在且不安全");
    expect(await readFile(paths.personalSettings, "utf8")).toBe(unsafeSettings);
  }, 15_000);

  it("rejects missing real roots, linked roots, and non-executable Obsidian paths", async () => {
    const targets = await createPersonalTargets(repositoryRoot);
    await rm(targets.atlasRoot, { recursive: true });
    await expect(writePersonalLabConfig(repositoryRoot, targets)).rejects.toThrow("Atlas 根目录不存在");

    const validTargets = await createPersonalTargets(repositoryRoot);
    const linkedRoot = join(repositoryRoot, "linked-creator");
    await symlink(validTargets.creatorRoot, linkedRoot, process.platform === "win32" ? "junction" : "dir");
    await expect(writePersonalLabConfig(repositoryRoot, {
      ...validTargets,
      creatorRoot: linkedRoot,
      libraryRoot: join(linkedRoot, "10-active"),
    })).rejects.toThrow("Creator 根目录必须是普通目录");

    const invalidExecutable = join(repositoryRoot, "real", "Obsidian.txt");
    await writeFile(invalidExecutable, "fixture\n", "utf8");
    await expect(writePersonalLabConfig(repositoryRoot, {
      ...validTargets,
      obsidianExecutable: invalidExecutable,
    })).rejects.toThrow("普通 .exe 文件");
  }, 15_000);

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
  }, 15_000);

  it("rejects a runtime patch that diverges from the generated isolated paths", async () => {
    const { paths } = await writeLabConfig(repositoryRoot);
    const patch = await readFile(paths.profilePatch, "utf8");
    const divergentPatch = patch.replace(
      /^    libraryRoot: .*$/m,
      `    libraryRoot: ${JSON.stringify(join(repositoryRoot, "outside"))}`,
    );
    expect(divergentPatch).not.toBe(patch);
    expect(divergentPatch).toContain("externalActionsEnabled: false");
    await writeFile(paths.profilePatch, divergentPatch, "utf8");

    await expect(assertLabConfiguration(paths)).rejects.toThrow("profile patch 已偏离隔离配置");
  });

  it("rejects a plugin link that no longer targets the current checkout", async () => {
    const { paths } = await writeLabConfig(repositoryRoot);
    const unexpectedPlugin = join(repositoryRoot, "unexpected-plugin");
    await mkdir(unexpectedPlugin, { recursive: true });
    await unlink(paths.pluginLink);
    await symlink(unexpectedPlugin, paths.pluginLink, process.platform === "win32" ? "junction" : "dir");

    await expect(assertLabConfiguration(paths)).rejects.toThrow("未指向当前源码 checkout");
  });

  it("starts Desktop with isolated user data and the selected Web profile", async () => {
    const { paths } = await writeLabConfig(repositoryRoot);
    const fakeDesktop = join(repositoryRoot, "fake-desktop.exe");
    await writeFile(fakeDesktop, "fixture\n", "utf8");
    const identity = {
      fileVersion: DSH_DESKTOP_FILE_VERSION,
      productVersion: DSH_DESKTOP_PRODUCT_VERSION,
      productName: DSH_DESKTOP_PRODUCT_NAME,
    };

    const invocation = await startDesktop({
      repositoryRoot,
      desktop: fakeDesktop,
      dryRun: true,
      inspectVersion: async () => identity,
      inspectInstances: async () => [],
    });

    expect(invocation.identity).toEqual(identity);
    expect(invocation.args).toEqual([`--user-data-dir=${paths.desktopUserData}`]);
    expect(invocation.cwd).toBe(paths.root);
    expect(invocation.env.DSH_HOME).toBe(paths.desktopHome);
    expect(invocation.env.HOME).toBe(paths.desktopHome);
    expect(invocation.env.USERPROFILE).toBe(paths.desktopHome);
    expect(invocation.env.APPDATA).toBe(paths.desktopUserData);
    expect(invocation.env.DSH_TELEMETRY_DISABLED).toBe("1");
    expect(invocation.env.DSH_EXTERNAL_ACTIONS_ENABLED).toBe("0");
    expect(invocation.env.DEEPSEEK_API_KEY).toBe("");
  }, 15_000);

  it("fails closed before launch when the executable is not Desktop 2.0.4", async () => {
    await writeLabConfig(repositoryRoot);
    const fakeDesktop = join(repositoryRoot, "fake-desktop.exe");
    await writeFile(fakeDesktop, "fixture\n", "utf8");

    await expect(startDesktop({
      repositoryRoot,
      desktop: fakeDesktop,
      dryRun: true,
      inspectVersion: async () => ({
        fileVersion: "2.0.2",
        productVersion: "2.0.2.0",
        productName: DSH_DESKTOP_PRODUCT_NAME,
      }),
    })).rejects.toThrow("要求 DSH Desktop 2.0.4");
  }, 15_000);

  it("fails closed when Electron could hand the launch to an existing Desktop instance", async () => {
    await writeLabConfig(repositoryRoot);
    const fakeDesktop = join(repositoryRoot, "fake-desktop.exe");
    await writeFile(fakeDesktop, "fixture\n", "utf8");

    await expect(startDesktop({
      repositoryRoot,
      desktop: fakeDesktop,
      dryRun: true,
      inspectVersion: async () => ({
        fileVersion: DSH_DESKTOP_FILE_VERSION,
        productVersion: DSH_DESKTOP_PRODUCT_VERSION,
        productName: DSH_DESKTOP_PRODUCT_NAME,
      }),
      inspectInstances: async () => [{ processId: 204 }],
    })).rejects.toThrow("避免 Electron 把请求交给正式 Profile");
  }, 15_000);

  it("fails closed when Desktop no longer selects the Web profile", async () => {
    const { paths } = await writeLabConfig(repositoryRoot);
    await writeFile(paths.desktopProfileSelection, `${JSON.stringify({
      version: 2,
      active: "desktop",
    })}\n`, "utf8");

    await expect(assertDesktopLabConfiguration(paths)).rejects.toThrow("未严格选择 web Profile");
  }, 15_000);

  it("fails closed on the obsolete Desktop 2.0.2 selection-state schema", async () => {
    const { paths } = await writeLabConfig(repositoryRoot);
    await writeFile(paths.desktopProfileSelection, `${JSON.stringify({
      version: 1,
      active: "web",
      lastKnownGood: "web",
    })}\n`, "utf8");

    await expect(assertDesktopLabConfiguration(paths)).rejects.toThrow("未严格选择 web Profile");
  }, 15_000);

  it("accepts Desktop 2.0.4 persisted safe settings and rejects unsafe changes", async () => {
    const { paths } = await writeLabConfig(repositoryRoot);
    await writeFile(paths.desktopSettings, [
      "dsh-desktop:",
      "  mode: compatibility",
      "  macosMaterial: transparent",
      "  windowsMaterial: off",
      "  openBrowser: false",
      "  networkExposure: loopback",
      "dsh-desktop-notifications:",
      "  enabled: false",
      "ui-onboarding:",
      "  welcomeNoticeVersion: 2026-08-13.1",
      "ui-theme:",
      "  preference: system",
      "",
    ].join("\n"), "utf8");
    await expect(assertDesktopLabConfiguration(paths)).resolves.toBeDefined();

    for (const unsafeSettings of [
      "dsh-desktop:\n  mode: advanced\n",
      "dsh-desktop:\n  mode: compatibility\n  windowsMaterial: mica\n",
      "dsh-desktop:\n  mode: compatibility\n  openBrowser: true\n",
      "dsh-desktop:\n  mode: compatibility\n  networkExposure: lan\n",
      "dsh-desktop:\n  mode: compatibility\ndsh-desktop-notifications:\n  enabled: true\n",
    ]) {
      await writeFile(paths.desktopSettings, unsafeSettings, "utf8");
      await expect(assertDesktopLabConfiguration(paths)).rejects.toThrow("未保持隔离兼容配置");
    }
  }, 15_000);

  it("fails closed when Desktop enables a Market", async () => {
    const { paths } = await writeLabConfig(repositoryRoot);
    await writeFile(paths.desktopMarketSelection, `${JSON.stringify({
      version: 1,
      requested: "community-market",
      legacyDefaulted: false,
    })}\n`, "utf8");
    await expect(assertDesktopLabConfiguration(paths)).rejects.toThrow("未严格禁用插件市场");
  }, 15_000);

  it("prepares a local packed acceptance without installing or starting Desktop", async () => {
    const { paths } = await writeLabConfig(repositoryRoot);
    const packageArchive = join(paths.packageStaging, "dsh-muzi-creator-0.1.10.tgz");
    await writeFile(packageArchive, "fixture\n", "utf8");

    await expect(prepareLocalTgzAcceptance({ repositoryRoot, tgz: packageArchive })).resolves.toEqual({
      profile: "web",
      archive: packageArchive,
    });
    await expect(prepareLocalTgzAcceptance({ repositoryRoot, tgz: join(repositoryRoot, "outside.tgz") }))
      .rejects.toThrow("路径逃逸");
  }, 15_000);

  it("keeps Animal Island imports and plugin ownership centralized", async () => {
    const files = await sourceFiles(join(sourceRoot, "src", "client"));
    const contents = await Promise.all(files.map(async (path) => ({ path, text: await readFile(path, "utf8") })));
    const styleImports = contents.flatMap(({ path, text }) => (
      text.includes('import "animal-island-ui/style"') ? [path] : []
    ));
    const deepImports = contents.filter(({ text }) => /animal-island-ui\/(?:dist|src)\//.test(text));
    const pluginCss = await readFile(join(sourceRoot, "src", "client", "pluginCss.ts"), "utf8");
    const islandCss = await readFile(join(sourceRoot, "src", "client", "IslandWorkbench.css"), "utf8");
    const heroBrand = await readFile(join(sourceRoot, "src", "client", "heroBrand.tsx"), "utf8");
    const packageManifest = JSON.parse(await readFile(join(sourceRoot, "package.json"), "utf8"));
    const ownedSurfaces = contents.filter(({ text }) => text.includes('data-plugin="dsh-muzi-creator"'));

    expect(styleImports).toEqual([join(sourceRoot, "src", "client", "index.tsx")]);
    expect(deepImports).toEqual([]);
    expect(pluginCss).toContain('const PLUGIN_ID = "dsh-muzi-creator"');
    expect(islandCss).not.toContain('[data-slot="conversation"]');
    expect(heroBrand).toContain('data-plugin="dsh-muzi-creator"');
    expect(packageManifest.files).toContain("DESIGN.md");
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
