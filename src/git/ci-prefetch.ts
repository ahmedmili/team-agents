import { formatMcpContextBlock } from "../mcp/context.js";
import type { McpPrefetchResult } from "../mcp/types.js";
import { listWorkflowRuns, messageMentionsCi } from "./ci.js";
import { ghAuthOk } from "./gh.js";

export async function prefetchCiIfRelevant(
  projectRoot: string,
  message: string,
): Promise<string> {
  if (!messageMentionsCi(message)) return "";
  if (!(await ghAuthOk(projectRoot))) return "";

  try {
    const runs = await listWorkflowRuns(projectRoot, 3);
    const failed = runs.filter((r) => r.conclusion === "failure");
    const target = failed[0] ?? runs[0];
    if (!target) return "";

    const results: McpPrefetchResult[] = [
      {
        source: "ci",
        label: `Workflow ${target.name} (#${target.databaseId})`,
        content: `status=${target.status} conclusion=${target.conclusion ?? "n/a"} url=${target.url}`,
      },
    ];
    return formatMcpContextBlock(results);
  } catch {
    return "";
  }
}
