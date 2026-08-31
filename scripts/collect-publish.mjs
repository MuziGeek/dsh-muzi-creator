// Windows Patchright collector. Run: node scripts/collect-publish.mjs
// Optional: OIL_COLLECT_PLATFORMS, OIL_COLLECT_TARGETS, OIL_COLLECT_SPACE,
// OIL_COLLECT_KEEP, OIL_COLLECT_CLEANUP_STALE, OIL_COLLECT_CLEANUP_NAMES,
// OIL_COLLECT_CLEANUP_PREFIXES, OIL_COLLECT_MAX_PAGES, OIL_COLLECT_XHS_SCROLL,
// OIL_COLLECT_ACCOUNTS, OIL_COLLECT_METRICS_GRANTS.
// Login state is isolated by platform/account under ~/.video-publisher/chrome-profiles.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { chromium } from "patchright";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const platformKey = (platform) => platform === "wechat" ? "wechat_channels" : platform;
const accountProfiles = (() => {
  try {
    const value = JSON.parse(process.env.OIL_COLLECT_ACCOUNTS || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
})();
const metricsGrants = (() => {
  try {
    const value = JSON.parse(process.env.OIL_COLLECT_METRICS_GRANTS || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
})();
let activeBrowser = null;
let activeContext = null;
let activePage = null;
let activeCdp = null;
let activePlatform = null;
let releaseAccount = null;

function safePart(value) {
  return String(value || "default").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36) || "default";
}

function profileKey(platform, account) {
  const hash = crypto.createHash("sha256").update(`${platform}\0${account}`).digest("hex").slice(0, 12);
  return `${safePart(platform)}--${safePart(account)}--${hash}`;
}

function lockName(platform, account) {
  const hash = crypto.createHash("sha256").update(`${platform}\0${account}`).digest("hex").slice(0, 12);
  return `${platform}--${safePart(account).slice(0, 32)}--${hash}.lock`;
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code === "EPERM"; }
}

function acquireAccount(platform, account) {
  const root = path.resolve(process.env.VIDEO_PUBLISHER_ACCOUNT_LOCK_ROOT || path.join(os.homedir(), ".video-publisher", "account-locks"));
  const lockPath = path.join(root, lockName(platform, account));
  fs.mkdirSync(root, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.mkdirSync(lockPath);
      fs.writeFileSync(path.join(lockPath, "owner.json"), JSON.stringify({ pid: process.pid, platform, accountProfile: account, action: "metrics", acquiredAt: new Date().toISOString() }, null, 2));
      return () => fs.rmSync(lockPath, { recursive: true, force: true });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      let owner = {};
      try { owner = JSON.parse(fs.readFileSync(path.join(lockPath, "owner.json"), "utf8")); } catch {}
      if (!processAlive(Number(owner.pid))) { fs.rmSync(lockPath, { recursive: true, force: true }); continue; }
      throw Object.assign(new Error(`Account ${platform}/${account} is busy`), { code: "ACCOUNT_BUSY" });
    }
  }
  throw new Error(`Could not acquire account lock for ${platform}/${account}`);
}

function chromeExecutable() {
  const candidates = process.platform === "win32"
    ? [
      process.env.VIDEO_PUBLISHER_CHROME,
      process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
      process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
    ]
    : process.platform === "darwin"
      ? [process.env.VIDEO_PUBLISHER_CHROME, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
      : [process.env.VIDEO_PUBLISHER_CHROME, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium"];
  const found = candidates.filter(Boolean).find((candidate) => fs.existsSync(candidate));
  if (!found) throw Object.assign(new Error("Google Chrome not found; set VIDEO_PUBLISHER_CHROME"), { code: "CHROME_NOT_FOUND" });
  return path.resolve(found);
}

function devToolsPort(profileDir) {
  try {
    const port = Number(fs.readFileSync(path.join(profileDir, "DevToolsActivePort"), "utf8").split(/\r?\n/)[0]);
    return Number.isInteger(port) && port > 0 ? port : null;
  } catch { return null; }
}

async function endpointAlive(port) {
  if (!port) return false;
  try { return (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1200) })).ok; } catch { return false; }
}

