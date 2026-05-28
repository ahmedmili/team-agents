import { simpleGit } from "simple-git";
import type { GitHubRef } from "./types.js";

const ISSUE_URL =
  /github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/issues\/(\d+)/i;
const PR_URL =
  /github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/(\d+)/i;
const REPO_ISSUE = /([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#(\d+)/;
const BARE_ISSUE = /(?:^|\s)#(\d+)(?:\s|$)/;

export function parseGitHubRefs(message: string): GitHubRef[] {
  const refs: GitHubRef[] = [];
  const seen = new Set<string>();

  const add = (ref: GitHubRef) => {
    const key = `${ref.kind}:${ref.owner}/${ref.repo}#${ref.number}`;
    if (!seen.has(key)) {
      seen.add(key);
      refs.push(ref);
    }
  };

  for (const m of message.matchAll(new RegExp(PR_URL, "g"))) {
    add({
      kind: "pull",
      owner: m[1]!,
      repo: m[2]!,
      number: Number(m[3]),
    });
  }

  for (const m of message.matchAll(new RegExp(ISSUE_URL, "g"))) {
    add({
      kind: "issue",
      owner: m[1]!,
      repo: m[2]!,
      number: Number(m[3]),
    });
  }

  for (const m of message.matchAll(new RegExp(REPO_ISSUE, "g"))) {
    add({
      kind: "issue",
      owner: m[1]!,
      repo: m[2]!,
      number: Number(m[3]),
    });
  }

  const bare = message.match(BARE_ISSUE);
  if (bare) {
    refs.push({
      kind: "issue",
      owner: "",
      repo: "",
      number: Number(bare[1]),
    });
  }

  return refs;
}

export async function detectGitHubRepo(
  root: string,
): Promise<{ owner: string; repo: string } | null> {
  const git = simpleGit(root);
  if (!(await git.checkIsRepo())) return null;
  try {
    const remotes = await git.getRemotes(true);
    const origin = remotes.find((r) => r.name === "origin") ?? remotes[0];
    const url = origin?.refs?.fetch ?? origin?.refs?.push ?? "";
    const ssh = url.match(/git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
    if (ssh) return { owner: ssh[1]!, repo: ssh[2]! };
    const https = url.match(/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/i);
    if (https) return { owner: https[1]!, repo: https[2]! };
  } catch {
    return null;
  }
  return null;
}

export function fillRefRepo(
  ref: GitHubRef,
  defaultRepo: { owner: string; repo: string } | null,
): GitHubRef | null {
  const owner = ref.owner || defaultRepo?.owner;
  const repo = ref.repo || defaultRepo?.repo;
  if (!owner || !repo) return null;
  return { ...ref, owner, repo };
}
