import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const EXPECTED_SHA256 = "ac835843bea0f4069f4256d0439d71504fdde79cf6a078d2c35bb58dfb436e47";
const DATA_URL_PREFIX = "data:image/webp;base64,";

describe("Muzi Creator brand asset", () => {
  it("keeps the Eagle source bytes and bundled data URL contract intact", async () => {
    const bytes = await readFile(new URL("../src/client/assets/muzi-creator-icon.webp", import.meta.url));
    const source = await readFile(new URL("../src/client/assets/muziIcon.ts", import.meta.url), "utf8");
    const dataUrl = `${DATA_URL_PREFIX}${bytes.toString("base64")}`;

    expect(bytes.length).toBe(72312);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(EXPECTED_SHA256);
    expect(dataUrl.startsWith(DATA_URL_PREFIX)).toBe(true);
    expect(Buffer.from(dataUrl.slice(DATA_URL_PREFIX.length), "base64")).toEqual(bytes);
    expect(source).toContain("muzi-creator-icon.webp");
    expect(source).toContain("MUZI_ICON_SRC");
  });
});
