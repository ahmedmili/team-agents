import fs from "fs-extra";
import { glob } from "glob";
import path from "node:path";
import { resolveUnderRoot } from "../utils/paths.js";

export async function readFileSafe(
  root: string,
  relativePath: string,
): Promise<string> {
  const full = resolveUnderRoot(root, relativePath);
  return fs.readFile(full, "utf-8");
}

export async function searchFiles(
  root: string,
  pattern: string,
): Promise<string[]> {
  return glob(pattern, {
    cwd: root,
    ignore: ["**/node_modules/**", "**/.git/**"],
    nodir: true,
  });
}

export function fileExists(root: string, relativePath: string): boolean {
  try {
    const full = resolveUnderRoot(root, relativePath);
    return fs.existsSync(full) && fs.statSync(full).isFile();
  } catch {
    return false;
  }
}
