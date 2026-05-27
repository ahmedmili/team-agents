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

export interface CommandContext {
  session: Session;
  store: MemoryStore;
  registry: AgentRegistry;
  onExit: () => void;
  onRefresh: () => Promise<void>;
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
    case "connect":
      await ctx.onRefresh();
      return [chalk.green("Session refreshed.")];
    default:
      return [chalk.red(`Unknown command: /${command}. Type /help`)]
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
  /connect           Refresh repo scan
  /exit              Leave shell

Natural: describe what to build
Agent:   @karim implement feature
`.trim();
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
  return [
    `Project: ${ctx.session.projectName}`,
    `Root: ${ctx.session.root}`,
    `Stacks: ${ctx.session.profile.stacks.join(", ")}`,
    `Provider: ${ctx.session.config.provider}`,
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
