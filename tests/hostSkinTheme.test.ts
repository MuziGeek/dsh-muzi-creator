import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  installMuziHostSkin,
  MUZI_HOST_SKIN_ATTRIBUTE,
  MUZI_HOST_SKIN_NAME,
  MUZI_HOST_THEME_SOURCE,
} from "../src/client/host-skin/install.ts";
import { MUZI_HOST_THEME_TOKENS } from "../src/client/host-skin/tokens.ts";

interface InstalledSkin {
  cleanup: () => void;
  disposeTokens: ReturnType<typeof vi.fn>;
  overrideTokens: ReturnType<typeof vi.fn>;
}

function installWith(documentValue: unknown): InstalledSkin {
  const disposeTokens = vi.fn();
  const overrideTokens = vi.fn(() => disposeTokens);
  let cleanup: (() => void) | undefined;
  vi.stubGlobal("document", documentValue);

  installMuziHostSkin({
    theme: { overrideTokens },
    effect: (setup) => {
      cleanup = setup() as (() => void) | undefined;
    },
  });

  if (cleanup === undefined) throw new Error("skin installation did not register cleanup");
  return { cleanup, disposeTokens, overrideTokens };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Muzi host theme tokens", () => {
  it("pairs every override across light and dark palettes", () => {
    for (const token of Object.values(MUZI_HOST_THEME_TOKENS) as Array<{ light: string; dark: string }>) {
      expect(typeof token.light).toBe("string");
      expect(typeof token.dark).toBe("string");
    }
    expect(MUZI_HOST_THEME_TOKENS["--dsw-alias-bg-base"]).toEqual({
      light: "var(--muzi-host-canvas)",
      dark: "var(--muzi-host-canvas)",
    });
    expect(MUZI_HOST_THEME_TOKENS["--dsw-font-family"]!.light).toContain("Nunito");
    expect(MUZI_HOST_THEME_TOKENS["--dsw-alias-focus"]!.dark).toContain("--muzi-host-focus");
  });

  it("covers the compile-time theme contract verified against Desktop 2.0.4", async () => {
    const css = await readFile(
      resolve(process.cwd(), "node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js"),
      "utf8",
    );
    const officialTokens = new Set(
      [...css.matchAll(/(--dsw-(?:alias|specific)-[\w-]+)\s*:/g)].map((match) => match[1]!),
    );
    const missing = [...officialTokens].filter((token) => MUZI_HOST_THEME_TOKENS[token] === undefined);

    expect(missing).toEqual([]);
  });
});

describe("installMuziHostSkin", () => {
  it("registers one override layer and restores an existing body marker", () => {
    const attributes = new Map([[MUZI_HOST_SKIN_ATTRIBUTE, "legacy-skin"]]);
    const body = {
      getAttribute: (name: string) => attributes.get(name) ?? null,
      setAttribute: (name: string, value: string) => { attributes.set(name, value); },
      removeAttribute: (name: string) => { attributes.delete(name); },
    };
    const { cleanup, disposeTokens, overrideTokens } = installWith({ body });

    expect(overrideTokens).toHaveBeenCalledWith(MUZI_HOST_THEME_SOURCE, MUZI_HOST_THEME_TOKENS);
    expect(attributes.get(MUZI_HOST_SKIN_ATTRIBUTE)).toBe(MUZI_HOST_SKIN_NAME);

    cleanup();
    expect(disposeTokens).toHaveBeenCalledOnce();
    expect(attributes.get(MUZI_HOST_SKIN_ATTRIBUTE)).toBe("legacy-skin");
  });

  it("removes its marker when body had no original value", () => {
    const attributes = new Map<string, string>();
    const body = {
      getAttribute: (name: string) => attributes.get(name) ?? null,
      setAttribute: (name: string, value: string) => { attributes.set(name, value); },
      removeAttribute: (name: string) => { attributes.delete(name); },
    };
    const { cleanup } = installWith({ body });

    cleanup();
    expect(attributes.has(MUZI_HOST_SKIN_ATTRIBUTE)).toBe(false);
  });

  it("keeps the token disposer usable without a browser document", () => {
    const { cleanup, disposeTokens, overrideTokens } = installWith(undefined);

    cleanup();
    expect(overrideTokens).toHaveBeenCalledOnce();
    expect(disposeTokens).toHaveBeenCalledOnce();
  });
});
