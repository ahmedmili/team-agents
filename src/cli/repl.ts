import readline from "node:readline";
import chalk from "chalk";
import { parseInput } from "../core/parser.js";
import { formatPrompt, Session, type Session as SessionType } from "../core/session.js";
import { ensureConfigFile } from "../config/store.js";
import path from "node:path";
import fs from "fs-extra";
import type { MemoryStore } from "../memory/store.js";
import { handleCommand, type CommandContext } from "./commands.js";
import { ReplRuntime } from "../core/runtime.js";
import { formatErrorMessage } from "../utils/errors.js";

export interface ReplDeps {
  session: SessionType;
  store: MemoryStore;
  runtime: ReplRuntime;
}

export async function startRepl(deps: ReplDeps): Promise<void> {
  const { store, runtime } = deps;
  let session = deps.session;

  let exiting = false;
  const ctx: CommandContext = {
    get session() {
      return session;
    },
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
    getMcpManager: () => runtime.mcpManager,
    onSwitchProject: async (newRoot: string) => {
      const resolved = path.resolve(newRoot);
      if (!fs.existsSync(resolved)) {
        throw new Error(`Path not found: ${resolved}`);
      }
      ensureConfigFile(resolved);
      const newSession = await Session.create(resolved, store);
      session = newSession;
      deps.session = newSession;
      runtime.session = newSession;
      runtime.reload();
      printBanner(session);
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
      void runtime.close();
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
          await runtime.close();
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
    void (async () => {
      if (!exiting) console.log(chalk.gray("\nSession saved."));
      await runtime.close();
      store.close();
      process.exit(0);
    })();
  });

  loop();
}

export function printBanner(session: SessionType): void {
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
