import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { rewriteArticleImages } from "../src/articleMarkdown.ts";
import { resolveArticleFile } from "../src/articleServe.ts";

describe("rewriteArticleImages", () => {
  it("rewrites relative images onto the local origin", () => {
    expect(rewriteArticleImages("![首屏](images/01.jpg)", "http://127.0.0.1:9000")).toBe(
      "![首屏](http://127.0.0.1:9000/images/01.jpg)",
    );
  });

  it("leaves remote images alone", () => {
    const source = "![x](https://example.com/a.png)";
    expect(rewriteArticleImages(source, "http://127.0.0.1:9000")).toBe(source);
  });
});

describe("resolveArticleFile", () => {
  const root = resolve("/tmp/article");

  it("resolves a file under the article directory", () => {
    expect(resolveArticleFile(root, "/images/01.jpg")).toBe(join(root, "images", "01.jpg"));
  });

  it("rejects path escape", () => {
    expect(resolveArticleFile(root, "/images/../../secret.png")).toBeUndefined();
  });

  it("rejects a non-image", () => {
    expect(resolveArticleFile(root, "/note.md")).toBeUndefined();
  });
});
