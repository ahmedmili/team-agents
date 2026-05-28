import chalk from "chalk";
import type { MemoryStore } from "../memory/store.js";
import type { Session } from "../core/session.js";
import {
  applyPatches,
  rollbackPatches,
  formatPatchForDisplay,
  getBackupDir,
} from "../diff/apply.js";
import { warnIfDirty } from "../git/integration.js";
import type { AgentRegistry } from "../agents/registry.js";
import {
  getKeysStatus,
  parseProviderArg,
  setAgentProvider,
  setApiKey,
  setProvider,
} from "../config/store.js";
import {
  listConfiguredProviders,
  resolveProviderForRole,
} from "../config/loader.js";
import type { AgentRole } from "../schemas/index.js";
import { listAgentArtifacts } from "../core/artifacts.js";
import { listWorkspaces } from "../config/workspaces.js";
import type { McpManager } from "../mcp/client.js";
import { mcpStatusLines } from "./mcp-status.js";
import { createPullRequest, parsePrArgs } from "../git/pr.js";
import {
  formatCiRunsTable,
  getFailedRunLogs,
  listWorkflowRuns,
} from "../git/ci.js";
import fs from "fs-extra";
import path from "node:path";

export interface CommandContext {
  session: Session;
  store: MemoryStore;
  registry: AgentRegistry;
  getMcpManager?: () => McpManager | null;
  onExit: () => void;
  onRefresh: () => Promise<void>;
  onReloadConfig: () => void;
  onSwitchProject?: (newRoot: string) => Promise<void>;
}

export async function handleCommand(
  ctx: CommandContext,
  command: string,
  args: string[],
): Promise<string[]> {
  switch (command) {
    case "help":
      return [helpText()];
    case "exit":
    case "quit":
      ctx.onExit();
      return [chalk.gray("Goodbye.")];
    case "diff":
      return showDiff(ctx);
    case "apply":
      return await applyCommand(ctx, args);
    case "rollback":
      return await rollbackCommand(ctx, args);
    case "reject":
      return rejectCommand(ctx, args);
    case "artifacts":
      return showArtifacts(ctx, args);
    case "sessions":
      return showSessions(ctx);
    case "switch":
      return await handleSwitch(ctx, args);
    case "workspaces":
      return showWorkspaces();
    case "board":
      return showBoard(ctx);
    case "mcp":
      return await showMcp(ctx);
    case "pr":
      return await handlePr(ctx, args);
    case "ci":
      return await handleCi(ctx, args);
    case "memory":
      return handleMemory(ctx, args);
    case "status":
      return showStatus(ctx);
    case "agents":
      return listAgents(ctx);
    case "keys":
      return showKeys(ctx);
    case "setkey":
      return handleSetKey(ctx, args);
    case "setprovider":
      return handleSetProvider(ctx, args);
    case "use":
      return handleSetProvider(ctx, args);
    case "providers":
      return showProviders(ctx);
    case "setagent":
      return handleSetAgentProvider(ctx, args);
    case "dashboard":
      return showDashboard(ctx);
    case "metrics":
      return showMetrics(ctx);
    case "history":
      return showHistory(ctx, args);
    case "connect":
      await ctx.onRefresh();
      return [chalk.green("Session refreshed.")];
    default:
      return [chalk.red(`Unknown command: /${command}. Type /help`)];
  }
}

