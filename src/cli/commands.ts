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

export interface CommandContext {
  session: Session;
  store: MemoryStore;
  registry: AgentRegistry;
  onExit: () => void;
  onRefresh: () => Promise<void>;
  onReloadConfig: () => void;
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
`.trim();
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
  const msgs = ctx.store.getMessages(ctx.session.id, 5);
  const openai = ctx.session.config.keys?.openai;
  const anthropic = ctx.session.config.keys?.anthropic;
  const huggingface = ctx.session.config.keys?.huggingface;
  const openrouter = ctx.session.config.keys?.openrouter;
  return [
    `Project: ${ctx.session.projectName}`,
    `Root: ${ctx.session.root}`,
    `Stacks: ${ctx.session.profile.stacks.join(", ")}`,
    `Provider: ${ctx.session.config.provider}`,
    `OpenAI key: ${openai ? "set" : "not set"}`,
    `Anthropic key: ${anthropic ? "set" : "not set"}`,
    `HuggingFace key: ${huggingface ? "set" : "not set"}`,
    `OpenRouter key: ${openrouter ? "set" : "not set"}`,
    `Pending patches: ${pending.length}`,
    `Applied patches: ${applied.length}`,
    `Recent messages: ${msgs.length}`,
  ];
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
