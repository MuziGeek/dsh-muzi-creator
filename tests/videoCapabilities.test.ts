import { describe, expect, it } from "vitest";

import { capabilityEnabled, normalizeVideoPublishCapabilities } from "../src/videoCapabilities.ts";

const generatedAt = "2026-08-31T02:00:00.000Z";
const account = {
  platform: "xiaohongshu",
  accountProfile: "xiaohongshu-main",
  displayName: "木子的野生实验",
  enabled: true,
  capabilities: {
    prepare_only: { accepted: true, enabled: true, acceptedAt: generatedAt, adapterVersion: "adapter-1" },
    publish_now: { accepted: false, enabled: false, reason: "尚未验收", acceptedAt: null, adapterVersion: "adapter-1" },
    schedule: { accepted: true, enabled: false, reason: "平台原生排程未通过验收", acceptedAt: generatedAt, adapterVersion: "adapter-1" },
    metrics: { accepted: true, enabled: true, acceptedAt: generatedAt, adapterVersion: "adapter-1" },
  },
};

describe("video publisher capability bridge", () => {
  it("normalizes a registered account and keeps the UI mode choices capability-bound", () => {
    const result = normalizeVideoPublishCapabilities({ schema: "muzi.video-publisher.capabilities/1", generatedAt, accounts: [account] });
    expect(result.unavailableReason).toBeNull();
    expect(result.accounts.map((item) => item.accountProfile)).toEqual(["xiaohongshu-main"]);
    expect(result.accounts[0]?.enabled).toBe(true);
    expect(capabilityEnabled(result.accounts[0], "prepare_only")).toBe(true);
    expect(capabilityEnabled(result.accounts[0], "publish_now")).toBe(false);
    expect(capabilityEnabled(result.accounts[0], "schedule")).toBe(false);
    expect(capabilityEnabled(result.accounts[0], "metrics")).toBe(true);
  });

  it("fails closed when a capability is missing rather than treating it as enabled", () => {
    const incomplete = structuredClone(account) as typeof account;
    delete (incomplete.capabilities as Partial<typeof incomplete.capabilities>).prepare_only;
    const result = normalizeVideoPublishCapabilities({ schema: "muzi.video-publisher.capabilities/1", generatedAt, accounts: [incomplete] });
    expect(result.accounts[0]?.capabilities.prepare_only).toMatchObject({ accepted: false, enabled: false });
    expect(result.accounts[0]?.capabilities.prepare_only.reason).toContain("缺少");
  });

  it("fails closed when an enabled capability has no adapter version", () => {
    const incomplete = structuredClone(account) as typeof account;
    incomplete.capabilities.prepare_only = { accepted: true, enabled: true, acceptedAt: generatedAt } as typeof incomplete.capabilities.prepare_only;
    const result = normalizeVideoPublishCapabilities({ schema: "muzi.video-publisher.capabilities/1", generatedAt, accounts: [incomplete] });
    expect(result.accounts[0]?.capabilities.prepare_only.enabled).toBe(false);
    expect(result.accounts[0]?.capabilities.prepare_only.reason).toContain("适配器版本");
  });

  it("fails closed for malformed and duplicate account results", () => {
    expect(normalizeVideoPublishCapabilities({ schema: "wrong", generatedAt, accounts: [account] }).accounts).toEqual([]);
    const duplicate = normalizeVideoPublishCapabilities({ schema: "muzi.video-publisher.capabilities/1", generatedAt, accounts: [account, account] });
    expect(duplicate.accounts).toEqual([]);
    expect(duplicate.unavailableReason).toContain("重复");
  });
});
