#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import { Session } from "../core/session.js";
import { MemoryStore } from "../memory/store.js";
import { ReplRuntime } from "../core/runtime.js";
import { startRepl } from "../cli/repl.js";
import { registerConfigCommands } from "../cli/config-cli.js";
import { ensureConfigFile } from "../config/store.js";
import { startDashboardServer } from "../dashboard/server.js";

const program = new Command();

program
  .name("ai")
  .description("AI Shell — multi-agent engineering CLI")
  .version("0.1.0");

registerConfigCommands(program);

program
  .command("connect")
  .description("Connect to project and start interactive shell")
  .option("-C, --cwd <path>", "Project directory", process.cwd())
  .action(async (opts: { cwd: string }) => {
    const store = new MemoryStore();
    try {
      const root = path.resolve(opts.cwd);
      ensureConfigFile(root);
      const session = await Session.create(root, store);
      const runtime = new ReplRuntime(session, store);
      await startRepl({ session, store, runtime });
    } catch (err) {
      console.error(
        chalk.red(err instanceof Error ? err.message : String(err)),
      );
      store.close();
      process.exit(1);
    }
  });

program
  .command("dashboard")
  .description("Launch local dashboard UI")
  .option("-C, --cwd <path>", "Project directory", process.cwd())
  .action(async (opts: { cwd: string }) => {
    const root = path.resolve(opts.cwd);
    const server = await startDashboardServer(root);
    console.log(chalk.green(`Dashboard running at ${server.url}`));
    openBrowser(server.url);
    process.on("SIGINT", async () => {
      await server.close();
      process.exit(0);
    });
  });

program
  .command("metrics")
  .description("Show provider metrics from latest session")
  .option("-C, --cwd <path>", "Project directory", process.cwd())
  .action((opts: { cwd: string }) => {
    const root = path.resolve(opts.cwd);
    const store = new MemoryStore();
    try {
      const session = store.getRecentSessions(1).find((s) => s.cwd === root);
      if (!session) {
        console.log(chalk.gray("No session metrics yet."));
        return;
      }
      const rows = store.getProviderMetrics(session.id);
      if (!rows.length) {
        console.log(chalk.gray("No provider metrics yet."));
        return;
      }
      for (const row of rows) {
        console.log(
          `${row.provider}: calls=${row.calls} errors=${row.errors} avgLatencyMs=${row.avg_latency_ms}`,
        );
      }
    } finally {
      store.close();
    }
  });

program
  .command("history")
  .description("Show recent history (sessions|messages|patches)")
  .option("-t, --type <type>", "History type", "sessions")
  .action((opts: { type: string }) => {
    const store = new MemoryStore();
    try {
      const type = opts.type.toLowerCase();
      if (type === "messages") {
        const rows = store.getRecentMessages(30);
        rows.forEach((r) =>
          console.log(`[${r.created_at}] ${r.role} ${r.content.slice(0, 120)}`),
        );
        return;
      }
      if (type === "patches") {
        const rows = store.getRecentPatches(30);
        rows.forEach((r) =>
          console.log(`[${r.createdAt}] ${r.status} ${r.filePath} (${r.agentId})`),
        );
        return;
      }
      const sessions = store.getRecentSessions(30);
      sessions.forEach((s) =>
        console.log(`[${s.updated_at}] ${s.project_name} (${s.cwd})`),
      );
    } finally {
      store.close();
    }
  });

program.parse();

function openBrowser(url: string): void {
  const platform = process.platform;
  if (platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true });
  } else if (platform === "darwin") {
    spawn("open", [url], { stdio: "ignore", detached: true });
  } else {
    spawn("xdg-open", [url], { stdio: "ignore", detached: true });
  }
}
