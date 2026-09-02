/** Minimal workspace picker surface used outside DSH Desktop. */
export interface UiWorkspaceDirectoryPicker {
  pickDirectory: () => Promise<string | null>;
}

/** Window fields published by the DSH Desktop Windows shell. */
export interface DesktopDirectoryPickerTarget {
  location: Pick<Location, "search">;
  __DSH_DESKTOP_PICK_DIRECTORY__?: () => Promise<string | null>;
}

/**
 * Opens the directory picker supported by the current client host.
 *
 * @param uiWorkspace Workspace picker used by the browser Lab.
 * @param target Browser window carrying the Desktop platform marker and bridge.
 * @returns The selected absolute path, or null when the user cancels.
 */
export async function pickSettingsDirectory(
  uiWorkspace: UiWorkspaceDirectoryPicker,
  target: DesktopDirectoryPickerTarget = window as unknown as DesktopDirectoryPickerTarget,
): Promise<string | null> {
  const platform = new URLSearchParams(target.location.search).get("dsh-desktop-platform");
  if (platform !== "win32") return uiWorkspace.pickDirectory();

  const pickDirectory = target.__DSH_DESKTOP_PICK_DIRECTORY__;
  if (typeof pickDirectory !== "function") {
    throw new Error("DSH Desktop native directory picker is unavailable");
  }
  return pickDirectory();
}
