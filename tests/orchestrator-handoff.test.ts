import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryStore } from "../src/memory/store.js";
import { formatHandoffBlock, handoffFromAgentOutput } from "../src/core/handoff.js";
import type { AgentOutput } from "../src/schemas/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("orchestrator handoff integration", () => {
  let store: MemoryStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(__dirname, `.handoff-test-${Date.now()}.db`);
    store = new MemoryStore(dbPath);
  });

  afterEach(() => {
    store.close();
  });

  it("cumulative handoff block includes prior agents only", () => {
    const first: AgentOutput = {
      agentId: "techLead",
      type: "plan",
      data: { summary: "Plan A", tasks: [], questions: [] },
    };
    const second: AgentOutput = {
      agentId: "backend",
      type: "patch",
      data: { summary: "Patch B", patches: [] },
    };

    const log = [
      handoffFromAgentOutput(first),
      handoffFromAgentOutput(second),
    ];

    const beforeBackend = formatHandoffBlock(log.slice(0, 1));
    expect(beforeBackend).toContain("[techLead]");
    expect(beforeBackend).not.toContain("[backend]");

    const full = formatHandoffBlock(log);
    expect(full).toContain("[techLead]");
    expect(full).toContain("[backend]");
  });

  it("persists handoff log on session state", () => {
    const session = store.getOrCreateSession("/tmp/handoff-proj", "handoff-proj");
    const entries = [
      handoffFromAgentOutput({
        agentId: "qa",
        type: "review",
        data: { summary: "QA done", approved: true, findings: [] },
      }),
    ];
    store.saveSessionHandoffs(session.id, entries);

    const loaded = store.getSessionHandoffs(session.id);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.agent).toBe("qa");
  });
});