function helpText(): string {
  return `
Commands:
  /diff              Show pending patches
  /apply [id|all]    Apply patch(es)
  /rollback [id|all] Revert applied patches
  /reject [id|all]   Reject pending patches (no file changes)
  /artifacts [n]     List agent report files (.md); optional preview of latest
  /sessions          List recent project sessions (multi-project)
  /workspaces        List pinned workspace registry
  /switch <path>     Hot-switch to another project (stays in REPL)
  /board             Active plan tasks and agent handoff log
  /mcp               MCP server status and tools
  /pr [--yes]        Create GitHub PR from applied patches (use --dry-run first)
  /ci [run-id]       GitHub Actions runs for current branch
  /memory            List project memory (persists across sessions)
  /memory clear      Clear project memory for this repo
  /status            Session and task status
  /agents            List agent aliases
  /keys              Show API keys (masked)
  /providers         Show active and configured providers
  /setkey <p> <key>  Save key to .ai-shell.json (openai|anthropic|huggingface)
  /setprovider <p>   Set provider (openai|anthropic|huggingface|openrouter|puter|mock)
  /use <p>           Alias for /setprovider
  /setagent <r> <p>  Set per-agent provider (or clear)
  /dashboard         Summary of system health and providers
  /metrics           Provider metrics (calls, errors, latency)
  /history [type]    Show recent sessions/messages/patches
  /connect           Refresh repo scan
  /exit              Leave shell

Natural: describe what to build
Agent:   @karim implement feature

Outside shell:
  ai config keys | set-key | set-provider | set-agent | providers | init
  ai memory          List project memory for cwd
  ai switch <path>   Register project and exit (use /switch in REPL to stay)
  ai workspaces      List registered workspaces
  ai mcp status      MCP servers (outside REPL)
  ai pr create       Open PR from applied patches
  ai ci              List workflow runs
`.trim();
}

async function showMcp(ctx: CommandContext): Promise<string[]> {
  const manager = ctx.getMcpManager?.() ?? null;
  return mcpStatusLines(manager, ctx.session.config);
}

async function handlePr(
  ctx: CommandContext,
  args: string[],
): Promise<string[]> {
  const flags = parsePrArgs(args);
  if (!flags.yes && !flags.dryRun) {
    flags.dryRun = true;
  }
  try {
    const result = await createPullRequest({
      sessionId: ctx.session.id,
      root: ctx.session.root,
      store: ctx.store,
      ...flags,
    });
    const lines = result.messages.map((m) =>
      result.dryRun ? chalk.gray(m) : m.startsWith("Created") ? chalk.green(m) : m,
    );
    if (result.dryRun) {
      lines.push(
        chalk.yellow("\nThis was a dry run. Use /pr --yes to create the PR."),
      );
    }
    return lines;
  } catch (err) {
    return [chalk.red(err instanceof Error ? err.message : String(err))];
  }
}

async function handleCi(
  ctx: CommandContext,
  args: string[],
): Promise<string[]> {
  const runId = args[0];
  try {
    if (runId && !runId.startsWith("-")) {
      const logs = await getFailedRunLogs(ctx.session.root, runId);
      return [chalk.bold(`Failed logs for run ${runId}:`), "", logs];
    }
    const runs = await listWorkflowRuns(ctx.session.root, 5);
    return formatCiRunsTable(runs);
  } catch (err) {
    return [chalk.red(err instanceof Error ? err.message : String(err))];
  }
}

async function handleSwitch(
  ctx: CommandContext,
  args: string[],
): Promise<string[]> {
  if (!args[0]) {
    return [chalk.red("Usage: /switch <path>")];
  }
  if (!ctx.onSwitchProject) {
    return [chalk.red("Project switch is only available in the interactive shell.")];
  }
  try {
    await ctx.onSwitchProject(path.resolve(args[0]));
    return [chalk.green(`Switched to ${ctx.session.root}`)];
  } catch (err) {
    return [
      chalk.red(err instanceof Error ? err.message : String(err)),
    ];
  }
}

function showWorkspaces(): string[] {
  const entries = listWorkspaces();
  if (!entries.length) {
    return [
      chalk.gray("No workspaces registered yet."),
      chalk.gray("Connect to a project with `ai connect` to register it."),
    ];
  }
  const lines = ["Registered workspaces:", ""];
  for (const w of entries) {
    lines.push(
      `  ${w.name} — ${w.cwd}`,
      chalk.gray(`    last opened: ${w.lastOpenedAt.slice(0, 19)}`),
    );
  }
  return lines;
}

