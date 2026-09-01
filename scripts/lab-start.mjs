#!/usr/bin/env node
import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { delimiter, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { confinedPath, labPaths } from "./lab-paths.mjs";

async function executable(candidate) {
  try { await access(candidate); return candidate; } catch { return undefined; }
}

export async function findDshCli(explicit) {
  const requested = explicit ?? process.env.DSH_CLI;
  if (requested) {
    const found = await executable(requested);
    if (!found) throw new Error(`找不到指定 DSH CLI：${requested}`);
    return found;
  }
  const names = process.platform === "win32" ? ["dsh.cmd", "dsh.exe", "dsh"] : ["dsh"];
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    for (const name of names) {
      const found = await executable(join(directory, name));
      if (found) return found;
    }
  }
  throw new Error("未发现 DSH CLI；请用 --cli <dsh 路径> 或先安装/配置 DSH CLI。Lab 未启动。");
}

export function isolatedEnvironment(paths) {
  return {
    ...process.env,
    DSH_HOME: paths.home,
    HOME: paths.home,
    USERPROFILE: paths.home,
    DSH_TELEMETRY_DISABLED: "1",
    DEEPSEEK_API_KEY: "",
    OPENAI_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    DASHSCOPE_API_KEY: "",
    ZENMUX_API_KEY: "",
  };
}

export async function assertLabConfiguration(paths) {
  let safety;
  try {
    safety = JSON.parse(await readFile(paths.safetyManifest, "utf8"));
  } catch (error) {
    throw new Error(`Lab 配置不存在或不可读；请先运行 pnpm lab:config。${String(error)}`);
  }
  if (safety.externalActionsEnabled !== false || Object.keys(safety.credentials ?? {}).length !== 0) {
    throw new Error("Lab 安全配置无效：外部动作必须关闭且凭据必须为空。");
  }
  for (const key of [
    "libraryRoot",
    "creatorRoot",
    "atlasRoot",
    "trellisProjectsRoot",
    "dataDir",
    "subtitleSkillDir",
    "coverSkillDir",
    "videoPublisherSkillDir",
  ]) {
    if (typeof safety[key] !== "string") throw new Error(`Lab 安全配置缺少路径：${key}`);
    await confinedPath(paths.lab, safety[key]);
  }
  const patch = await readFile(paths.profilePatch, "utf8");
  if (!patch.includes("externalActionsEnabled: false")) {
    throw new Error("Lab Web profile 未关闭外部动作。");
  }
  return safety;
}

function cliInvocation(cli, dshArgs) {
  const extension = extname(cli).toLowerCase();
  if (extension === ".ts" || extension === ".tsx") {
    throw new Error("Lab 不直接执行 TypeScript CLI；请先构建 DSH 并传入 apps/cli/lib/bin.js。");
  }
  if ([".js", ".mjs", ".cjs"].includes(extension)) {
    return { executable: process.execPath, args: [cli, ...dshArgs], shell: false };
  }
  return {
    executable: cli,
    args: dshArgs,
    shell: process.platform === "win32" && cli.toLowerCase().endsWith(".cmd"),
  };
}

export async function startLab({ repositoryRoot, cli, port = 51873, dryRun = false } = {}) {
  const paths = labPaths(repositoryRoot);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Lab 端口无效：${String(port)}`);
  await assertLabConfiguration(paths);
  const executablePath = await findDshCli(cli);
  const env = isolatedEnvironment(paths);
  const invocation = cliInvocation(executablePath, ["--profile", "web", "--no-open", "--port", String(port)]);
  if (dryRun) return { ...invocation, cwd: paths.root, env };
  const child = spawn(invocation.executable, invocation.args, {
    cwd: paths.root,
    env,
    stdio: "inherit",
    shell: invocation.shell,
  });
  return new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (code, signal) => resolve({ code, signal })); });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const cliIndex = process.argv.indexOf("--cli");
  const portIndex = process.argv.indexOf("--port");
  await startLab({
    cli: cliIndex === -1 ? undefined : process.argv[cliIndex + 1],
    port: portIndex === -1 ? 51873 : Number(process.argv[portIndex + 1]),
  });
}
