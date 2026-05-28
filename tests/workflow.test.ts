import { describe, expect, it } from "vitest";
import {
  createWorkflowFromPlan,
  markWorkflowTaskDone,
  nextWorkflowTask,
  workflowSummaryLines,
} from "../src/core/workflow.js";

describe("workflow state", () => {
  it("creates workflow from plan tasks", () => {
    const workflow = createWorkflowFromPlan("Build feature", {
      summary: "plan",
      tasks: [
        { id: "t1", agent: "backend", description: "impl", status: "pending" },
        { id: "t2", agent: "qa", description: "test", status: "pending" },
      ],
      questions: [],
    });
    expect(workflow.tasks).toHaveLength(2);
    expect(workflow.checkpoint).toBe("planning");
  });

  it("advances workflow state when task is completed", () => {
    let workflow = createWorkflowFromPlan("Build feature", {
      summary: "plan",
      tasks: [{ id: "t1", agent: "backend", description: "impl", status: "pending" }],
      questions: [],
    });
    expect(nextWorkflowTask(workflow)?.id).toBe("t1");
    workflow = markWorkflowTaskDone(workflow, "t1");
    expect(nextWorkflowTask(workflow)).toBeNull();
    expect(workflow.checkpoint).toBe("review");
    expect(workflowSummaryLines(workflow).join("\n")).toContain("1/1");
  });
});

