import { WorkbenchIcon } from "./ui/WorkbenchIcon.tsx";
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import type { GithubRepository, GithubRequest, GithubResult } from "../trellisGithubSchemas.ts";
import type { TrellisViewFace } from "./face.ts";
import type { CreatorKey } from "./locales.ts";
import { IslandButton, IslandInput, IslandSelect, IslandState } from "./ui/IslandControls.tsx";
import "./TrellisGithubSources.css";

/** Project source controls apply changes immediately, independently of the settings draft. */
export function TrellisGithubSources({ face, t, children }: { face: Pick<TrellisViewFace, "github">; t: (key: CreatorKey) => string; children?: ReactNode }) {
  const [status, setStatus] = useState<GithubResult | null>(null);
  const [query, setQuery] = useState("");
  const [repositories, setRepositories] = useState<GithubRepository[] | null>(null);
  const [repository, setRepository] = useState("");
  const [branches, setBranches] = useState<string[] | null>(null);
  const [branch, setBranch] = useState("");
  const [action, setAction] = useState<GithubRequest["action"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const request = async (input: GithubRequest): Promise<GithubResult | undefined> => {
    if (inFlight.current || !face.github) return undefined;
    inFlight.current = true; setAction(input.action); setBusy(true); setError(null); setNotice(null);
    try {
      const result = await face.github(input);
      if (!alive.current) return undefined;
      setStatus(result); setNotice(result.message ?? null);
      return result;
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : t("github.failed")); }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
    return undefined;
  };
  useEffect(() => {
    alive.current = true;
    void request({ action: "status" });
    return () => { alive.current = false; };
  }, [face]);

  const browse = async () => {
    setRepositories(null); setRepository(""); setBranches(null); setBranch("");
    const result = await request({ action: "browse", query });
    if (result) setRepositories(result.repositories ?? []);
  };
  const choose = async (name: string) => {
    setRepository(name); setBranches(null); setBranch("");
    const result = await request({ action: "branches", repository: name });
    if (result) {
      const options = result.branches ?? [];
      setBranches(options);
      const preferred = repositories?.find((item) => item.fullName === name)?.defaultBranch;
      setBranch(preferred && options.includes(preferred) ? preferred : options[0] ?? "");
    }
  };
  return <div className="trellisGithubSources" aria-busy={busy}>
    <IslandSelect aria-label={t("github.sources")} value={status?.mode ?? "local"} disabled={busy || !status}
      options={[{ key: "github", label: t("github.remote") }, { key: "local", label: t("github.local") }]}
      onChange={(value: string | number) => { void request({ action: "mode", mode: value === "github" ? "github" : "local" }); }} />
    {status?.mode === "local" && <>
      <p>{t("github.localSettingsHint")}</p>
      {children}
    </>}
    {status?.mode === "github" && <>
      <p>{t("github.settingsHint")}</p>
      <p>{t("github.hint")}</p>
      <form onSubmit={(event) => { event.preventDefault(); void browse(); }}>
        <span>{t("github.query")}</span>
        <IslandInput aria-label={t("github.query")} placeholder="https://github.com/owner/repository" value={query} disabled={busy}
          onChange={(event: ChangeEvent<HTMLInputElement>) => { setQuery(event.target.value); setRepositories(null); setRepository(""); setBranches(null); setBranch(""); }} />
        <IslandButton icon={<WorkbenchIcon name="search" />} htmlType="submit" size="small" disabled={busy || !status} loading={busy && action === "browse"}>{t("github.search")}</IslandButton>
      </form>
      {repositories !== null && repositories.length === 0 && <IslandState kind="empty" title={t("github.empty")} />}
      {repositories !== null && repositories.length > 0 && <>
        <IslandSelect aria-label={t("github.repository")} placeholder={t("github.repository")} value={repository} disabled={busy}
          options={repositories.map((item) => ({ key: item.fullName, label: `${item.fullName}${item.private ? " · private" : ""}` }))}
          onChange={(value: string | number) => { void choose(String(value)); }} />
        {branches !== null && branches.length === 0 && <p>{t("github.noBranches")}</p>}
        {branches !== null && branches.length > 0 && <IslandSelect aria-label={t("github.branch")} value={branch} disabled={busy}
          options={branches.map((name) => ({ key: name, label: name }))} onChange={(value: string | number) => { setBranch(String(value)); }} />}
        <IslandButton icon={<WorkbenchIcon name="add" />} size="small" loading={busy && action === "connect"} disabled={busy || !repository || !branch} onClick={() => { void request({ action: "connect", repository, branch }); }}>{t("github.add")}</IslandButton>
      </>}
      {status && <div className="trellisGithubAuth">
        {status.connected ? <><p>{t("github.bound")}</p><IslandButton icon={<WorkbenchIcon name="disconnect" />} type="text" size="small" disabled={busy} onClick={() => { setRepositories(null); setBranches(null); setBranch(""); void request({ action: "disconnect" }); }}>{t("github.unbind")}</IslandButton></>
          : <><IslandButton icon={<WorkbenchIcon name="connect" />} size="small" disabled={busy || !status.authAvailable} onClick={() => { void request({ action: "beginAuth" }); }}>{t("github.bind")}</IslandButton>{!status.authAvailable && <p>{t("github.setup")}</p>}</>}
        {status.pending && <div className="trellisGithubDevice" role="status">
          <code>{status.pending.userCode}</code>
          <a href="https://github.com/login/device" target="_blank" rel="noreferrer"><WorkbenchIcon name="external-link" />{t("github.device")}</a>
          <p>{t("github.pending")} {new Date(status.pending.expiresAt).toLocaleTimeString()}</p>
          <IslandButton icon={<WorkbenchIcon name="verify" />} size="small" disabled={busy} onClick={() => { void request({ action: "pollAuth" }); }}>{t("github.check")}</IslandButton>
        </div>}
      </div>}
      {busy && action === "connect" && <p role="status">{t("github.syncing")}</p>}
    </>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
  </div>;
}
