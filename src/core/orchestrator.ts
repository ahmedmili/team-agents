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
import { ScopeViolationError } from "../utils/errors.js";
import { getScopeForRole } from "../config/loader.js";
import type { Session } from "./session.js";
import type { RouteResult } from "./router.js";
import type { AgentInput } from "../agents/base.js";
import { ensureDefaultPlanTasks, isAnalysisRequest } from "./plan-utils.js";
import { extractMemoryEntries } from "../memory/capture.js";
import { formatProjectMemoryBlock } from "../memory/context.js";
import {
  formatHandoffBlock,
  handoffFromAgentOutput,
  type HandoffEntry,
} from "./handoff.js";
import type { McpManager } from "../mcp/client.js";
import { prefetchExternalContext } from "../mcp/prefetch.js";
import { runAgentLoop, type LoopTrace } from "./agent-loop.js";
import {
  createWorkflowFromPlan,
  markWorkflowTaskDone,
  type WorkflowState,
} from "./workflow.js";
import chalk from "chalk";
import fs from "fs-extra";
import path from "node:path";

interface AgentExecution {
  output: AgentOutput;
  artifactPath: string | null;
}

export class Orchestrator {
  private steps = 0;
  private handoffLog: HandoffEntry[] = [];
  private policyDenials = 0;

  constructor(
    private session: Session,
    private registry: AgentRegistry,
    private store: MemoryStore,
    private mcpManager: McpManager | null = null,
  ) {}

  async handleRoute(route: RouteResult): Promise<string[]> {
    this.steps = 0;
    this.handoffLog = [];
    this.policyDenials = 0;
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

    const peerHandoffs = this.loadPeerHandoffsFromSession(route.targetRole);
    const execution = await this.runAgent(
      route.targetRole,
      route.message,
      peerHandoffs || undefined,
    );
    lines.push(...this.formatOutput(execution));

    if (execution.output.type === "patch") {
      const { saved, warnings } = await this.persistPatches(
        execution.output,
        execution.output.agentId,
      );
      if (saved.length) {
        lines.push(
          chalk.green(`\n${saved.length} patch(es) queued. Use /diff and /apply.`),
        );
      }
      lines.push(...warnings);
    }

    return lines;
  }

  private async runOrchestratedFlow(
    message: string,
    maxSteps: number,
  ): Promise<string[]> {
    const lines: string[] = [];
    const planOut = await this.runAgent("techLead", message);
    lines.push(...this.formatOutput(planOut));

    if (planOut.output.type !== "plan") return lines;

    const rawPlan = planOut.output.data as PlanOutput;
    let plan = ensureDefaultPlanTasks(rawPlan, message);
    if (!rawPlan.tasks?.length) {
      const pipelineHint = isAnalysisRequest(message)
        ? "architect → qa (read-only analysis)"
        : "backend → qa → architect";
      lines.push(
        chalk.yellow(
          `  Tech Lead returned no tasks — running default ${pipelineHint} pipeline.`,
        ),
      );
      planOut.output.data = plan;
    }
    this.store.saveSessionPlan(this.session.id, plan);
    let workflow: WorkflowState | null = null;
    if (this.session.config.workflow?.enabled !== false) {
      workflow = createWorkflowFromPlan(message, plan);
      this.store.saveSessionWorkflow(this.session.id, JSON.stringify(workflow));
    }

    for (const task of plan.tasks) {
      if (task.status === "done") continue;
      if (this.steps >= maxSteps) {
        lines.push(
          chalk.yellow(`\nMax steps (${maxSteps}) reached. Send another message to continue.`),
        );
        break;
      }
      this.steps++;
      const out = await this.runAgent(task.agent, task.description);
      lines.push(chalk.cyan(`\n→ Task [${task.agent}]: ${task.description}`));
      lines.push(...this.formatOutput(out));

      task.status = "done";
      this.store.saveSessionPlan(this.session.id, plan);
      if (workflow) {
        workflow = markWorkflowTaskDone(workflow, task.id);
        this.store.saveSessionWorkflow(this.session.id, JSON.stringify(workflow));
      }

      if (out.output.type === "patch") {
        const { saved, warnings } = await this.persistPatches(
          out.output,
          out.output.agentId,
        );
        if (saved.length) {
          lines.push(chalk.green(`  ${saved.length} patch(es) queued.`));
        }
        lines.push(...warnings);
      }
    }

    const sessionSummary = this.buildSessionSummary(plan, message);
    this.store.updateSessionSummary(this.session.id, sessionSummary);
    if (this.session.config.memory?.enabled !== false) {
      const maxEntries =
        this.session.config.memory?.maxEntriesPerProject ?? 200;
      this.store.appendProjectMemory(
        this.session.root,
        {
          kind: "summary",
          content: sessionSummary,
          sourceSessionId: this.session.id,
          sourceAgent: "techLead",
        },
        maxEntries,
      );
    }

    if (this.handoffLog.length) {
      this.store.saveSessionHandoffs(this.session.id, this.handoffLog);
    }
    if (this.policyDenials > 0) {
      const prior = this.store.getSessionLoopTrace(this.session.id);
      const parsed =
        prior && prior.trim().startsWith("{")
          ? (JSON.parse(prior) as Record<string, unknown>)
          : {};
      this.store.saveSessionLoopTrace(
        this.session.id,
        JSON.stringify({
          ...parsed,
          policyDenials: this.policyDenials,
        }),
      );
    }

    return lines;
  }