async function ensureChrome(profileDir, platform, account) {
  fs.mkdirSync(profileDir, { recursive: true });
  let port = devToolsPort(profileDir);
  if (await endpointAlive(port)) return port;
  const executable = chromeExecutable();
  const child = spawn(executable, [
    `--user-data-dir=${profileDir}`,
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=0",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-mode",
    "--new-window",
    "about:blank",
  ], { detached: true, stdio: "ignore", windowsHide: false });
  if (!child.pid) throw new Error("Chrome did not provide a PID");
  child.unref();
  try {
    const started = Date.now();
    while (Date.now() - started < 20_000) {
      if (!processAlive(child.pid)) throw new Error(`Chrome exited before ready for ${platform}/${account}`);
      port = devToolsPort(profileDir);
      if (await endpointAlive(port)) return port;
      await sleep(250);
    }
    throw new Error(`Chrome debugging endpoint timed out for ${platform}/${account}`);
  } catch (cause) {
    if (processAlive(child.pid)) process.kill(child.pid, "SIGTERM");
    throw cause;
  }
}

async function disconnectActive() {
  if (activeCdp) await activeCdp.detach().catch(() => undefined);
  activeCdp = null;
  const connection = activeBrowser?._connection;
  if (connection && typeof connection.close === "function") await Promise.resolve(connection.close()).catch(() => undefined);
  activeBrowser = null;
  activeContext = null;
  activePage = null;
  activePlatform = null;
  if (releaseAccount) releaseAccount();
  releaseAccount = null;
}

async function connectPlatform(platform) {
  const key = platformKey(platform);
  if (activePlatform === key && activePage && !activePage.isClosed()) return;
  await disconnectActive();
  const account = String(accountProfiles[platform] || accountProfiles[key] || "default").trim() || "default";
  const grantedAccount = String(metricsGrants[platform] || metricsGrants[key] || "").trim();
  if (grantedAccount === "" || grantedAccount !== account) {
    throw Object.assign(new Error(`${key}/${account} has no current account-bound metrics grant`), { code: "METRICS_GRANT_REQUIRED" });
  }
  releaseAccount = acquireAccount(key, account);
  const profileRoot = path.resolve(process.env.VIDEO_PUBLISHER_PROFILE_ROOT || path.join(os.homedir(), ".video-publisher", "chrome-profiles"));
  const profileDir = path.join(profileRoot, profileKey(key, account));
  const port = await ensureChrome(profileDir, key, account);
  activeBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  activeContext = activeBrowser.contexts()[0];
  if (!activeContext) throw new Error("Patchright connected without a default context");
  activePage = activeContext.pages().find((page) => !page.isClosed()) || await activeContext.newPage();
  activePlatform = key;
}

async function useOrCreateTaskSpace(name) {
  return { id: Number.parseInt(crypto.createHash("sha256").update(String(name)).digest("hex").slice(0, 7), 16), name };
}
async function completeTaskSpace() { await disconnectActive(); }
async function listTaskSpaces() { return []; }
async function openOrReuseTab(url, options = {}) {
  const page = PAGES.find((row) => new URL(row.url).hostname === new URL(url).hostname);
  if (!page) throw new Error(`Unknown collector page: ${url}`);
  await connectPlatform(page.platform);
  const existing = activeContext.pages().find((candidate) => {
    try { return new URL(candidate.url()).hostname === new URL(url).hostname; } catch { return false; }
  });
  if (existing) activePage = existing;
  else activePage = await activeContext.newPage();
  await activePage.bringToFront();
  if (activePage.url() !== url) await activePage.goto(url, { waitUntil: "domcontentloaded", timeout: (options.timeout || 35) * 1000 });
}
async function gotoAndWait(url, options = {}) {
  await openOrReuseTab(url, options);
  if (options.settle) await sleep(Number(options.settle) * 1000);
}
async function js(expression) { return activePage.evaluate(expression); }
async function cdp(method, params = {}) {
  if (!activeCdp) activeCdp = await activeContext.newCDPSession(activePage);
  return activeCdp.send(method, params);
}
async function wait(seconds) { await sleep(Number(seconds) * 1000); }
async function scroll({ dx = 0, dy = 0 } = {}) { await activePage.mouse.wheel(dx, dy); }
function cliLog(value) { console.log(String(value)); }

