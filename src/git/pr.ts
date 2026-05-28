import { simpleGit } from "simple-git";
import path from "node:path";
import type { MemoryStore } from "../memory/store.js";
import { ghAuthOk, runGh } from "./gh.js";
import { warnIfDirty } from "./integration.js";

const PROTECTED = new Set(["main", "master"]);

export interface PrCreateOptions {
  sessionId: string;
  root: string;
  store: MemoryStore;
  title?: string;
  body?: string;
  branch?: string;
  draft?: boolean;
  yes?: boolean;
  dryRun?: boolean;
  allStaged?: boolean;
}

export interface PrCreateResult {
  dryRun: boolean;
  branch: string;
  commitMessage: string;
  files: string[];
  prUrl?: string;
  messages: string[];
}

export async function createPullRequest(
  opts: PrCreateOptions,
): Promise<PrCreateResult> {
  const messages: string[] = [];
  const git = simpleGit(opts.root);

  if (!(await git.checkIsRepo())) {
    throw new Error("Not a git repository");
  }
  if (!(await ghAuthOk(opts.root))) {
    throw new Error(
      "GitHub CLI not authenticated. Run: gh auth login",
    );
  }

  const currentBranch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
  if (PROTECTED.has(currentBranch) && !opts.branch) {
    throw new Error(
      `Refusing to commit on protected branch "${currentBranch}". Use --branch to create a feature branch.`,
    );
  }

  let files: string[];
  if (opts.allStaged) {
    const status = await git.status();
    files = [...status.staged];
    if (!files.length) {
      throw new Error("No staged files. Stage changes or use applied patches.");
    }
  } else {
    const applied = opts.store.getPatches(opts.sessionId, "applied");
    if (!applied.length) {
      throw new Error(
        "No applied patches in this session. Run /apply first, or use --all-staged.",
      );
    }
    files = [...new Set(applied.map((p) => p.filePath))];
  }

  const dirtyWarn = await warnIfDirty(opts.root);
  if (dirtyWarn && !opts.allStaged) {
    messages.push(dirtyWarn);
  }

  const shortId = opts.sessionId.slice(0, 8);
  const branch = opts.branch ?? `ai-shell/${shortId}`;
  const title =
    opts.title ??
    `AI Shell: session ${shortId}`;
  const body =
    opts.body ??
    `Changes from AI Shell session \`${opts.sessionId}\`.\n\nReview carefully before merging.`;
  const commitMessage = `feat: AI Shell changes (${shortId})`;

  const plan = opts.store.getSessionPlan(opts.sessionId);
  const planHint = plan?.summary ? `\n\nPlan: ${plan.summary.slice(0, 500)}` : "";

  if (opts.dryRun || !opts.yes) {
    return {
      dryRun: true,
      branch,
      commitMessage,
      files,
      messages: [
        ...messages,
        "Dry run — would:",
        `  branch: ${branch}`,
        `  commit: ${commitMessage}`,
        `  files: ${files.join(", ")}`,
        `  PR title: ${title}`,
        opts.yes ? "" : "Pass --yes to execute.",
      ].filter(Boolean),
    };
  }

  if (currentBranch !== branch) {
    const branches = await git.branchLocal();
    if (!branches.all.includes(branch)) {
      await git.checkoutLocalBranch(branch);
    } else {
      await git.checkout(branch);
    }
  }

  await git.add(files.map((f) => path.normalize(f)));
  await git.commit(commitMessage);

  const push = await git.push(["-u", "origin", branch]);
  if (push.update?.hash) {
    messages.push(`Pushed to origin/${branch}`);
  }

  const ghArgs = [
    "pr",
    "create",
    "--title",
    title,
    "--body",
    body + planHint,
    "--head",
    branch,
  ];
  if (opts.draft) ghArgs.push("--draft");

  const pr = await runGh(ghArgs, opts.root);
  if (pr.exitCode !== 0) {
    throw new Error(pr.stderr.trim() || "gh pr create failed");
  }

  const prUrl = pr.stdout.trim();
  opts.store.saveSessionPrUrl(opts.sessionId, prUrl);

  return {
    dryRun: false,
    branch,
    commitMessage,
    files,
    prUrl,
    messages: [...messages, `Created PR: ${prUrl}`],
  };
}

export function parsePrArgs(args: string[]): {
  title?: string;
  body?: string;
  branch?: string;
  draft: boolean;
  yes: boolean;
  dryRun: boolean;
  allStaged: boolean;
} {
  const out = {
    draft: false,
    yes: false,
    dryRun: false,
    allStaged: false,
    title: undefined as string | undefined,
    body: undefined as string | undefined,
    branch: undefined as string | undefined,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--draft") out.draft = true;
    else if (a === "--yes" || a === "-y") out.yes = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--all-staged") out.allStaged = true;
    else if (a === "--title" && args[i + 1]) out.title = args[++i];
    else if (a === "--body" && args[i + 1]) out.body = args[++i];
    else if (a === "--branch" && args[i + 1]) out.branch = args[++i];
  }
  return out;
}
