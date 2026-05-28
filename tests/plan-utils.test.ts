import { describe, it, expect } from "vitest";
import {
  ensureDefaultPlanTasks,
  isAnalysisRequest,
} from "../src/core/plan-utils.js";

describe("ensureDefaultPlanTasks", () => {
  it("uses read-only analysis pipeline for analyse/analyze requests", () => {
    expect(isAnalysisRequest("make project analyse")).toBe(true);
    const plan = ensureDefaultPlanTasks(
      { summary: "", tasks: [], questions: [] },
      "make project analyse",
    );
    expect(plan.tasks).toHaveLength(2);
    expect(plan.tasks.map((t) => t.agent)).toEqual(["architect", "qa"]);
  });

  it("adds implementation pipeline for build requests", () => {
    const plan = ensureDefaultPlanTasks(
      { summary: "", tasks: [], questions: [] },
      "add JWT authentication",
    );
    expect(plan.tasks).toHaveLength(3);
    expect(plan.tasks.map((t) => t.agent)).toEqual([
      "backend",
      "qa",
      "architect",
    ]);
  });

  it("preserves existing tasks", () => {
    const plan = ensureDefaultPlanTasks(
      {
        summary: "Custom",
        tasks: [
          {
            id: "1",
            agent: "backend",
            description: "Only backend",
            status: "pending",
          },
        ],
        questions: [],
      },
      "x",
    );
    expect(plan.tasks).toHaveLength(1);
    expect(plan.summary).toBe("Custom");
  });
});
