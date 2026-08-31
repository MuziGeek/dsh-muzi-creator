import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveArticleFile } from "../src/articleServe.ts";

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
