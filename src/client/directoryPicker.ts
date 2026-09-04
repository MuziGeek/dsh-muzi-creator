/** DSH workspace service surface used by both Web Lab and Desktop. */
export interface WorkspaceDirectoryPicker {
  pickDirectory: () => Promise<string | null>;
}

/**
 * Opens the directory picker supported by the composed DSH host.
 *
 * @param workspaces DSH workspace service with the native picker capability.
 * @returns The selected absolute path, or null when the user cancels.
 */
export async function pickSettingsDirectory(
  workspaces: WorkspaceDirectoryPicker,
): Promise<string | null> {
  return workspaces.pickDirectory();
}