  private async runAgent(
    role: AgentRole,
    message: string,
    handoffOverride?: string,
  ): Promise<AgentExecution> {
    const agent = this.registry.get(role);
    const scope = getScopeForRole(this.session.config, role);
    validateStacks(scope, this.session.profile.stacks);

    const handoffBlock =
      handoffOverride ?? formatHandoffBlock(this.handoffLog);
    const input = await this.buildInput(message, handoffBlock || undefined);
    const loopResult = await runAgentLoop(agent, input, this.session.config.loop);
    const output = loopResult.output;
    this.persistLoopTrace(role, loopResult.trace);

    this.store.saveMessage(this.session.id, "user", message, role);
    this.store.saveMessage(
      this.session.id,
      "assistant",
      JSON.stringify(output),
      output.agentId,
    );

    this.captureProjectMemory(output);
    this.handoffLog.push(handoffFromAgentOutput(output));

    const artifactPath = this.writeAgentArtifact(role, message, output);
    return { output, artifactPath };
  }

  private persistLoopTrace(role: AgentRole, trace: LoopTrace): void {
    const priorRaw = this.store.getSessionLoopTrace(this.session.id);
    const prior = priorRaw && priorRaw.trim().startsWith("{")
      ? (JSON.parse(priorRaw) as Record<string, unknown>)
      : {};
    this.store.saveSessionLoopTrace(
      this.session.id,
      JSON.stringify({
        ...prior,
        [role]: trace,
      }),
    );
  }

  private loadPeerHandoffsFromSession(excludeRole?: AgentRole): string {
    const messages = this.store
      .getMessages(this.session.id, 100)
      .filter((m) => m.role === "assistant")
      .slice(-3);
    const entries: HandoffEntry[] = [];
    for (const m of messages) {
      try {
        const output = JSON.parse(m.content) as AgentOutput;
        if (excludeRole && output.agentId === excludeRole) continue;
        entries.push(handoffFromAgentOutput(output));
      } catch {
        // skip non-JSON assistant messages
      }
    }
    return formatHandoffBlock(entries);
  }

  private captureProjectMemory(output: AgentOutput): void {
    if (this.session.config.memory?.enabled === false) return;

    const maxEntries =
      this.session.config.memory?.maxEntriesPerProject ?? 200;

    for (const entry of extractMemoryEntries(output)) {
      this.store.appendProjectMemory(this.session.root, {
        ...entry,
        sourceSessionId: this.session.id,
      }, maxEntries);
    }
  }

