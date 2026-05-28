import type { AiShellConfig } from "../config/types.js";
import type { McpManager } from "./client.js";
import { formatMcpContextBlock } from "./context.js";
import { detectGitHubRepo, fillRefRepo, parseGitHubRefs } from "./refs.js";
import type { McpPrefetchResult } from "./types.js";
import { prefetchCiIfRelevant } from "../git/ci-prefetch.js";

export async function prefetchExternalContext(
  manager: McpManager | null,
  projectRoot: string,
  message: string,
  config: AiShellConfig,
): Promise<string> {
  const parts: string[] = [];

  if (manager?.isEnabled() && config.mcp?.prefetchOnRoute !== false) {
    const mcpBlock = await prefetchMcpContext(manager, projectRoot, message);
    if (mcpBlock) parts.push(mcpBlock);
  }

  const ciBlock = await prefetchCiIfRelevant(projectRoot, message);
  if (ciBlock) parts.push(ciBlock);

  return parts.filter(Boolean).join("\n\n");
}

async function prefetchMcpContext(
  manager: McpManager,
  projectRoot: string,
  message: string,
): Promise<string> {
  manager.lastPrefetchError = null;
  const results: McpPrefetchResult[] = [];

  try {
    const refs = parseGitHubRefs(message);
    if (!refs.length) return "";

    const defaultRepo = await detectGitHubRepo(projectRoot);
    const serverName = manager.getServerNames().includes("github")
      ? "github"
      : manager.getServerNames()[0];

    if (!serverName) return "";

    await manager.connectServer(serverName);

    for (const raw of refs) {
      const ref = fillRefRepo(raw, defaultRepo);
      if (!ref) continue;

      try {
        if (ref.kind === "pull") {
          const tool =
            manager.findTool(serverName, "get_pull_request") ??
            manager.findTool(serverName, "pull_request_read");
          if (!tool) continue;
          const content = await manager.callTool(serverName, tool, {
            owner: ref.owner,
            repo: ref.repo,
            pull_number: ref.number,
          });
          results.push({
            source: "github",
            label: `PR ${ref.owner}/${ref.repo}#${ref.number}`,
            content,
          });
        } else {
          const tool = manager.findTool(serverName, "get_issue");
          if (!tool) continue;
          const content = await manager.callTool(serverName, tool, {
            owner: ref.owner,
            repo: ref.repo,
            issue_number: ref.number,
          });
          results.push({
            source: "github",
            label: `Issue ${ref.owner}/${ref.repo}#${ref.number}`,
            content,
          });
        }
      } catch (err) {
        manager.lastPrefetchError =
          err instanceof Error ? err.message : String(err);
      }
    }
  } catch (err) {
    manager.lastPrefetchError =
      err instanceof Error ? err.message : String(err);
  }

  return formatMcpContextBlock(results);
}
