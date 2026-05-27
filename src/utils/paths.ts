import path from "node:path";

/** Resolve relative path under project root; reject escapes. */
export function resolveUnderRoot(root: string, filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.includes("..")) {
    throw new Error(`Invalid path (traversal): ${filePath}`);
  }
  const resolved = path.resolve(root, normalized);
  const rootResolved = path.resolve(root);
  if (
    resolved !== rootResolved &&
    !resolved.startsWith(rootResolved + path.sep)
  ) {
    throw new Error(`Path escapes project root: ${filePath}`);
  }
  return resolved;
}

export function toPosixRelative(root: string, absolute: string): string {
  return path.relative(root, absolute).split(path.sep).join("/");
}