function showBoard(ctx: CommandContext): string[] {
  const plan = ctx.store.getSessionPlan(ctx.session.id);
  const handoffs = ctx.store.getSessionHandoffs(ctx.session.id);
  const lines: string[] = [chalk.bold("Task board"), ""];

  if (plan?.tasks?.length) {
    lines.push("Plan tasks:");
    for (const t of plan.tasks) {
      const mark = t.status === "done" ? chalk.green("✓") : chalk.gray("○");
      lines.push(`  ${mark} [${t.agent}] ${t.description}`);
    }
    lines.push("");
  } else {
    lines.push(chalk.gray("No active plan. Run a tech-lead flow to create tasks."));
    lines.push("");
  }

  if (handoffs.length) {
    lines.push("Agent handoffs (this session):");
    for (const h of handoffs) {
      lines.push(
        chalk.gray(`  [${h.at.slice(0, 19)}]`) +
          ` [${h.agent}] ${h.type}: ${h.brief.slice(0, 120)}`,
      );
    }
  } else {
    lines.push(chalk.gray("No handoff log yet."));
  }

  lines.push("", chalk.gray("Full reports: /artifacts"));
  return lines;
}

/** Shared formatter for REPL / CLI project memory listing. */
export function projectMemoryLines(
  store: MemoryStore,
  cwd: string,
  options: { limit?: number; clear?: boolean } = {},
): string[] {
  const limit = options.limit ?? 20;

  if (options.clear) {
    const removed = store.clearProjectMemory(cwd);
    return [
      chalk.green(`Cleared ${removed} project memory entries.`),
      chalk.gray(`Project: ${cwd}`),
    ];
  }

  const count = store.getProjectMemoryCount(cwd);
  const entries = store.getProjectMemories(cwd, limit);

  if (!entries.length) {
    return [
      chalk.gray("No project memory yet."),
      chalk.gray("Memory is captured automatically after agent runs."),
    ];
  }

  const lines = [
    `Project memory (${count} entries, showing ${entries.length}):`,
    chalk.gray(`Project: ${cwd}`),
    "",
  ];

  for (const e of entries) {
    const agent = e.sourceAgent ? ` [${e.sourceAgent}]` : "";
    lines.push(
      chalk.gray(`  [${e.createdAt.slice(0, 19)}]`) +
        ` (${e.kind})${agent} ${e.content.slice(0, 120)}`,
    );
  }

  return lines;
}

function handleMemory(ctx: CommandContext, args: string[]): string[] {
  const clear = args[0]?.toLowerCase() === "clear";
  return projectMemoryLines(ctx.store, ctx.session.root, { clear });
}

function showKeys(ctx: CommandContext): string[] {
  const lines = [
    `Provider: ${ctx.session.config.provider}`,
    "",
    "API keys (.ai-shell.json):",
  ];
  for (const row of getKeysStatus(ctx.session.config)) {
    lines.push(
      `  ${row.label}: ${row.set ? chalk.green(row.value) : chalk.gray(row.value)}`,
    );
  }
  lines.push(
    "",
    chalk.gray("Edit .ai-shell.json \"keys\" or use /setkey openai sk-..."),
  );
  return lines;
}

function handleSetKey(ctx: CommandContext, args: string[]): string[] {
  if (args.length < 2) {
    return [
      chalk.red("Usage: /setkey <openai|anthropic|huggingface|openrouter> <api-key>"),
      chalk.gray("Example: /setkey openrouter or-..."),
    ];
  }
  const provider = parseProviderArg(args[0]!);
  const key = args.slice(1).join(" ");
  setApiKey(ctx.session.root, provider, key);
  ctx.onReloadConfig();
  return [
    chalk.green(`Saved ${provider} key to .ai-shell.json`),
    chalk.gray(`Provider is now: ${ctx.session.config.provider}`),
  ];
}

function handleSetProvider(ctx: CommandContext, args: string[]): string[] {
  if (!args[0]) {
    return [
      chalk.red("Usage: /setprovider <openai|anthropic|huggingface|openrouter|puter|mock>"),
    ];
  }
  const provider = parseProviderArg(args[0]);
  setProvider(ctx.session.root, provider);
  ctx.onReloadConfig();
  return [
    chalk.green(`Provider set to ${provider}`),
    provider === "mock"
      ? chalk.gray("Mock mode — no API calls.")
      : chalk.gray("Restart not required; config reloaded."),
  ];
}

