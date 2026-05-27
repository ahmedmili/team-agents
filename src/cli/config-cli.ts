import { Command } from "commander";
import chalk from "chalk";
import path from "node:path";
import {
  ensureConfigFile,
  getKeysStatus,
  setAgentProvider,
  setApiKey,
  setProvider,
  parseProviderArg,
  getConfigPath,
} from "../config/store.js";
import { listConfiguredProviders, loadConfig } from "../config/loader.js";
import type { AgentRole } from "../schemas/index.js";

export function registerConfigCommands(program: Command): void {
  const config = program
    .command("config")
    .description("Manage .ai-shell.json (API keys and provider)");

  config
    .command("keys")
    .description("Show configured API keys (masked)")
    .option("-C, --cwd <path>", "Project directory", process.cwd())
    .action((opts: { cwd: string }) => {
      const root = path.resolve(opts.cwd);
      ensureConfigFile(root);
      const loaded = loadConfig(root);
      console.log(chalk.bold(`\n${getConfigPath(root)}\n`));
      console.log(`Provider: ${chalk.cyan(loaded.provider ?? "mock")}\n`);
      console.log("API keys:");
      for (const row of getKeysStatus(loaded)) {
        const color = row.set ? chalk.green : chalk.gray;
        console.log(`  ${row.label.padEnd(12)} ${color(row.value)}`);
      }
      console.log(
        chalk.gray(
          '\nEdit JSON:  "keys": { "openai": "sk-...", "huggingface": "hf_..." }\nOr CLI:      ai config set-key huggingface hf_...\n',
        ),
      );
    });

  config
    .command("set-key <provider> <key>")
    .description("Save API key to .ai-shell.json")
    .option("-C, --cwd <path>", "Project directory", process.cwd())
    .action((providerArg: string, key: string, opts: { cwd: string }) => {
      const root = path.resolve(opts.cwd);
      const provider = parseProviderArg(providerArg);
      setApiKey(root, provider, key);
      console.log(
        chalk.green(
          `Saved ${provider} key to ${getConfigPath(root)} (provider set to ${provider}).`,
        ),
      );
    });

  config
    .command("set-provider <provider>")
    .description("Set active provider (openai | anthropic | huggingface | openrouter | puter | mock)")
    .option("-C, --cwd <path>", "Project directory", process.cwd())
    .action((providerArg: string, opts: { cwd: string }) => {
      const root = path.resolve(opts.cwd);
      const provider = parseProviderArg(providerArg);
      setProvider(root, provider);
      console.log(
        chalk.green(`Provider set to ${provider} in ${getConfigPath(root)}.`),
      );
    });

  config
    .command("set-agent <role> <provider>")
    .description("Set per-agent provider or clear override")
    .option("-C, --cwd <path>", "Project directory", process.cwd())
    .action(
      (roleArg: string, providerArg: string, opts: { cwd: string }) => {
        const root = path.resolve(opts.cwd);
        const role = parseRoleArg(roleArg);
        if (!role) {
          throw new Error(
            "Invalid role. Use: techLead, backend, qa, architect",
          );
        }
        const provider =
          providerArg.toLowerCase() === "clear"
            ? "clear"
            : parseProviderArg(providerArg);
        setAgentProvider(root, role, provider);
        console.log(
          provider === "clear"
            ? chalk.green(`Cleared provider override for ${role}.`)
            : chalk.green(`Set ${role} provider override to ${provider}.`),
        );
      },
    );

  config
    .command("providers")
    .description("Show configured and active providers")
    .option("-C, --cwd <path>", "Project directory", process.cwd())
    .action((opts: { cwd: string }) => {
      const root = path.resolve(opts.cwd);
      ensureConfigFile(root);
      const loaded = loadConfig(root);
      const configured = listConfiguredProviders(loaded);
      console.log(`Global provider: ${loaded.provider ?? "mock"}`);
      console.log(`Configured providers: ${configured.join(", ")}`);
      console.log("Per-agent overrides:");
      const entries = loaded.agentProviders ?? {};
      if (!Object.keys(entries).length) {
        console.log(chalk.gray("  (none)"));
      } else {
        for (const [role, provider] of Object.entries(entries)) {
          console.log(`  ${role}: ${provider}`);
        }
      }
    });

  config
    .command("init")
    .description("Create .ai-shell.json in the current project")
    .option("-C, --cwd <path>", "Project directory", process.cwd())
    .action((opts: { cwd: string }) => {
      const root = path.resolve(opts.cwd);
      const file = ensureConfigFile(root);
      console.log(chalk.green(`Created ${getConfigPath(root)}`));
      console.log(
        chalk.gray(
          'Add your keys under "keys" or run: ai config set-key openrouter or-...',
        ),
      );
      if (
        !file.keys?.openai &&
        !file.keys?.anthropic &&
        !file.keys?.huggingface &&
        !file.keys?.openrouter
      ) {
        console.log(chalk.yellow("No API keys yet — provider defaults to mock."));
      }
    });
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
