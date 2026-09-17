import { WorkbenchIcon } from "./ui/WorkbenchIcon.tsx";
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";

import type { GithubSourceFace } from "./face.ts";
import type { GithubSourceRequest, GithubSourceResult, GithubSourceTarget } from "../githubSourceSchemas.ts";
import type { GithubRepository } from "../trellisGithubSchemas.ts";
import type { CreatorKey } from "./locales.ts";
import { IslandButton, IslandInput, IslandSelect, IslandState } from "./ui/IslandControls.tsx";
import "./GithubSourceSettings.css";

/** Configures one read-only GitHub snapshot source for a workbench root. */
export function GithubSourceSettings({
  face,
  target,
  t,
  children,
}: {
  face: Pick<GithubSourceFace, "github">;
  target: GithubSourceTarget;
  t: (key: CreatorKey) => string;
  children?: ReactNode;
}) {
  const [status, setStatus] = useState<GithubSourceResult | null>(null);
  const [query, setQuery] = useState("");
  const [repositories, setRepositories] = useState<GithubRepository[] | null>(null);
  const [repository, setRepository] = useState("");
  const [branches, setBranches] = useState<string[] | null>(null);
  const [branch, setBranch] = useState("");
  const [action, setAction] = useState<GithubSourceRequest["action"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const label = t((target === "creator" ? "githubSource.creator" : "githubSource.knowledge") as CreatorKey);

  const request = async (input: GithubSourceRequest): Promise<GithubSourceResult | undefined> => {
    if (inFlight.current || !face.github) return undefined;
    inFlight.current = true;
    setAction(input.action);
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await face.github(input);
      if (!alive.current) return undefined;
      setStatus(result);
      setNotice(result.message ?? null);
      if (result.selection !== null) {
        setRepository(`${result.selection.owner}/${result.selection.repo}`);
        setBranch(result.selection.branch);
      }
      return result;
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : t("githubSource.failed" as CreatorKey));
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
    return undefined;
  };

  useEffect(() => {
    alive.current = true;
    void request({ target, action: "status" });
    return () => {
      alive.current = false;
    };
  }, [face, target]);

  const browse = async () => {
    setRepositories(null);
    setRepository("");
    setBranches(null);
    setBranch("");
    const result = await request({ target, action: "browse", query });
    if (result) setRepositories(result.repositories ?? []);
  };

  const choose = async (name: string) => {
    setRepository(name);
    setBranches(null);
    setBranch("");
    const result = await request({ target, action: "branches", repository: name });
    if (result) {
      const options = result.branches ?? [];
      setBranches(options);
      const preferred = repositories?.find((item) => item.fullName === name)?.defaultBranch;
      setBranch(preferred && options.includes(preferred) ? preferred : options[0] ?? "");
    }
  };

  return <div className="githubSourceSettings settingsSourceControls" aria-busy={busy}>
    <IslandSelect
      aria-label={label}
      value={status?.mode ?? "local"}
      disabled={busy || status === null}
      options={[{ key: "github", label: t("githubSource.remote" as CreatorKey) }, { key: "local", label: t("githubSource.local" as CreatorKey) }]}
      onChange={(value: string | number) => { void request({ target, action: "mode", mode: value === "github" ? "github" : "local" }); }}
    />
    {status?.mode === "local" && <>
      <p>{t("githubSource.localSettingsHint" as CreatorKey)}</p>
      {children}
    </>}
    {status?.mode === "github" && <>
      <p>{t("githubSource.settingsHint" as CreatorKey)}</p>
      <p>{t("githubSource.remoteHint" as CreatorKey)}</p>
      <form onSubmit={(event) => { event.preventDefault(); void browse(); }}>
        <span>{t("githubSource.query" as CreatorKey)}</span>
        <IslandInput
          aria-label={t("githubSource.query" as CreatorKey)}
          placeholder="https://github.com/owner/repository"
          value={query}
          disabled={busy}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            setQuery(event.target.value);
            setRepositories(null);
            setRepository("");
            setBranches(null);
            setBranch("");
          }}
        />
        <IslandButton icon={<WorkbenchIcon name="search" />} htmlType="submit" size="small" disabled={busy || status === null} loading={busy && action === "browse"}>
          {t("githubSource.search" as CreatorKey)}
        </IslandButton>
      </form>
      {repositories !== null && repositories.length === 0 && <IslandState kind="empty" title={t("githubSource.empty" as CreatorKey)} />}
      {repositories !== null && repositories.length > 0 && <>
        <IslandSelect
          aria-label={t("githubSource.repository" as CreatorKey)}
          placeholder={t("githubSource.repository" as CreatorKey)}
          value={repository}
          disabled={busy}
          options={repositories.map((item) => ({ key: item.fullName, label: `${item.fullName}${item.private ? " · private" : ""}` }))}
          onChange={(value: string | number) => { void choose(String(value)); }}
        />
        {branches !== null && branches.length === 0 && <p>{t("githubSource.noBranches" as CreatorKey)}</p>}
        {branches !== null && branches.length > 0 && <IslandSelect
          aria-label={t("githubSource.branch" as CreatorKey)}
          value={branch}
          disabled={busy}
          options={branches.map((name) => ({ key: name, label: name }))}
          onChange={(value: string | number) => { setBranch(String(value)); }}
        />}
        <IslandButton icon={<WorkbenchIcon name="add" />} size="small" loading={busy && action === "connect"} disabled={busy || !repository || !branch} onClick={() => { void request({ target, action: "connect", repository, branch }); }}>
          {t("githubSource.connect" as CreatorKey)}
        </IslandButton>
      </>}
      {status.snapshot !== null && <div className="githubSourceSnapshot">
        <span className="githubSourceSnapshotTitle">{t("githubSource.snapshot" as CreatorKey)}</span>
        <code>{status.snapshot.sha}</code>
        <span>{status.snapshot.branch} · {status.snapshot.fileCount} files · {status.snapshot.bytes} bytes</span>
        {status.snapshot.stale && <span>{t("githubSource.stale" as CreatorKey)}</span>}
      </div>}
      {status.snapshot === null && <p>{t("githubSource.snapshotEmpty" as CreatorKey)}</p>}
      <div className="githubSourceActions">
        <IslandButton icon={<WorkbenchIcon name="refresh" />} size="small" disabled={busy || status.snapshot === null} loading={busy && action === "refresh"} onClick={() => { void request({ target, action: "refresh" }); }}>
          {t("githubSource.refresh" as CreatorKey)}
        </IslandButton>
        {status.selection !== null && <IslandButton icon={<WorkbenchIcon name="disconnect" />} type="text" size="small" disabled={busy} onClick={() => { void request({ target, action: "remove" }); }}>
          {t("githubSource.remove" as CreatorKey)}
        </IslandButton>}
      </div>
      <p className="githubSourceReadonly">{t("githubSource.readOnly" as CreatorKey)}</p>
      <div className="githubSourceAuth">
        {status.connected ? <>
          <p>{t("githubSource.bound" as CreatorKey)}</p>
          <IslandButton icon={<WorkbenchIcon name="disconnect" />} type="text" size="small" disabled={busy} onClick={() => { void request({ target, action: "disconnect" }); }}>
            {t("githubSource.unbind" as CreatorKey)}
          </IslandButton>
        </> : <>
          <IslandButton icon={<WorkbenchIcon name="connect" />} size="small" disabled={busy || !status.authAvailable} onClick={() => { void request({ target, action: "beginAuth" }); }}>
            {t("githubSource.bind" as CreatorKey)}
          </IslandButton>
          {!status.authAvailable && <p>{t("githubSource.setup" as CreatorKey)}</p>}
        </>}
        {status.pending && <div className="githubSourceDevice" role="status">
          <code>{status.pending.userCode}</code>
          <a href="https://github.com/login/device" target="_blank" rel="noreferrer"><WorkbenchIcon name="external-link" />{t("githubSource.device" as CreatorKey)}</a>
          <p>{t("githubSource.pending" as CreatorKey)} {new Date(status.pending.expiresAt).toLocaleTimeString()}</p>
          <IslandButton icon={<WorkbenchIcon name="verify" />} size="small" disabled={busy} onClick={() => { void request({ target, action: "pollAuth" }); }}>
            {t("githubSource.check" as CreatorKey)}
          </IslandButton>
        </div>}
      </div>
      {busy && (action === "connect" || action === "refresh") && <p role="status">{t("githubSource.syncing" as CreatorKey)}</p>}
    </>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
  </div>;
}