function handleSetAgentProvider(ctx: CommandContext, args: string[]): string[] {
  if (!args[0] || !args[1]) {
    return [
      chalk.red("Usage: /setagent <techLead|backend|qa|architect> <provider|clear>"),
      chalk.gray("Example: /setagent backend anthropic"),
    ];
  }
  const role = parseRoleArg(args[0]);
  if (!role) {
    return [
      chalk.red(
        "Invalid role. Use one of: techLead, backend, qa, architect",
      ),
    ];
  }
  const providerArg = args[1].toLowerCase();
  setAgentProvider(
    ctx.session.root,
    role,
    providerArg === "clear" ? "clear" : parseProviderArg(providerArg),
  );
  ctx.onReloadConfig();
  return [
    providerArg === "clear"
      ? chalk.green(`Cleared provider override for ${role}.`)
      : chalk.green(`Provider override for ${role}: ${providerArg}`),
  ];
}

function showProviders(ctx: CommandContext): string[] {
  const configured = listConfiguredProviders(ctx.session.config);
  const lines = [
    `Global provider: ${ctx.session.config.provider}`,
    `Configured providers: ${configured.join(", ")}`,
    "",
    "Per-agent provider resolution:",
  ];
  const roles: AgentRole[] = ["techLead", "backend", "qa", "architect"];
  for (const role of roles) {
    const override = ctx.session.config.agentProviders?.[role];
    const resolved = resolveProviderForRole(ctx.session.config, role);
    lines.push(
      `  ${role}: ${resolved}${override ? ` (override: ${override})` : ""}`,
    );
  }
  return lines;
}

function showDashboard(ctx: CommandContext): string[] {
  const lines: string[] = [];
  lines.push(`Project: ${ctx.session.projectName}`);
  lines.push(`Provider: ${ctx.session.config.provider}`);
  lines.push(`Configured: ${listConfiguredProviders(ctx.session.config).join(", ")}`);
  lines.push("");
  lines.push(...showMetrics(ctx));
  lines.push("");
  lines.push(...showHistory(ctx, ["sessions"]));
  return lines;
}

function showMetrics(ctx: CommandContext): string[] {
  const rows = ctx.store.getProviderMetrics(ctx.session.id);
  if (!rows.length) return [chalk.gray("No provider metrics yet.")];
  const lines = ["Provider metrics:"];
  for (const row of rows) {
    lines.push(
      `  ${row.provider}: calls=${row.calls} errors=${row.errors} avgLatencyMs=${row.avg_latency_ms}`,
    );
  }
  return lines;
}

function showHistory(ctx: CommandContext, args: string[]): string[] {
  const type = (args[0] ?? "sessions").toLowerCase();
  if (type === "messages") {
    const rows = ctx.store.getRecentMessages(20);
    if (!rows.length) return [chalk.gray("No recent messages.")];
    return [
      "Recent messages:",
      ...rows.map((r) => `  [${r.created_at}] ${r.role}: ${r.content.slice(0, 80)}`),
    ];
  }
  if (type === "patches") {
    const rows = ctx.store.getRecentPatches(20);
    if (!rows.length) return [chalk.gray("No recent patches.")];
    return [
      "Recent patches:",
      ...rows.map((r) => `  [${r.createdAt}] ${r.status} ${r.filePath} (${r.agentId})`),
    ];
  }
  const sessions = ctx.store.getRecentSessions(20);
  if (!sessions.length) return [chalk.gray("No sessions yet.")];
  return [
    "Recent sessions:",
    ...sessions.map((s) => `  [${s.updated_at}] ${s.project_name} (${s.cwd})`),
  ];
}

function showDiff(ctx: CommandContext): string[] {
  const pending = ctx.store.getPatches(ctx.session.id, "pending");
  if (!pending.length) return [chalk.gray("No pending patches.")];
  return pending.map((p) => formatPatchForDisplay(p));
}

