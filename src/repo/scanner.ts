import fs from "fs-extra";
import { glob } from "glob";
import path from "node:path";
import type { ProjectProfile } from "../schemas/index.js";
import { detectStacks } from "./stack.js";
import { getGitStatus, getRecentDiff } from "../git/integration.js";

const MAX_TREE_LINES = 80;
const MAX_FILE_READ = 4000;

export async function scanRepository(root: string): Promise<ProjectProfile> {
  const name = path.basename(root);
  const stacks = detectStacks(root);
  const treeSummary = await buildTreeSummary(root);
  const dependencies = readDependenciesSummary(root);
  const entrypoints = findEntrypoints(root, stacks);
  let gitStatus: string | undefined;
  let gitDiff: string | undefined;
  try {
    gitStatus = await getGitStatus(root);
    gitDiff = await getRecentDiff(root);
  } catch {
    gitStatus = "(no git repo)";
  }

  return {
    root,
    name,
    stacks,
    treeSummary,
    dependencies,
    gitStatus: [gitStatus, gitDiff].filter(Boolean).join("\n"),
    entrypoints,
  };
}

async function buildTreeSummary(root: string): Promise<string> {
  const files = await glob("**/*", {
    cwd: root,
    ignore: [
      "**/node_modules/**",
      "**/.git/**",
      "**/dist/**",
      "**/build/**",
      "**/.ai-shell/**",
    ],
    nodir: true,
    maxDepth: 4,
  });
  const lines = files
    .sort()
    .slice(0, MAX_TREE_LINES)
    .map((f) => f.replace(/\\/g, "/"));
  const suffix =
    files.length > MAX_TREE_LINES
      ? `\n... (${files.length - MAX_TREE_LINES} more files)`
      : "";
  return lines.join("\n") + suffix;
}

function readDependenciesSummary(root: string): string {
  const pkgPath = path.join(root, "package.json");
  if (!fs.existsSync(pkgPath)) return "(no package.json)";
  const pkg = fs.readJsonSync(pkgPath) as {
    name?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const deps = Object.keys({
    ...pkg.dependencies,
    ...pkg.devDependencies,
  }).slice(0, 40);
  return `name: ${pkg.name ?? "unknown"}\ndependencies: ${deps.join(", ")}`;
}

function findEntrypoints(root: string, stacks: string[]): string[] {
  const candidates = [
    "src/main.ts",
    "src/index.ts",
    "src/app.ts",
    "index.ts",
    "app.js",
    "server.js",
  ];
  if (stacks.includes("nestjs")) {
    candidates.unshift("src/main.ts", "src/app.module.ts");
  }
  return candidates.filter((c) => fs.existsSync(path.join(root, c)));
}

export function formatContextPack(profile: ProjectProfile): string {
  const parts = [
    `# Project: ${profile.name}`,
    `Stacks: ${profile.stacks.join(", ")}`,
    `\n## Dependencies\n${profile.dependencies}`,
    `\n## Entrypoints\n${profile.entrypoints.join(", ") || "(none detected)"}`,
    `\n## File tree (summary)\n${profile.treeSummary}`,
  ];
  if (profile.gitStatus) {
    parts.push(`\n## Git\n${profile.gitStatus}`);
  }
  return parts.join("\n");
}

export async function readProjectFile(
  root: string,
  relativePath: string,
): Promise<string | null> {
  const full = path.join(root, relativePath);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
  const content = await fs.readFile(full, "utf-8");
  return content.length > MAX_FILE_READ
    ? content.slice(0, MAX_FILE_READ) + "\n... (truncated)"
    : content;
}