const PAGES = [
  { platform: "xiaohongshu", url: "https://creator.xiaohongshu.com/new/note-manager" },
  { platform: "douyin", url: "https://creator.douyin.com/creator-micro/content/manage" },
  { platform: "bilibili", url: "https://member.bilibili.com/platform/upload-manager/article" },
  { platform: "wechat", url: "https://channels.weixin.qq.com/platform/post/list" },
];

function envText(name, fallback) {
  if (typeof globalThis[name] === "string" && globalThis[name] !== "") return globalThis[name];
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

const MAX_PAGES = Math.max(1, Number(envText("OIL_COLLECT_MAX_PAGES", "80")) || 80);
const XHS_SCROLL_STEPS = Math.max(1, Number(envText("OIL_COLLECT_XHS_SCROLL", "80")) || 80);

const wanted = String(
  typeof OIL_COLLECT_PLATFORMS === "string" ? OIL_COLLECT_PLATFORMS : (process.env.OIL_COLLECT_PLATFORMS ?? ""),
)
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const pages = wanted.length === 0 ? PAGES : PAGES.filter((page) => wanted.includes(page.platform));

function parseTargets(raw) {
  if (Array.isArray(raw)) return raw.filter((item) => item && typeof item.title === "string");
  if (typeof raw !== "string" || raw.trim() === "") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.title === "string") : [];
  } catch {
    return [];
  }
}

const targets = parseTargets(
  typeof OIL_COLLECT_TARGETS !== "undefined" ? OIL_COLLECT_TARGETS : process.env.OIL_COLLECT_TARGETS,
);

function hitsStrongTarget(item) {
  if (targets.length === 0) return false;
  return targets.some((target) => {
    if (target.platform && platformKey(target.platform) !== activePlatform) return false;
    const remoteIds = Array.isArray(target.remoteIds) ? target.remoteIds : [];
    const urls = Array.isArray(target.urls) ? target.urls : [];
    if (item.remoteId && remoteIds.includes(item.remoteId)) return true;
    if (item.url && urls.includes(item.url)) return true;
    return false;
  });
}

function foundTargets(items) {
  // A remote id or URL is unique enough to stop pagination. A title is not:
  // first-time title binding must scan the complete list so duplicates can be
  // reported as AMBIGUOUS instead of silently binding the first result.
  return targets.length > 0 && (items || []).some(hitsStrongTarget);
}

const HOOK = `(() => {
  if (window.__oilCollectHook) return;
  window.__oilCollectHook = true;
  window.__OIL_COLLECT__ = [];
  const push = (url, text) => {
    window.__OIL_COLLECT__.push({ url: String(url), text: String(text || "").slice(0, 900000) });
  };
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      const req = args[0];
      const url = typeof req === "string" ? req : (req && req.url) || "";
      push(url, await res.clone().text());
    } catch {}
    return res;
  };
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__oilUrl = url;
    return origOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("load", function () {
      try { push(this.__oilUrl, this.responseText); } catch {}
    });
    return origSend.apply(this, args);
  };
})()`;

