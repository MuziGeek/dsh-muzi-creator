import { readFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "tsdown";

const PLUGIN_ID = "dsh-muzi-creator";
const CSS_PREFIX = "\0dsh-muzi-creator-css:";
const CSS_SUFFIX = ".mjs";
const ASSET_PREFIX = "\0dsh-muzi-creator-asset:";
const ASSET_SUFFIX = ".mjs";
const ANIMAL_ISLAND_STYLE = "animal-island-ui/style";
const ANIMAL_ISLAND_CSS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "node_modules/animal-island-ui/dist/index.css",
);
const CSS_ASSET_MIME = new Map([
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);
const CLIENT_EXTERNALS = [
  "react",
  "react/jsx-runtime",
  "react-dom",
  "react-dom/client",
  "@deepseek-ai/cordis",
  "@deepseek-ai/dsh-client-runtime/client",
  "@deepseek-ai/dsh-client-locale/client",
  "@deepseek-ai/dsh-client-ui-primitives",
  "@deepseek-ai/dsh-client-ui-slots",
  "@deepseek-ai/dsh-api-remotes/client",
  "@deepseek-ai/dsh-client-connection/client",
] as const;

async function inlineCssAssets(css: string, cssFile: string): Promise<string> {
  const replacements = new Map<string, string>();
  for (const match of css.matchAll(/url\((['"]?)([^'"\)]+)\1\)/g)) {
    const reference = match[2];
    const literal = match[0];
    if (reference === undefined || literal === undefined || /^(?:data:|https?:|#)/.test(reference)) continue;
    const mime = CSS_ASSET_MIME.get(extname(reference).toLowerCase());
    if (mime === undefined) continue;
    const bytes = await readFile(resolve(dirname(cssFile), reference));
    replacements.set(literal, `url("data:${mime};base64,${bytes.toString("base64")}")`);
  }
  let inlined = css;
  for (const [literal, dataUrl] of replacements) inlined = inlined.replaceAll(literal, dataUrl);
  return inlined;
}

function inlineAssetPlugin() {
  return {
    name: "dsh-muzi-creator-inline-asset",
    resolveId(source: string, importer?: string) {
      if (importer === undefined || !CSS_ASSET_MIME.has(extname(source).toLowerCase())) return null;
      return `${ASSET_PREFIX}${resolve(dirname(importer), source)}${ASSET_SUFFIX}`;
    },
    async load(id: string) {
      if (!id.startsWith(ASSET_PREFIX)) return null;
      const file = id.slice(ASSET_PREFIX.length, -ASSET_SUFFIX.length);
      const mime = CSS_ASSET_MIME.get(extname(file).toLowerCase());
      if (mime === undefined) return null;
      const bytes = await readFile(file);
      return `export default ${JSON.stringify(`data:${mime};base64,${bytes.toString("base64")}`)};`;
    },
  };
}

function inlineCssPlugin() {
  return {
    name: "dsh-muzi-creator-inline-css",
    resolveId(source: string, importer?: string) {
      if (source === ANIMAL_ISLAND_STYLE) return `${CSS_PREFIX}${ANIMAL_ISLAND_CSS}${CSS_SUFFIX}`;
      if (!source.endsWith(".css")) return null;
      const file =
        importer === undefined ? source : resolve(dirname(importer), source);
      return `${CSS_PREFIX}${file}${CSS_SUFFIX}`;
    },
    async load(id: string) {
      if (!id.startsWith(CSS_PREFIX)) return null;
      const file = id.slice(CSS_PREFIX.length, -CSS_SUFFIX.length);
      const css = await inlineCssAssets(await readFile(file, "utf8"), file);
      const tagId = `${PLUGIN_ID}/${basename(file)}`;
      const registry = resolve(dirname(fileURLToPath(import.meta.url)), "src/client/pluginCss.ts");
      return [
        `import { registerPluginCss } from ${JSON.stringify(registry)};`,
        `registerPluginCss(${JSON.stringify(tagId)}, ${JSON.stringify(css)});`,
        "export default {};",
      ].join("\n");
    },
  };
}

export default defineConfig([
  {
    name: `${PLUGIN_ID}/host`,
    entry: { index: "src/index.ts" },
    outDir: "lib",
    format: "esm",
    platform: "node",
    target: "es2024",
    fixedExtension: false,
    dts: false,
    clean: false,
  },
  {
    name: `${PLUGIN_ID}/typert`,
    entry: { "typert.host": "src/typert.host.ts" },
    outDir: "lib",
    format: "esm",
    platform: "node",
    target: "es2024",
    fixedExtension: false,
    dts: false,
    clean: false,
  },
  {
    name: `${PLUGIN_ID}/client`,
    entry: { client: "src/client/index.tsx" },
    outDir: "lib",
    format: "cjs",
    platform: "browser",
    target: "es2022",
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
    fixedExtension: false,
    dts: false,
    sourcemap: true,
    clean: false,
    deps: {
      neverBundle: [...CLIENT_EXTERNALS],
      alwaysBundle: (id: string) =>
        CLIENT_EXTERNALS.includes(id as (typeof CLIENT_EXTERNALS)[number])
          ? undefined
          : true,
      onlyBundle: false,
    },
    plugins: [inlineAssetPlugin(), inlineCssPlugin()],
    outputOptions: {
      entryFileNames: "client.js",
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
      intro: "var module = { exports: {} }; var exports = module.exports;",
      footer: "return module.exports; } });",
    },
  },
]);
