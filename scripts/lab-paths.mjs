import { lstat, mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const LAB_DIR_NAME = ".lab";

/** Returns the repository root and its private Lab directories. */
export function labPaths(repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))) {
  const root = resolve(repositoryRoot);
  const lab = join(root, LAB_DIR_NAME);
  const home = join(lab, "dsh-home");
  const profile = join(home, "profiles", "web");
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
