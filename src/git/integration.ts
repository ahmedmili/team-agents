import { simpleGit } from "simple-git";
import path from "node:path";

export async function getGitStatus(root: string): Promise<string> {
  const git = simpleGit(root);
  const isRepo = await git.checkIsRepo();
  if (!isRepo) return "(not a git repository)";
  const status = await git.status();
  const lines = [
    `branch: ${status.current ?? "unknown"}`,
    `staged: ${status.staged.length}`,
    `modified: ${status.modified.length}`,
    `untracked: ${status.not_added.length}`,
  ];
  if (status.modified.length) {
    lines.push(`modified files: ${status.modified.slice(0, 10).join(", ")}`);
  }
  return lines.join("\n");
}

export async function getRecentDiff(root: string): Promise<string> {
  const git = simpleGit(root);
  const isRepo = await git.checkIsRepo();
  if (!isRepo) return "";
  try {
    const diff = await git.diff(["HEAD"]);
    if (!diff) return "";
    const max = 3000;
    return diff.length > max ? diff.slice(0, max) + "\n... (truncated)" : diff;
  } catch {
    return "";
  }
}

export async function warnIfDirty(root: string): Promise<string | null> {
  const git = simpleGit(root);
  const isRepo = await git.checkIsRepo();
  if (!isRepo) return null;
  const status = await git.status();
  if (status.modified.length || status.not_added.length) {
    return `Warning: working tree has ${status.modified.length} modified and ${status.not_added.length} untracked files.`;
  }
  return null;
}

export async function checkoutFiles(
  root: string,
  relativePaths: string[],
): Promise<void> {
  const git = simpleGit(root);
  const isRepo = await git.checkIsRepo();
  if (!isRepo) return;
  await git.checkout(relativePaths.map((p) => path.normalize(p)));
}