function firstLine(value) {
  return String(value || "").split(/\n/)[0].trim();
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = item.remoteId || item.url || item.title;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function parseDouyinPayload(payload) {
  const list = payload?.aweme_list;
  if (!Array.isArray(list)) return [];
  return list.flatMap((aweme) => {
    const title = firstLine(aweme.item_title || aweme.desc || "");
    if (!title) return [];
    const id = aweme.aweme_id ? String(aweme.aweme_id) : "";
    const stats = aweme.statistics || {};
    const item = { title };
    if (id) item.remoteId = id;
    if (typeof aweme.share_url === "string" && aweme.share_url.startsWith("http")) item.url = aweme.share_url;
    else if (id) item.url = `https://www.douyin.com/video/${id}`;
    const views = num(stats.play_count);
    const likes = num(stats.digg_count);
    const comments = num(stats.comment_count);
    if (views !== undefined) item.views = views;
    if (likes !== undefined) item.likes = likes;
    if (comments !== undefined) item.comments = comments;
    return [item];
  });
}

function parseBiliPayload(payload) {
  const list = payload?.data?.arc_audits;
  if (!Array.isArray(list)) return [];
  return list.flatMap((row) => {
    const arc = row.Archive || {};
    const title = firstLine(arc.title);
    if (!title) return [];
    const bvid = arc.bvid ? String(arc.bvid) : "";
    const stat = row.stat || {};
    const item = { title };
    if (bvid) {
      item.remoteId = bvid;
      item.url = `https://www.bilibili.com/video/${bvid}`;
    }
    if (Number.isFinite(Number(stat.view))) item.views = Number(stat.view);
    if (Number.isFinite(Number(stat.like))) item.likes = Number(stat.like);
    if (Number.isFinite(Number(stat.reply))) item.comments = Number(stat.reply);
    return [item];
  });
}

function parseWechatPayload(payload) {
  const list = payload?.data?.list;
  if (!Array.isArray(list)) return [];
  return list.flatMap((row) => {
    const title = firstLine(row?.desc?.description) || "未填写标题";
    const id = row.objectId ? String(row.objectId) : "";
    const item = { title };
    if (id) {
      item.remoteId = id;
      item.url = "https://channels.weixin.qq.com/platform/post/list";
    }
    if (Number.isFinite(Number(row.readCount))) item.views = Number(row.readCount);
    if (Number.isFinite(Number(row.likeCount))) item.likes = Number(row.likeCount);
    if (Number.isFinite(Number(row.commentCount))) item.comments = Number(row.commentCount);
    return [item];
  });
}

async function pageJson(expression) {
  const answer = await cdp("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (answer?.exceptionDetails) {
    const detail = answer.exceptionDetails.exception?.description || answer.exceptionDetails.text;
    throw new Error(detail || "evaluate failed");
  }
  return answer?.result?.value;
}

async function activateWechat() {
  await cdp("Page.bringToFront", {});
  await cdp("Page.setWebLifecycleState", { state: "active" });
  await cdp("Emulation.setFocusEmulationEnabled", { enabled: true });
}

async function hookTab() {
  await cdp("Page.addScriptToEvaluateOnNewDocument", { source: HOOK });
  await js(HOOK);
}

function pageLooksLoggedOut(text, href) {
  const body = String(text || "");
  const login = /登录|掃碼|扫码登录|请先登录|尚未登录/.test(body)
    && !/作品管理|笔记管理|已发布|稿件管理|发表记录|视频管理|内容管理/.test(body);
  return login || /login\.html/.test(String(href || ""));
}

async function xhsState() {
  return js(String.raw`(() => {
    const rows = window.__OIL_COLLECT__ || [];
    const byId = new Map();
    let total = 0;
    for (const row of rows) {
      if (!String(row.url).includes("/creator/note/user/posted")) continue;
      let json;
      try { json = JSON.parse(row.text); } catch { continue; }
      const notes = json && json.data && json.data.notes;
      if (Array.isArray(notes)) {
        for (const note of notes) {
          const title = String(note.display_title || note.title || "").split(/\n/)[0].trim();
          if (!title) continue;
          const id = note.id ? String(note.id) : title;
          const token = note.xsec_token ? String(note.xsec_token) : "";
          const item = { title };
          if (note.id) {
            item.remoteId = String(note.id);
            item.url = token
              ? "https://www.xiaohongshu.com/explore/" + note.id + "?xsec_token=" + encodeURIComponent(token)
              : "https://www.xiaohongshu.com/explore/" + note.id;
          }
          const views = Number(note.view_count);
          const likes = Number(note.likes);
          const comments = Number(note.comments_count);
          if (Number.isFinite(views)) item.views = views;
          if (Number.isFinite(likes)) item.likes = likes;
          if (Number.isFinite(comments)) item.comments = comments;
          byId.set(id, item);
        }
      }
      const tags = json && json.data && json.data.tags;
      const checked = Array.isArray(tags) ? tags.find((tag) => tag && tag.checked) : undefined;
      if (checked && Number.isFinite(Number(checked.notes_count))) total = Number(checked.notes_count);
    }
    const text = (document.body && document.body.innerText) || "";
    const login = /登录|掃碼|扫码登录|请先登录|尚未登录/.test(text)
      && !/作品管理|笔记管理|已发布|稿件管理|发表记录|视频管理|内容管理/.test(text);
    return {
      items: [...byId.values()],
      n: byId.size,
      total,
      loginRequired: byId.size === 0 && login,
      loading: /正在加载中/.test(text),
    };
  })()`);
}

async function scrollXhsList() {
  await js(String.raw`(() => {
    const el = [...document.querySelectorAll("*")].filter((node) => {
      const style = getComputedStyle(node);
      return (style.overflowY === "auto" || style.overflowY === "scroll")
        && node.scrollHeight > node.clientHeight + 80;
    }).sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    if (el) el.scrollTop = el.scrollHeight;
    else window.scrollTo(0, document.documentElement.scrollHeight);
  })()`);
  try { await scroll({ dy: 1800 }); } catch { /* page may ignore wheel */ }
}

async function collectXiaohongshu(url) {
  await hookTab();
  let state = await xhsState();
  if (state.n === 0) {
    await gotoAndWait(url, { timeout: 40, settle: 2 });
    await hookTab();
    const started = Date.now();
    while (Date.now() - started < 12_000) {
      state = await xhsState();
      if (state.loginRequired || state.n > 0) break;
      await wait(1);
    }
  }
  if (state.loginRequired) return { items: [], loginRequired: true, paginationComplete: false };

  let last = state.n;
  let stall = 0;
  let paginationComplete = false;
  for (let step = 0; step < XHS_SCROLL_STEPS; step += 1) {
    if (foundTargets(state.items)) { paginationComplete = true; break; }
    if (state.total > 0 && state.n >= state.total && !state.loading) { paginationComplete = true; break; }
    await scrollXhsList();
    await wait(1.1);
    state = await xhsState();
    if (state.n <= last) {
      stall += 1;
      if (stall >= 5 && !state.loading) { paginationComplete = true; break; }
    } else {
      stall = 0;
      last = state.n;
    }
  }
  return { items: dedupe(state.items || []), loginRequired: false, paginationComplete };
}

async function collectDouyin() {
  const items = [];
  let cursor = 0;
  let total = Number.POSITIVE_INFINITY;
  let paginationComplete = false;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const payload = await pageJson(`fetch("/janus/douyin/creator/pc/work_list?status=0&count=20&max_cursor=${cursor}&scene=star_atlas&device_platform=android&aid=1128", {
      credentials: "include"
    }).then(async (r) => ({ http: r.status, json: await r.json() }))`);
    const json = payload?.json;
    if (payload?.http && payload.http >= 400) break;
    const batch = parseDouyinPayload(json);
    items.push(...batch);
    if (foundTargets(items)) { paginationComplete = true; break; }
    if (typeof json?.total === "number") total = json.total;
    const hasMore = json?.has_more === true || json?.has_more === 1;
    const next = Number(json?.max_cursor);
    if (batch.length === 0 || !hasMore || items.length >= total) { paginationComplete = true; break; }
    if (!Number.isFinite(next) || next === cursor) break;
    cursor = next;
  }
  if (items.length > 0 || paginationComplete) return { items: dedupe(items), loginRequired: false, paginationComplete };

  await hookTab();
  const started = Date.now();
  while (Date.now() - started < 12_000) {
    const hooked = await js(String.raw`(() => {
      const rows = (window.__OIL_COLLECT__ || []).filter((row) => String(row.url).includes("/work_list"));
      const text = (document.body && document.body.innerText) || "";
      const login = /登录|掃碼|扫码登录|请先登录|尚未登录/.test(text)
        && !/作品管理|笔记管理|已发布|稿件管理|发表记录|视频管理|内容管理/.test(text);
      const byId = new Map();
      for (const row of rows) {
        let json;
        try { json = JSON.parse(row.text); } catch { continue; }
        const list = json && json.aweme_list;
        if (!Array.isArray(list)) continue;
        for (const aweme of list) {
          const title = String(aweme.item_title || aweme.desc || "").split(/\n/)[0].trim();
          if (!title) continue;
          const id = aweme.aweme_id ? String(aweme.aweme_id) : title;
          const stats = aweme.statistics || {};
          const item = { title };
          if (aweme.aweme_id) item.remoteId = String(aweme.aweme_id);
          if (typeof aweme.share_url === "string" && aweme.share_url.startsWith("http")) item.url = aweme.share_url;
          else if (aweme.aweme_id) item.url = "https://www.douyin.com/video/" + aweme.aweme_id;
          const views = Number(stats.play_count);
          const likes = Number(stats.digg_count);
          const comments = Number(stats.comment_count);
          if (Number.isFinite(views)) item.views = views;
          if (Number.isFinite(likes)) item.likes = likes;
          if (Number.isFinite(comments)) item.comments = comments;
          byId.set(id, item);
        }
      }
      return { items: [...byId.values()], loginRequired: byId.size === 0 && login };
    })()`);
    if (hooked?.loginRequired) return { ...hooked, paginationComplete: false };
    if (Array.isArray(hooked?.items) && hooked.items.length > 0) {
      return { ...hooked, paginationComplete: foundTargets(hooked.items) };
    }
    await wait(1);
  }
  return { items: [], loginRequired: false, paginationComplete: false };
}