  private async buildInput(
    message: string,
    agentHandoffs?: string,
  ): Promise<AgentInput> {
    const memorySummary = this.store.getSessionSummary(this.session.id);
    const projectEntries = this.store.getProjectMemories(this.session.root, 40);
    const projectMemory = formatProjectMemoryBlock(projectEntries);

    const externalContext = await prefetchExternalContext(
      this.mcpManager,
      this.session.root,
      message,
      this.session.config,
    );

    const recent = this.store
      .getMessages(this.session.id, 10)
      .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
      .join("\n");

    const conversationSummary = [
      memorySummary ? `[Session memory]\n${memorySummary}` : "",
      recent ? `[Recent messages]\n${recent}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    return {
      message,
      profile: this.session.profile,
      config: this.session.config,
      projectMemory: projectMemory || undefined,
      agentHandoffs,
      externalContext: externalContext || undefined,
      conversationSummary,
    };
  }

  private buildSessionSummary(plan: PlanOutput, userMessage: string): string {
    const doneTasks = plan.tasks
      .filter((t) => t.status === "done")
      .map((t) => `[${t.agent}] ${t.description}`)
      .join("; ");
    return [
      `Last request: ${userMessage.slice(0, 200)}`,
      `Plan: ${plan.summary.slice(0, 300)}`,
      doneTasks ? `Completed: ${doneTasks}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  private async persistPatches(output: AgentOutput, role: AgentRole): Promise<{
    saved: PatchRecord[];
    warnings: string[];
  }> {
    const data = output.data as PatchOutput;
    const scope = getScopeForRole(this.session.config, role);
    const customPolicy = Object.values(this.session.config.customAgents ?? {}).find(
      (a) => a.role === role,
    )?.policy;
    if (customPolicy && customPolicy.allowWrite === false && data.patches.length) {
      this.policyDenials += data.patches.length;
      return {
        saved: [],
        warnings: [
          chalk.yellow(
            `  ⚠ Policy denied ${data.patches.length} patch(es) from [${role}] (allowWrite=false).`,
          ),
        ],
      };
    }
    const saved: PatchRecord[] = [];
    const warnings: string[] = [];

    for (const p of data.patches) {
      try {
        validatePatchPath(
          this.session.root,
          p.filePath,
          scope,
          this.session.profile.stacks,
        );
      } catch (err) {
        const msg =
          err instanceof ScopeViolationError
            ? err.message
            : `Skipped patch for ${p.filePath}`;
        warnings.push(chalk.yellow(`  ⚠ ${msg}`));
        continue;
      }

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
    return { saved, warnings };
  }

  private formatOutput(execution: AgentExecution): string[] {
    const output = execution.output;
    const lines: string[] = [];
    const header = chalk.bold(`[${output.agentId}] ${output.type}`);

    switch (output.type) {
      case "plan": {
        const d = output.data as PlanOutput;
        lines.push(header, d.summary?.trim() || chalk.gray("(no summary returned)"));
        for (const t of d.tasks) {
          const status =
            t.status === "done" ? chalk.green(" [done]") : chalk.gray(" [pending]");
          lines.push(`  • [${t.agent}]${status} ${t.description}`);
        }
        if (!d.tasks.length) lines.push(chalk.gray("  • no tasks returned"));
        for (const q of d.questions ?? []) {
          if (q.trim()) lines.push(chalk.yellow(`  ? ${q}`));
        }
        break;
      }
      case "patch": {
        const d = output.data as PatchOutput;
        lines.push(header, d.summary?.trim() || chalk.gray("(no summary returned)"));
        for (const p of d.patches) {
          lines.push(`  • ${p.filePath}`);
        }
        if (!d.patches.length) lines.push(chalk.gray("  • no patches returned"));
        break;
      }
      case "review": {
        const d = output.data as ReviewOutput;
        lines.push(
          header,
          d.summary?.trim() || chalk.gray("(no summary returned)"),
          d.approved ? chalk.green("  ✓ approved") : chalk.red("  ✗ not approved"),
        );
        for (const f of d.findings) {
          lines.push(`  [${f.severity}] ${f.message}`);
        }
        if (!d.findings.length) lines.push(chalk.gray("  [info] no findings returned"));
        break;
      }
      default:
        lines.push(header, JSON.stringify(output.data));
    }
    if (execution.artifactPath) {
      lines.push(chalk.gray(`  saved: ${execution.artifactPath}`));
    }
    return lines;
  }

  private writeAgentArtifact(
    role: AgentRole,
    message: string,
    output: AgentOutput,
  ): string | null {
    try {
      const dir = path.join(this.session.root, ".ai-shell", "agents", this.session.id);
      fs.ensureDirSync(dir);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = `${stamp}-${role}.md`;
      const fullPath = path.join(dir, fileName);
      const relPath = path.relative(this.session.root, fullPath).replace(/\\/g, "/");
      const workflowJson = this.store.getSessionWorkflow(this.session.id);
      const loopTraceJson = this.store.getSessionLoopTrace(this.session.id);
      const markdown = [
        `# Agent ${role}`,
        "",
        `- Session: \`${this.session.id}\``,
        `- Time: ${new Date().toISOString()}`,
        `- Output type: \`${output.type}\``,
        workflowJson ? `- Workflow: \`${workflowJson.slice(0, 160)}\`` : "",
        loopTraceJson ? `- Loop trace: \`${loopTraceJson.slice(0, 160)}\`` : "",
        "",
        "## Prompt",
        "",
        "```text",
        message,
        "```",
        "",
        "## Output (JSON)",
        "",
        "```json",
        JSON.stringify(output.data, null, 2),
        "```",
        "",
      ].join("\n");
      fs.writeFileSync(fullPath, markdown, "utf8");
      return relPath;
    } catch {
      return null;
    }
  }
}
