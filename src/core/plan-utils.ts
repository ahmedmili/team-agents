import { v4 as uuidv4 } from "uuid";
import type { PlanOutput } from "../schemas/index.js";

const ANALYSIS_PATTERN =
  /\b(analy[sz]e|analysis|audit|review|assess|evaluate|inspect|document)\b/i;

/** True when the user wants read-only project analysis (no code patches). */
export function isAnalysisRequest(userMessage: string): boolean {
  return ANALYSIS_PATTERN.test(userMessage);
}

function defaultImplementationTasks(userMessage: string) {
  return [
    {
      id: uuidv4(),
      agent: "backend" as const,
      description: `Implement for: ${userMessage.slice(0, 300)}`,
      status: "pending" as const,
    },
    {
      id: uuidv4(),
      agent: "qa" as const,
      description: "Validate implementation, edge cases, and tests",
      status: "pending" as const,
    },
    {
      id: uuidv4(),
      agent: "architect" as const,
      description: "Review architecture, boundaries, and scalability",
      status: "pending" as const,
    },
  ];
}

function defaultAnalysisTasks(userMessage: string) {
  return [
    {
      id: uuidv4(),
      agent: "architect" as const,
      description: `Architecture and structure review: ${userMessage.slice(0, 300)}`,
      status: "pending" as const,
    },
    {
      id: uuidv4(),
      agent: "qa" as const,
      description: "Quality, testing gaps, and risk assessment",
      status: "pending" as const,
    },
  ];
}

/** Default task pipeline when the Tech Lead returns an empty or unusable plan. */
export function ensureDefaultPlanTasks(
  plan: PlanOutput,
  userMessage: string,
): PlanOutput {
  const analysis = isAnalysisRequest(userMessage);
  const summary =
    plan.summary?.trim() ||
    (analysis
      ? `Analysis plan for: ${userMessage.slice(0, 200)}`
      : `Default plan for: ${userMessage.slice(0, 200)}`);

  const tasks =
    plan.tasks?.length > 0
      ? plan.tasks
      : analysis
        ? defaultAnalysisTasks(userMessage)
        : defaultImplementationTasks(userMessage);

  return {
    ...plan,
    summary,
    tasks,
    questions: plan.questions ?? [],
  };
}
