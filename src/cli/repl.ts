import readline from "node:readline";
import chalk from "chalk";
import { parseInput } from "../core/parser.js";
import { formatPrompt, type Session } from "../core/session.js";
import type { MemoryStore } from "../memory/store.js";
import { handleCommand, type CommandContext } from "./commands.js";
import { ReplRuntime } from "../core/runtime.js";
import { formatErrorMessage } from "../utils/errors.js";

export interface ReplDeps {
  session: Session;
  store: MemoryStore;
  runtime: ReplRuntime;
}

export async function startRepl(deps: ReplDeps): Promise<void> {
  const { session, store, runtime } = deps;

  let exiting = false;
  const ctx: CommandContext = {
    session,
    store,
    get registry() {
      return runtime.registry;
    },
    onExit: () => {
      exiting = true;
    },
    onRefresh: async () => {
      await session.refreshProfile(store);
    },
    onReloadConfig: () => {
      runtime.reload();
    },
  };

  printBanner(session);

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
        const route = runtime.router.route(input, session.profile);
        const lines = await runtime.orchestrator.handleRoute(route);
        for (const l of lines) console.log(l);
      }
    } catch (err) {
      console.error(chalk.red(formatErrorMessage(err)));
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

function printBanner(session: Session): void {
  console.log(chalk.bold("\nAI Shell — connected"));
  console.log(chalk.gray(`Root: ${session.root}`));
  console.log(chalk.gray(`Stacks: ${session.profile.stacks.join(", ")}`));
  console.log(chalk.gray(`Provider: ${session.config.provider}`));
  console.log(chalk.gray(`Config: .ai-shell.json in ${session.root}`));
  if (session.config.provider === "mock") {
    console.log(
      chalk.yellow(
        "Using mock LLM — add keys in .ai-shell.json or use /setkey openai <key>",
      ),
    );
  }
  console.log(chalk.gray("\nType /help for commands.\n"));
}
