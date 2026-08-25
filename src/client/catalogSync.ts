import { bumpLibrary } from "./contentSelection.ts";

export const LIBRARY_POLL_MS = 1000;

export function startLibraryLiveSync(
  readRevision: () => Promise<string | number>,
  intervalMs = LIBRARY_POLL_MS,
  onChange: () => void = bumpLibrary,
): () => void {
  let last: string | number | undefined;
  let inFlight = false;
  let stopped = false;

  const tick = async (): Promise<void> => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const revision = await readRevision();
      if (stopped) return;
      if (last === undefined) {
        last = revision;
        if (typeof revision === "number" && revision > 0) onChange();
        return;
      }
      if (revision !== last) {
        last = revision;
        onChange();
      }
    } catch {
      // Remote may not be mounted yet.
    } finally {
      inFlight = false;
    }
  };

  void tick();
  const timer = globalThis.setInterval(() => {
    void tick();
  }, intervalMs);
  return () => {
    stopped = true;
    globalThis.clearInterval(timer);
  };
}
