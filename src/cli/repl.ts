import readline from "node:readline";
import chalk from "chalk";
import { parseInput } from "../core/parser.js";
import { Router } from "../core/router.js";
import { Orchestrator } from "../core/orchestrator.js";
import { formatPrompt, type Session } from "../core/session.js";
import type { MemoryStore } from "../memory/store.js";
import type { AgentRegistry } from "../agents/registry.js";
import { handleCommand, type CommandContext } from "./commands.js";
export interface ReplDeps {
  session: Session;
  store: MemoryStore;
  registry: AgentRegistry;
}

export async function startRepl(deps: ReplDeps): Promise<void> {
  const { session, store, registry } = deps;
  const router = new Router(registry);
  const orchestrator = new Orchestrator(session, registry, store);

  let exiting = false;
  const ctx: CommandContext = {
    session,
    store,
    registry,
    onExit: () => {
      exiting = true;
    },
    onRefresh: async () => {
      await session.refreshProfile(store);
    },
  };

  console.log(chalk.bold("\nAI Shell — connected"));
  console.log(chalk.gray(`Root: ${session.root}`));
  console.log(chalk.gray(`Stacks: ${session.profile.stacks.join(", ")}`));
  console.log(chalk.gray(`Provider: ${session.config.provider}`));
  if (session.config.provider === "mock") {
    console.log(
      chalk.yellow(
        "Using mock LLM (set OPENAI_API_KEY or ANTHROPIC_API_KEY for live models).",
      ),
    );
  }
  console.log(chalk.gray("\nType /help for commands.\n"));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  const prompt = () => rl.setPrompt(formatPrompt(session));

  const loop = () => {
    if (exiting) {
      rl.close();
      store.close();
      return;
    }
    prompt();
    rl.prompt();
  };

  rl.on("line", async (line) => {
    const input = parseInput(line);
    try {
      if (input.kind === "command") {
        const lines = await handleCommand(ctx, input.command, input.args);
        for (const l of lines) console.log(l);
        if (exiting) {
          rl.close();
          store.close();
          return;
        }
      } else if (input.kind === "natural" && !input.message) {
        // skip empty
      } else {
        const route = router.route(input, session.profile);
        const lines = await orchestrator.handleRoute(route);
        for (const l of lines) console.log(l);
      }
    } catch (err) {
      console.error(
        chalk.red(err instanceof Error ? err.message : String(err)),
      );
    }
    loop();
  });

  rl.on("close", () => {
    if (!exiting) console.log(chalk.gray("\nSession saved."));
    store.close();
    process.exit(0);
  });

  loop();
}
