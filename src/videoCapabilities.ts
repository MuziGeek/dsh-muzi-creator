import type { AcceptanceCapability, MuziVideoPlatform } from "./muziTypes.ts";

export const VIDEO_ACCEPTANCE_CAPABILITIES = ["prepare_only", "publish_now", "schedule", "metrics"] as const satisfies readonly AcceptanceCapability[];

export interface VideoCapabilityState {
  accepted: boolean;
  enabled: boolean;
  reason: string | null;
  acceptedAt: string | null;
  adapterVersion: string | null;
}

export interface VideoPublishAccountCapabilities {
  platform: MuziVideoPlatform;
  accountProfile: string;
  displayName: string;
  enabled: boolean;
  capabilities: Record<AcceptanceCapability, VideoCapabilityState>;
}

export interface VideoPublishCapabilitiesResult {
  schema: "muzi.video-publisher.capabilities/1";
  generatedAt: string;
  accounts: VideoPublishAccountCapabilities[];
  unavailableReason: string | null;
}

const PLATFORM_BY_SKILL: Record<string, MuziVideoPlatform | undefined> = {
  xiaohongshu: "xiaohongshu",
  douyin: "douyin",
  bilibili: "bilibili",
  wechat_channels: "wechat",
  wechat: "wechat",
};

function unavailableCapability(reason: string): VideoCapabilityState {
  return { accepted: false, enabled: false, reason, acceptedAt: null, adapterVersion: null };
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function timestamp(value: unknown): string | null {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return null;
  return value;
}

function normalizeCapability(raw: unknown, capability: AcceptanceCapability): VideoCapabilityState {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return unavailableCapability(`能力结果缺少 ${capability} 状态`);
  }
  const value = raw as Record<string, unknown>;
  const accepted = value.accepted === true;
  const enabled = accepted && value.enabled === true;
  const acceptedAt = accepted ? timestamp(value.acceptedAt) : null;
  const adapterVersion = nonEmptyString(value.adapterVersion) ?? null;
  const suppliedReason = nonEmptyString(value.message) ?? nonEmptyString(value.reason);
  if (enabled && acceptedAt !== null && adapterVersion !== null) {
    return { accepted: true, enabled: true, reason: null, acceptedAt, adapterVersion };
  }
  if (enabled && acceptedAt === null) {
    return unavailableCapability(`${capability} 缺少可复核的验收时间`);
  }
  if (enabled && adapterVersion === null) {
    return unavailableCapability(`${capability} 缺少适配器版本，必须重新验收`);
  }
  return {
    accepted,
    enabled: false,
    reason: suppliedReason ?? (accepted ? `${capability} 当前未启用` : `${capability} 尚未完成账号验收`),
    acceptedAt,
    adapterVersion,
  };
}

/**
 * Normalizes the only cross-process capability contract. Any malformed,
 * missing, duplicate, or unverifiable field becomes unavailable; callers must
 * never infer an enabled platform from absence.
 */
export function normalizeVideoPublishCapabilities(raw: unknown, now = new Date().toISOString()): VideoPublishCapabilitiesResult {
  const unavailable = (reason: string): VideoPublishCapabilitiesResult => ({
    schema: "muzi.video-publisher.capabilities/1",
    generatedAt: now,
    accounts: [],
    unavailableReason: reason,
  });
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return unavailable("发布能力结果格式无效");
  const value = raw as Record<string, unknown>;
  if (value.schema !== "muzi.video-publisher.capabilities/1") return unavailable("发布能力结果 schema 不受支持");
  if (!Array.isArray(value.accounts)) return unavailable("发布能力结果缺少账号列表");
  const generatedAt = timestamp(value.generatedAt);
  if (generatedAt === null) return unavailable("发布能力结果缺少生成时间");

  const accounts: VideoPublishAccountCapabilities[] = [];
  const seen = new Set<string>();
  for (const rawAccount of value.accounts) {
    if (typeof rawAccount !== "object" || rawAccount === null || Array.isArray(rawAccount)) return unavailable("发布能力账号记录格式无效");
    const account = rawAccount as Record<string, unknown>;
    const platform = PLATFORM_BY_SKILL[nonEmptyString(account.platform) ?? ""];
    const accountProfile = nonEmptyString(account.accountProfile);
    const displayName = nonEmptyString(account.displayName);
    if (platform === undefined || accountProfile === undefined || displayName === undefined || typeof account.enabled !== "boolean") return unavailable("发布能力账号记录缺少平台、账号、显示名或启用状态");
    const key = `${platform}\u0000${accountProfile}`;
    if (seen.has(key)) return unavailable("发布能力结果包含重复账号");
    seen.add(key);
    const sourceCapabilities = typeof account.capabilities === "object" && account.capabilities !== null && !Array.isArray(account.capabilities)
      ? account.capabilities as Record<string, unknown>
      : {};
    accounts.push({
      platform,
      accountProfile,
      displayName,
      enabled: account.enabled,
      capabilities: Object.fromEntries(VIDEO_ACCEPTANCE_CAPABILITIES.map((capability) => [
        capability,
        normalizeCapability(sourceCapabilities[capability], capability),
      ])) as Record<AcceptanceCapability, VideoCapabilityState>,
    });
  }
  return { schema: "muzi.video-publisher.capabilities/1", generatedAt, accounts, unavailableReason: null };
}

export function capabilityEnabled(
  account: VideoPublishAccountCapabilities | undefined,
  capability: AcceptanceCapability,
): boolean {
  return account?.capabilities[capability].enabled === true;
}
