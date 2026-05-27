import * as Diff from "diff";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import type { PatchRecord } from "../schemas/index.js";
import { PatchConflictError } from "../utils/errors.js";
import { resolveUnderRoot } from "../utils/paths.js";
import { checkoutFiles } from "../git/integration.js";

export interface ApplyResult {
  applied: string[];
  backups: Map<string, string>;
}

/** Apply a unified diff to a file (or create file if missing). */
export function applyUnifiedDiff(
  root: string,
  filePath: string,
  unifiedDiff: string,
): string {
  const fullPath = resolveUnderRoot(root, filePath);
  const oldContent = fs.existsSync(fullPath)
    ? fs.readFileSync(fullPath, "utf-8")
    : "";

  const patched = applyPatchToContent(oldContent, unifiedDiff, filePath);
  fs.ensureDirSync(path.dirname(fullPath));
  fs.writeFileSync(fullPath, patched, "utf-8");
  return patched;
}

function applyPatchToContent(
  oldContent: string,
  unifiedDiff: string,
  filePath: string,
): string {
  const normalized = normalizeDiff(unifiedDiff, filePath);
  const parsed = Diff.parsePatch(normalized);
  if (!parsed.length) {
    throw new PatchConflictError(`Invalid patch for ${filePath}`);
  }
  let result = Diff.applyPatch(oldContent, parsed[0]!);
  if (result === false) {
    throw new PatchConflictError(
      `Failed to apply patch to ${filePath}. The file may have changed.`,
    );
  }
  if (!oldContent && !result) {
    result = extractAddedContent(normalized);
  }
  return result;
}

function extractAddedContent(unifiedDiff: string): string {
  const lines = unifiedDiff.split("\n");
  const added: string[] = [];
  let inHunk = false;
  for (const line of lines) {
    if (line.startsWith("@@")) inHunk = true;
    else if (inHunk && line.startsWith("+") && !line.startsWith("+++")) {
      added.push(line.slice(1));
    }
  }
  if (!added.length) return "";
  const text = added.join("\n");
  return text.endsWith("\n") ? text : `${text}\n`;
}

function normalizeDiff(unifiedDiff: string, filePath: string): string {
  let diff = unifiedDiff.trim();
  if (!diff.startsWith("---")) {
    const base = filePath.replace(/\\/g, "/");
    diff = `--- a/${base}\n+++ b/${base}\n${diff}`;
  }
  return diff;
}

export async function applyPatches(
  root: string,
  patches: PatchRecord[],
  backupDir: string,
): Promise<ApplyResult> {
  fs.ensureDirSync(backupDir);
  const applied: string[] = [];
  const backups = new Map<string, string>();

  for (const patch of patches) {
    const fullPath = resolveUnderRoot(root, patch.filePath);
    if (fs.existsSync(fullPath)) {
      const backupPath = path.join(
        backupDir,
        `${patch.id}-${path.basename(patch.filePath)}.bak`,
      );
      fs.copyFileSync(fullPath, backupPath);
      backups.set(patch.id, backupPath);
    }
    applyUnifiedDiff(root, patch.filePath, patch.unifiedDiff);
    applied.push(patch.id);
  }

  return { applied, backups };
}

export async function rollbackPatches(
  root: string,
  patches: PatchRecord[],
): Promise<void> {
  const byFile = [...patches].reverse();
  for (const patch of byFile) {
    if (patch.backupPath && fs.existsSync(patch.backupPath)) {
      const fullPath = resolveUnderRoot(root, patch.filePath);
      fs.copyFileSync(patch.backupPath, fullPath);
    } else {
      try {
        await checkoutFiles(root, [patch.filePath]);
      } catch {
        // file may have been new
        const fullPath = resolveUnderRoot(root, patch.filePath);
        if (fs.existsSync(fullPath)) fs.removeSync(fullPath);
      }
    }
  }
}

export function getBackupDir(sessionId: string): string {
  return path.join(os.homedir(), ".ai-shell", "backups", sessionId);
}

export function formatPatchForDisplay(patch: PatchRecord): string {
  const header = `[${patch.id.slice(0, 8)}] ${patch.filePath} (${patch.status}) — ${patch.agentId}`;
  const desc = patch.description ? `\n  ${patch.description}` : "";
  return `${header}${desc}\n${patch.unifiedDiff}\n`;
}

/** Build unified diff from old/new content */
export function createUnifiedDiff(
  filePath: string,
  oldContent: string,
  newContent: string,
): string {
  return Diff.createPatch(filePath, oldContent, newContent, "", "");
}
