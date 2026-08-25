import { describe, expect, it } from "vitest";

import {
  clampInspectorPreference,
  resolveInspectorLayout,
} from "../src/client/inspectorLayout.ts";

describe("resolveInspectorLayout", () => {
  it("protects a 440px conversation at 1280px", () => {
    expect(resolveInspectorLayout(1280, 280, 640)).toEqual({
      mode: "split",
      width: 560,
      maxWidth: 560,
    });
  });

  it("keeps the stored preference on a wider desktop", () => {
    expect(resolveInspectorLayout(1440, 280, 640)).toEqual({
      mode: "split",
      width: 640,
      maxWidth: 720,
    });
  });

  it("uses a full inspector when split view cannot remain readable", () => {
    expect(resolveInspectorLayout(1100, 280, 640)).toEqual({
      mode: "full",
      width: 1100,
      maxWidth: 1100,
    });
  });

  it("clamps preferences independently from viewport constraints", () => {
    expect(clampInspectorPreference(200)).toBe(420);
    expect(clampInspectorPreference(900)).toBe(800);
    expect(resolveInspectorLayout(1280, 280, 800).width).toBe(560);
    expect(clampInspectorPreference(800)).toBe(800);
  });
});