async function applyCommand(
  ctx: CommandContext,
  args: string[],
): Promise<string[]> {
  const warn = await warnIfDirty(ctx.session.root);
  const lines: string[] = [];
  if (warn) lines.push(chalk.yellow(warn));

  let pending = ctx.store.getPatches(ctx.session.id, "pending");
  const target = args[0];

  if (target && target !== "all") {
    pending = pending.filter(
      (p) => p.id === target || p.id.startsWith(target),
    );
  }
  if (!pending.length) return [...lines, chalk.gray("No pending patches to apply.")];

  const backupDir = getBackupDir(ctx.session.id);
  try {
    const result = await applyPatches(ctx.session.root, pending, backupDir);
    for (const patch of pending) {
      if (result.applied.includes(patch.id)) {
        const backup = result.backups.get(patch.id);
        ctx.store.updatePatchStatus(patch.id, "applied", backup);
      }
    }
    lines.push(
      chalk.green(`Applied ${result.applied.length} patch(es). Use /rollback to undo.`),
    );
  } catch (err) {
    lines.push(chalk.red(`Apply failed: ${err instanceof Error ? err.message : err}`));
  }
  return lines;
}

function rejectCommand(ctx: CommandContext, args: string[]): string[] {
  let pending = ctx.store.getPatches(ctx.session.id, "pending");
  const target = args[0];

  if (target && target !== "all") {
    pending = pending.filter(
      (p) => p.id === target || p.id.startsWith(target),
    );
  }
  if (!pending.length) return [chalk.gray("No pending patches to reject.")];

  for (const p of pending) {
    ctx.store.updatePatchStatus(p.id, "rejected");
  }
  return [chalk.green(`Rejected ${pending.length} patch(es).`)];
}

function showArtifacts(ctx: CommandContext, args: string[]): string[] {
  const artifacts = listAgentArtifacts(ctx.session.root, ctx.session.id);
  if (!artifacts.length) {
    return [
      chalk.gray("No agent artifacts yet."),
      chalk.gray(`Path: .ai-shell/agents/${ctx.session.id}/`),
    ];
  }

  const lines = [
    `Agent artifacts (${artifacts.length}):`,
    chalk.gray(`Directory: .ai-shell/agents/${ctx.session.id}/`),
    "",
  ];

  const previewArg = args[0];
  const limit = previewArg && previewArg !== "preview" ? 20 : 10;

  for (const a of artifacts.slice(0, limit)) {
    const when = new Date(a.mtimeMs).toISOString();
    lines.push(`  ${a.relativePath}  (${a.role}, ${when})`);
  }

  if (args[0] === "preview" || args.includes("preview")) {
    const latest = artifacts[0]!;
    const fullPath = path.join(ctx.session.root, latest.relativePath);
    const body = fs.readFileSync(fullPath, "utf-8");
    lines.push("", chalk.bold("--- Latest artifact preview ---"), body.slice(0, 2000));
    if (body.length > 2000) lines.push(chalk.gray("... (truncated)"));
  }

  return lines;
}

function showSessions(ctx: CommandContext): string[] {
  const sessions = ctx.store.getRecentSessions(15);
  if (!sessions.length) return [chalk.gray("No sessions yet.")];

  const lines = [
    "Recent sessions (run ai connect -C <path> to switch project):",
    "",
  ];
  for (const s of sessions) {
    const current = s.cwd === ctx.session.root ? chalk.green(" (current)") : "";
    lines.push(`  [${s.updated_at}] ${s.project_name}${current}`);
    lines.push(chalk.gray(`    ${s.cwd}`));
    lines.push(chalk.gray(`    id: ${s.id}`));
  }
  return lines;
}

