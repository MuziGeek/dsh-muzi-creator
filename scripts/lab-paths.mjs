import { lstat, mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const LAB_DIR_NAME = ".lab";
export const WINDOWS_SHELL_DIRECTORY_NAMES = Object.freeze(["Desktop", "Documents", "Downloads"]);

/** Returns the Windows shell directories expected below a chosen user home. */
export function windowsShellDirectories(home) {
  return WINDOWS_SHELL_DIRECTORY_NAMES.map((name) => join(home, name));
}

/** Returns the repository root and its private Lab directories. */
export function labPaths(repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))) {
  const root = resolve(repositoryRoot);
  const lab = join(root, LAB_DIR_NAME);
  const home = join(lab, "dsh-home");
  const profile = join(home, "profiles", "web");
  const desktopHome = join(lab, "desktop-home");
  const desktopProfile = join(desktopHome, "profiles", "web");
  const desktopUserData = join(lab, "desktop-user-data");
  const personal = join(lab, "personal");
  const personalHome = join(personal, "dsh-home");
  const personalProfile = join(personalHome, "profiles", "web");
  const personalUserData = join(personal, "user-data");
  const personalData = join(personal, "data");
  const personalSkills = join(personal, "skills");
  const fixture = join(lab, "fixture");
  return {
    root,
    lab,
    home,
    profile,
    profileManifest: join(profile, "package.json"),
    profilePatch: join(profile, "cordis.patch.yml"),
    profileWorkspace: join(profile, "pnpm-workspace.yaml"),
    profileModules: join(profile, "node_modules"),
    pluginLink: join(profile, "node_modules", "dsh-muzi-creator"),
    desktopHome,
    desktopProfile,
    desktopProfileManifest: join(desktopProfile, "package.json"),
    desktopProfilePatch: join(desktopProfile, "cordis.patch.yml"),
    desktopProfileWorkspace: join(desktopProfile, "pnpm-workspace.yaml"),
    desktopProfileModules: join(desktopProfile, "node_modules"),
    desktopPluginLink: join(desktopProfile, "node_modules", "dsh-muzi-creator"),
    desktopUserData,
    desktopProfileSelection: join(desktopUserData, "profile-selection", "state.json"),
    desktopMarketSelection: join(desktopUserData, "desktop-market", "state.json"),
    desktopSettings: join(desktopHome, "settings.yaml"),
    homeShellDirectories: windowsShellDirectories(home),
    desktopHomeShellDirectories: windowsShellDirectories(desktopHome),
    personal,
    personalHome,
    personalProfile,
    personalProfileManifest: join(personalProfile, "package.json"),
    personalProfilePatch: join(personalProfile, "cordis.patch.yml"),
    personalProfileWorkspace: join(personalProfile, "pnpm-workspace.yaml"),
    personalProfileModules: join(personalProfile, "node_modules"),
    personalPluginLink: join(personalProfile, "node_modules", "dsh-muzi-creator"),
    personalUserData,
    personalProfileSelection: join(personalUserData, "profile-selection", "state.json"),
    personalMarketSelection: join(personalUserData, "desktop-market", "state.json"),
    personalSettings: join(personalHome, "settings.yaml"),
    personalData,
    personalSkills,
    personalConfig: join(lab, "config", "personal.json"),
    packageStaging: join(lab, "packages"),
    safetyManifest: join(lab, "config", "safety.json"),
    fixture,
    library: join(fixture, "library"),
    atlas: join(fixture, "atlas"),
    trellis: join(fixture, "trellis"),
    data: join(fixture, "data"),
    skills: join(fixture, "skills"),
  };
}

/** Confines a path to an existing root and rejects symlinked path segments. */
export async function confinedPath(root, candidate) {
  const confinedRoot = resolve(root);
  const target = resolve(candidate);
  const remainder = relative(confinedRoot, target);
  if (remainder === ".." || remainder.startsWith(`..${sep}`) || isAbsolute(remainder)) {
    throw new Error(`Lab 路径逃逸：${target}`);
  }
  let cursor = confinedRoot;
  try {
    const rootInfo = await lstat(cursor);
    if (rootInfo.isSymbolicLink()) throw new Error(`Lab 拒绝符号链接或联接点：${cursor}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const segments = remainder ? remainder.split(/[\\/]+/) : [];
  for (const segment of segments) {
    cursor = join(cursor, segment);
    try {
      const info = await lstat(cursor);
      if (info.isSymbolicLink()) throw new Error(`Lab 拒绝符号链接或联接点：${cursor}`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      break;
    }
  }
  return target;
}

/** Ensures a writable Lab path has no escaping parent before creating it. */
export async function prepareLabPath(root, target) {
  await confinedPath(root, dirname(target));
  await mkdir(dirname(target), { recursive: true });
  return confinedPath(root, target);
}
