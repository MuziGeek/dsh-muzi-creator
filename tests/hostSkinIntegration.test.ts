import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("Muzi host skin client integration", () => {
  it("injects the pinned theme service and installs one compatibility skin", async () => {
    const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as {
      dsh: { client: { inject: string[] } };
      peerDependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const client = await readFile(resolve(root, "src/client/index.tsx"), "utf8");

    expect(packageJson.dsh.client.inject).toContain("@deepseek-ai/dsh-client-ui-theme");
    expect(packageJson.peerDependencies["@deepseek-ai/dsh-client-ui-theme"]).toBe("0.1.2-alpha.1");
    expect(packageJson.devDependencies["@deepseek-ai/dsh-client-ui-theme"]).toBe("0.1.1-rc.2");
    expect(packageJson.dsh.client.inject).not.toContain("@deepseek-ai/dsh-client-runtime");
    expect(client.match(/animal-island-ui\/style/g)).toHaveLength(1);
    expect(client.match(/host-skin\/dsh-2\.0\.4\.css/g)).toHaveLength(1);
    expect(client).toContain("installMuziHostSkin(ctx)");
    expect(client).toMatch(/export const inject = \[[^\]]*"theme"/s);
  });

  it("keeps the official conversation and settings shells in control", async () => {
    const client = await readFile(resolve(root, "src/client/index.tsx"), "utf8");

    expect(client).not.toMatch(/slots\.inject\(["']conversation["']/);
    expect(client).not.toMatch(/slots\.inject\(["']conversation\.view["']/);
    expect(client).not.toMatch(/slots\.inject\(["']conversation\.composer\.bar["']/);
    expect(client).not.toMatch(/slots\.inject\(["']sidebar\.settings["']/);
  });
});
