import { simpleGit } from "simple-git";
import chalk from "chalk";
import { runGh } from "./gh.js";

export interface WorkflowRun {
  databaseId: number;
  name: string;
  status: string;
  conclusion: string | null;
  url: string;
  createdAt: string;
  headBranch: string;
}

const CI_KEYWORDS = /\b(ci|build|pipeline|github actions|workflow)\b/i;

export function messageMentionsCi(message: string): boolean {
  return CI_KEYWORDS.test(message);
}

export async function listWorkflowRuns(
  root: string,
  limit = 5,
): Promise<WorkflowRun[]> {
  const git = simpleGit(root);
  if (!(await git.checkIsRepo())) {
    throw new Error("Not a git repository");
  }
  const branch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
  const r = await runGh(
    [
      "run",
      "list",
      "--branch",
      branch,
      "-L",
      String(limit),
      "--json",
      "databaseId,name,status,conclusion,url,createdAt,headBranch",
    ],
    root,
  );
  if (r.exitCode !== 0) {
    throw new Error(r.stderr.trim() || "gh run list failed");
  }
  return JSON.parse(r.stdout || "[]") as WorkflowRun[];
}

export async function getFailedRunLogs(
  root: string,
  runId: string,
  maxChars = 3000,
): Promise<string> {
  const r = await runGh(["run", "view", runId, "--log-failed"], root);
  if (r.exitCode !== 0) {
    throw new Error(r.stderr.trim() || `Could not load logs for run ${runId}`);
  }
  const log = r.stdout.trim();
  return log.length > maxChars ? log.slice(0, maxChars) + "\n... (truncated)" : log;
}

export function formatCiRunsTable(runs: WorkflowRun[]): string[] {
  if (!runs.length) {
    return [chalk.gray("No workflow runs found for this branch.")];
  }
  const lines = [chalk.bold("GitHub Actions (recent):"), ""];
  for (const run of runs) {
    const status =
      run.conclusion === "success"
        ? chalk.green(run.conclusion)
        : run.conclusion === "failure"
          ? chalk.red(run.conclusion ?? run.status)
          : chalk.yellow(run.status);
    lines.push(
      `  #${run.databaseId} ${run.name} — ${status}`,
      chalk.gray(`    ${run.url}`),
      chalk.gray(`    ${run.createdAt.slice(0, 19)}`),
    );
  }
  return lines;
}
