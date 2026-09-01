import { describe, expect, it } from "vitest";

import {
  clampInspectorPreference,
  resolveInspectorLayout,
} from "../src/client/inspectorLayout.ts";

describe("resolveInspectorLayout", () => {
  it("protects a 440px conversation beside the 360px desktop sidebar", () => {
    expect(resolveInspectorLayout(1280, 360, 640)).toEqual({
      mode: "split",
      width: 480,
      maxWidth: 480,
    });
  });

  it("keeps the stored preference on a wider desktop", () => {
    expect(resolveInspectorLayout(1440, 360, 640)).toEqual({
      mode: "split",
      width: 640,
      maxWidth: 640,
    });
  });

  it("uses a full inspector when split view cannot remain readable", () => {
    expect(resolveInspectorLayout(1100, 360, 640)).toEqual({
      mode: "full",
      width: 1100,
      maxWidth: 1100,
    });
  });

  it("clamps preferences independently from viewport constraints", () => {
    expect(clampInspectorPreference(200)).toBe(480);
    expect(clampInspectorPreference(900)).toBe(800);
    expect(resolveInspectorLayout(1280, 360, 800).width).toBe(480);
    expect(clampInspectorPreference(800)).toBe(800);
  });
});