async function rollbackCommand(
  ctx: CommandContext,
  args: string[],
): Promise<string[]> {
  let applied = ctx.store.getPatches(ctx.session.id, "applied");
  const target = args[0];
  if (target && target !== "all") {
    applied = applied.filter(
      (p) => p.id === target || p.id.startsWith(target),
    );
  }
  if (!applied.length) return [chalk.gray("No applied patches to rollback.")];

  await rollbackPatches(ctx.session.root, applied);
  for (const p of applied) {
    ctx.store.updatePatchStatus(p.id, "rolled_back");
  }
  return [chalk.green(`Rolled back ${applied.length} patch(es).`)];
}

function showStatus(ctx: CommandContext): string[] {
  const pending = ctx.store.getPatches(ctx.session.id, "pending");
  const applied = ctx.store.getPatches(ctx.session.id, "applied");
  const rejected = ctx.store.getPatches(ctx.session.id, "rejected");
  const msgs = ctx.store.getMessages(ctx.session.id, 5);
  const plan = ctx.store.getSessionPlan(ctx.session.id);
  const memorySummary = ctx.store.getSessionSummary(ctx.session.id);
  const artifacts = listAgentArtifacts(ctx.session.root, ctx.session.id);
  const projectMemoryCount = ctx.store.getProjectMemoryCount(ctx.session.root);
  const latestProjectMemory = ctx.store.getProjectMemories(ctx.session.root, 1)[0];
  const openai = ctx.session.config.keys?.openai;
  const anthropic = ctx.session.config.keys?.anthropic;
  const huggingface = ctx.session.config.keys?.huggingface;
  const openrouter = ctx.session.config.keys?.openrouter;

  const lines = [
    `Project: ${ctx.session.projectName}`,
    `Root: ${ctx.session.root}`,
    `Session: ${ctx.session.id}`,
    `Stacks: ${ctx.session.profile.stacks.join(", ")}`,
    `Provider: ${ctx.session.config.provider}`,
    `OpenAI key: ${openai ? "set" : "not set"}`,
    `Anthropic key: ${anthropic ? "set" : "not set"}`,
    `HuggingFace key: ${huggingface ? "set" : "not set"}`,
    `OpenRouter key: ${openrouter ? "set" : "not set"}`,
    `Pending patches: ${pending.length}`,
    `Applied patches: ${applied.length}`,
    `Rejected patches: ${rejected.length}`,
    `Agent artifacts: ${artifacts.length}`,
    `Project memory entries: ${projectMemoryCount}`,
    `Memory capture: ${ctx.session.config.memory?.enabled !== false ? "on" : "off"}`,
    `MCP: ${ctx.session.config.mcp?.enabled ? "on" : "off"}`,
    `Recent messages: ${msgs.length}`,
  ];

  const prUrl = ctx.store.getSessionPrUrl(ctx.session.id);
  if (prUrl) {
    lines.push(`Last PR: ${prUrl}`);
  }

  const mcp = ctx.getMcpManager?.();
  if (mcp?.lastPrefetchError) {
    lines.push(chalk.yellow(`MCP prefetch error: ${mcp.lastPrefetchError}`));
  }

  if (plan) {
    lines.push("", "Plan tasks:");
    for (const t of plan.tasks) {
      lines.push(`  [${t.status}] ${t.agent}: ${t.description.slice(0, 80)}`);
    }
  }
  if (memorySummary) {
    lines.push("", "Session memory:", chalk.gray(memorySummary.slice(0, 300)));
  }
  if (latestProjectMemory) {
    lines.push(
      "",
      "Latest project memory:",
      chalk.gray(
        `(${latestProjectMemory.kind}) ${latestProjectMemory.content.slice(0, 200)}`,
      ),
    );
  }

  return lines;
}

function listAgents(ctx: CommandContext): string[] {
  const aliases = ctx.registry.listAliases();
  const lines = ["Agents:"];
  for (const { alias, role } of aliases) {
    lines.push(`  @${alias} → ${role}`);
  }
  lines.push("", "Roles: techLead, backend, qa, architect");
  return lines;
}

function parseRoleArg(arg: string): AgentRole | null {
  switch (arg) {
    case "techLead":
    case "backend":
    case "qa":
    case "architect":
      return arg;
    default:
      return null;
  }
}
