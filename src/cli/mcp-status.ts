import chalk from "chalk";
import type { AiShellConfig } from "../config/types.js";
import type { McpManager } from "../mcp/client.js";

export async function mcpStatusLines(
  manager: McpManager | null,
  config: AiShellConfig,
): Promise<string[]> {
  if (!config.mcp?.enabled) {
    return [
      chalk.gray("MCP is disabled."),
      chalk.gray('Set "mcp.enabled": true in .ai-shell.json'),
    ];
  }
  if (!manager) {
    return [chalk.gray("MCP manager not initialized.")];
  }

  const lines = [chalk.bold("MCP servers:"), ""];
  const statuses = await manager.getStatuses();

  if (!statuses.length) {
    lines.push(chalk.gray("No servers configured under mcp.servers."));
    return lines;
  }

  for (const s of statuses) {
    if (s.connected) {
      lines.push(
        chalk.green(`  ${s.name}`) +
          chalk.gray(` — connected (${s.toolCount} tools)`),
      );
      try {
        const tools = await manager.listTools(s.name);
        const preview = tools.slice(0, 8).join(", ");
        lines.push(chalk.gray(`    tools: ${preview}${tools.length > 8 ? "…" : ""}`));
      } catch {
        // ignore
      }
    } else {
      lines.push(chalk.red(`  ${s.name} — not connected`));
      if (s.error) lines.push(chalk.gray(`    ${s.error}`));
    }
  }

  if (manager.lastPrefetchError) {
    lines.push("", chalk.yellow(`Last prefetch error: ${manager.lastPrefetchError}`));
  }

  return lines;
}