async function collectBilibili() {
  const items = [];
  let expected = Number.POSITIVE_INFINITY;
  let paginationComplete = false;
  for (let pn = 1; pn <= MAX_PAGES; pn += 1) {
    const payload = await pageJson(`fetch("/x/web/archives?status=pubed&pn=${pn}&ps=30&coop=1&interactive=1", {
      credentials: "include"
    }).then((r) => r.json())`);
    const batch = parseBiliPayload(payload);
    items.push(...batch);
    if (foundTargets(items)) { paginationComplete = true; break; }
    const count = payload?.data?.page?.count ?? payload?.data?.class?.pubed;
    if (typeof count === "number") expected = count;
    if (batch.length === 0 || items.length >= expected) { paginationComplete = true; break; }
  }
  return { items: dedupe(items), loginRequired: false, paginationComplete };
}

async function collectWechat() {
  const items = [];
  let expected = Number.POSITIVE_INFINITY;
  let paginationComplete = false;
  for (let currentPage = 1; currentPage <= MAX_PAGES; currentPage += 1) {
    const payload = await pageJson(`fetch("/cgi-bin/mmfinderassistant-bin/post/post_list", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPage: ${currentPage}, pageSize: 20 })
    }).then((r) => r.json())`);
    const batch = parseWechatPayload(payload);
    items.push(...batch);
    if (foundTargets(items)) { paginationComplete = true; break; }
    if (typeof payload?.data?.totalCount === "number") expected = payload.data.totalCount;
    const cont = payload?.data?.continueFlag;
    if (batch.length === 0 || cont === false || items.length >= expected) { paginationComplete = true; break; }
  }
  return { items: dedupe(items), loginRequired: false, paginationComplete };
}

