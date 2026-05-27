#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { Session } from "../core/session.js";
import { MemoryStore } from "../memory/store.js";
import { createLlmProvider } from "../llm/factory.js";
import { AgentRegistry } from "../agents/registry.js";
import { startRepl } from "../cli/repl.js";

const program = new Command();

program
  .name("ai")
  .description("AI Shell — multi-agent engineering CLI")
  .version("0.1.0");

program
  .command("connect")
  .description("Connect to project and start interactive shell")
  .option("-C, --cwd <path>", "Project directory", process.cwd())
  .action(async (opts: { cwd: string }) => {
    const store = new MemoryStore();
    try {
      const session = await Session.create(opts.cwd, store);
      const llm = createLlmProvider(session.config);
      const registry = new AgentRegistry(llm, session.config);
      await startRepl({ session, store, registry });
    } catch (err) {
      console.error(
        chalk.red(err instanceof Error ? err.message : String(err)),
      );
      store.close();
      process.exit(1);
    }
  });

program.parse();
