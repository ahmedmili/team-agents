import type { PlanOutput } from "../schemas/index.js";

export interface WorkflowTask {
  id: string;
  agent: string;
  description: string;
  status: "pending" | "done";
  dependsOn: string[];
}

export interface WorkflowState {
  id: string;
  createdAt: string;
  updatedAt: string;
  epic: string;
  checkpoint: "planning" | "execution" | "review";
  tasks: WorkflowTask[];
}

export function createWorkflowFromPlan(
  epic: string,
  plan: PlanOutput,
): WorkflowState {
  const now = new Date().toISOString();
  return {
    id: `wf-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
    epic,
    checkpoint: "planning",
    tasks: plan.tasks.map((t) => ({
      id: t.id,
      agent: t.agent,
      description: t.description,
      status: t.status,
      dependsOn: [],
    })),
  };
}

export function markWorkflowTaskDone(
  state: WorkflowState,
  taskId: string,
): WorkflowState {
  const tasks = state.tasks.map((t) =>
    t.id === taskId ? { ...t, status: "done" as const } : t,
  );
  return {
    ...state,
    tasks,
    updatedAt: new Date().toISOString(),
    checkpoint: tasks.every((t) => t.status === "done") ? "review" : "execution",
  };
}

export function nextWorkflowTask(state: WorkflowState): WorkflowTask | null {
  return state.tasks.find((t) => t.status === "pending") ?? null;
}

export function workflowSummaryLines(state: WorkflowState): string[] {
  const done = state.tasks.filter((t) => t.status === "done").length;
  return [
    `Workflow: ${state.id}`,
    `Epic: ${state.epic}`,
    `Checkpoint: ${state.checkpoint}`,
    `Tasks: ${done}/${state.tasks.length} done`,
  ];
}

