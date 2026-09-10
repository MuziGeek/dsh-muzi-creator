import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("Muzi host skin client integration", () => {
  it("loads its fixed appearance through the client effect without a skin-center dependency", async () => {
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
    expect(client).toContain("./host-skin/layout.css");
    expect(client).toContain("mountWorkbenchAppearance(document)");
    expect(client).toContain("releaseAppearance()");
    expect(client).not.toContain("/api/skin-center");
    expect(client).not.toMatch(/export const inject = \[[^\]]*"theme"/s);
  });

  it("switches only the conversation root and leaves inner official seats and settings untouched", async () => {
    const client = await readFile(resolve(root, "src/client/index.tsx"), "utf8");

    expect(client).toMatch(/slots\.inject\(["']conversation["']/);
    expect(client).toContain("ConversationWorkbenchController");
    expect(client).toContain("priority: -10");
    expect(client).not.toMatch(/slots\.inject\(["']conversation\.view["']/);
    expect(client).not.toMatch(/slots\.inject\(["']conversation\.composer\.bar["']/);
    expect(client).not.toMatch(/slots\.inject\(["']sidebar\.settings["']/);
    expect(client).not.toContain("querySelector");
  });
});
