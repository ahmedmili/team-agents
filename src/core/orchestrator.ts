import { v4 as uuidv4 } from "uuid";
import type { AgentRegistry } from "../agents/registry.js";
import type { MemoryStore } from "../memory/store.js";
import type {
  AgentOutput,
  PatchOutput,
  PlanOutput,
  PatchRecord,
  ReviewOutput,
} from "../schemas/index.js";
import type { AgentRole } from "../schemas/index.js";
import { validatePatchPath, validateStacks } from "../diff/validate.js";
import { getAgentScopes } from "../config/loader.js";
import type { Session } from "./session.js";
import type { RouteResult } from "./router.js";
import type { AgentInput } from "../agents/base.js";
import chalk from "chalk";

export class Orchestrator {
  private steps = 0;

  constructor(
    private session: Session,
    private registry: AgentRegistry,
    private store: MemoryStore,
  ) {}

  async handleRoute(route: RouteResult): Promise<string[]> {
    this.steps = 0;
    const lines: string[] = [];

    if (route.escalated && route.escalationReason) {
      lines.push(chalk.yellow(route.escalationReason));
    }

    const maxSteps = this.session.config.maxSteps ?? 5;

    if (route.targetRole === "techLead" && !route.escalated) {
      const planLines = await this.runOrchestratedFlow(route.message, maxSteps);
      lines.push(...planLines);
      return lines;
    }

    const output = await this.runAgent(route.targetRole, route.message);
    lines.push(...this.formatOutput(output));

    if (output.type === "patch") {
      const saved = await this.persistPatches(output);
      lines.push(
        chalk.green(`\n${saved.length} patch(es) queued. Use /diff and /apply.`),
      );
    }

    return lines;
  }

  private async runOrchestratedFlow(
    message: string,
    maxSteps: number,
  ): Promise<string[]> {
    const lines: string[] = [];
    const input = this.buildInput(message);

    const planOut = await this.runAgent("techLead", message);
    lines.push(...this.formatOutput(planOut));

    if (planOut.type !== "plan") return lines;
    const plan = planOut.data as PlanOutput;

    for (const task of plan.tasks) {
      if (this.steps >= maxSteps) {
        lines.push(
          chalk.yellow(`\nMax steps (${maxSteps}) reached. Send another message to continue.`),
        );
        break;
      }
      this.steps++;
      const taskInput = this.buildInput(task.description);
      const out = await this.runAgent(task.agent, taskInput.message);
      lines.push(chalk.cyan(`\n→ Task [${task.agent}]: ${task.description}`));
      lines.push(...this.formatOutput(out));

      if (out.type === "patch") {
        const saved = await this.persistPatches(out);
        lines.push(chalk.green(`  ${saved.length} patch(es) queued.`));
      }
    }

    return lines;
  }

  private async runAgent(
    role: AgentRole,
    message: string,
  ): Promise<AgentOutput> {
    const agent = this.registry.get(role);
    const scope = getAgentScopes()[role];
    validateStacks(scope, this.session.profile.stacks);

    const input = this.buildInput(message);
    const output = await agent.run(input);

    this.store.saveMessage(this.session.id, "user", message, role);
    this.store.saveMessage(
      this.session.id,
      "assistant",
      JSON.stringify(output),
      output.agentId,
    );

    return output;
  }

  private buildInput(message: string): AgentInput {
    const recent = this.store
      .getMessages(this.session.id, 10)
      .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
      .join("\n");

    return {
      message,
      profile: this.session.profile,
      config: this.session.config,
      conversationSummary: recent,
    };
  }

  private async persistPatches(output: AgentOutput): Promise<PatchRecord[]> {
    const data = output.data as PatchOutput;
    const scope = getAgentScopes().backend;
    const saved: PatchRecord[] = [];

    for (const p of data.patches) {
      validatePatchPath(
        this.session.root,
        p.filePath,
        scope,
        this.session.profile.stacks,
      );
      const record: PatchRecord = {
        id: uuidv4(),
        sessionId: this.session.id,
        agentId: output.agentId,
        filePath: p.filePath.replace(/\\/g, "/"),
        unifiedDiff: p.unifiedDiff,
        description: p.description,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      this.store.savePatch(record);
      saved.push(record);
    }
    return saved;
  }

  private formatOutput(output: AgentOutput): string[] {
    const lines: string[] = [];
    const header = chalk.bold(`[${output.agentId}] ${output.type}`);

    switch (output.type) {
      case "plan": {
        const d = output.data as PlanOutput;
        lines.push(header, d.summary);
        for (const t of d.tasks) {
          lines.push(`  • [${t.agent}] ${t.description}`);
        }
        break;
      }
      case "patch": {
        const d = output.data as PatchOutput;
        lines.push(header, d.summary);
        for (const p of d.patches) {
          lines.push(`  • ${p.filePath}`);
        }
        break;
      }
      case "review": {
        const d = output.data as ReviewOutput;
        lines.push(
          header,
          d.summary,
          d.approved ? chalk.green("  ✓ approved") : chalk.red("  ✗ not approved"),
        );
        for (const f of d.findings) {
          lines.push(`  [${f.severity}] ${f.message}`);
        }
        break;
      }
      default:
        lines.push(header, JSON.stringify(output.data));
    }
    return lines;
  }
}