function csvNames(raw) {
  return String(raw || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const keepSpace = envText("OIL_COLLECT_KEEP", "0") === "1";
const cleanupStale = envText("OIL_COLLECT_CLEANUP_STALE", "1") !== "0";
const spaceName = envText("OIL_COLLECT_SPACE", "") || `oil-collect-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const leftoverNames = new Set(["oil-collect-publish", ...csvNames(envText("OIL_COLLECT_CLEANUP_NAMES", ""))]);
const leftoverPrefixes = csvNames(envText("OIL_COLLECT_CLEANUP_PREFIXES", ""));
const task = await useOrCreateTaskSpace(spaceName);
const collected = [];
let spaceClosed = keepSpace;
try {
  for (const page of pages) {
    try {
      if (page.platform === "wechat") await activateWechat();
      await openOrReuseTab(page.url, { wait: true, timeout: 35 });
      if (page.platform === "wechat") await activateWechat();
      await hookTab();

      const text = await js(`(document.body && document.body.innerText) || ""`);
      const href = await js(`location.href`);
      if (pageLooksLoggedOut(text, href)) {
        collected.push({ platform: page.platform, items: [], loginRequired: true });
        continue;
      }

      let extracted = { items: [], loginRequired: false };
      if (page.platform === "xiaohongshu") extracted = await collectXiaohongshu(page.url);
      else if (page.platform === "douyin") extracted = await collectDouyin();
      else if (page.platform === "bilibili") extracted = await collectBilibili();
      else if (page.platform === "wechat") {
        await activateWechat();
        extracted = await collectWechat();
      }

      collected.push({
        platform: page.platform,
        items: Array.isArray(extracted?.items) ? extracted.items : [],
        loginRequired: extracted?.loginRequired === true,
        ...(extracted?.loginRequired !== true && extracted?.paginationComplete === false
          ? { error: `PAGINATION_INCOMPLETE: ${page.platform} reached its collection limit before a complete result` }
          : {}),
      });
    } catch (cause) {
      collected.push({
        platform: page.platform,
        items: [],
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }
} finally {
  if (!keepSpace) {
    try {
      await completeTaskSpace(task.id, { keep: false });
      spaceClosed = true;
    } catch {
      spaceClosed = false;
    }
  } else {
    // Chrome itself is independently launched and remains available for login
    // review. Always detach the collector client and release the account lock.
    try {
      await disconnectActive();
      spaceClosed = true;
    } catch {
      spaceClosed = false;
    }
  }
  if (cleanupStale && typeof listTaskSpaces === "function") {
    try {
      const spaces = await listTaskSpaces();
      for (const space of spaces || []) {
        const name = String(space.name || "");
        if (space.ownership === "user") continue;
        if (keepSpace && space.id === task.id) continue;
        const current = !spaceClosed && (space.id === task.id || name === spaceName || name === task.name);
        const named = leftoverNames.has(name);
        const prefixed = leftoverPrefixes.some((prefix) => name === prefix || name.startsWith(prefix));
        if (!current && !named && !prefixed) continue;
        try {
          await completeTaskSpace(space.id, { keep: false });
          if (space.id === task.id) spaceClosed = true;
        } catch { /* ignore stale close errors */ }
      }
    } catch { /* listing spaces is best-effort */ }
  }
}
cliLog(JSON.stringify({
  ok: true,
  taskId: task.id,
  taskSpace: task.name || spaceName,
  collected,
  spaceClosed,
}));
