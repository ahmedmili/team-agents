import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryStore } from "../src/memory/store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("project memory store", () => {
  let store: MemoryStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(__dirname, `.mem-test-${Date.now()}.db`);
    store = new MemoryStore(dbPath);
  });

  afterEach(() => {
    store.close();
  });

  it("appends and retrieves entries by cwd", () => {
    const cwd = path.resolve("/tmp/project-a");
    store.appendProjectMemory(cwd, {
      kind: "finding",
      content: "Missing tests for auth module",
      sourceAgent: "qa",
    });

    const entries = store.getProjectMemories(cwd, 10);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.kind).toBe("finding");
    expect(store.getProjectMemoryCount(cwd)).toBe(1);
  });

  it("deduplicates same kind and content", () => {
    const cwd = path.resolve("/tmp/project-b");
    store.appendProjectMemory(cwd, {
      kind: "summary",
      content: "Same text",
    });
    store.appendProjectMemory(cwd, {
      kind: "summary",
      content: "Same text",
    });
    expect(store.getProjectMemoryCount(cwd)).toBe(1);
  });

  it("prunes oldest entries when over cap", () => {
    const cwd = path.resolve("/tmp/project-c");
    for (let i = 0; i < 5; i++) {
      store.appendProjectMemory(
        cwd,
        { kind: "decision", content: `entry-${i}` },
        3,
      );
    }
    expect(store.getProjectMemoryCount(cwd)).toBe(3);
    const entries = store.getProjectMemories(cwd, 10);
    expect(entries.map((e) => e.content)).toEqual([
      "entry-4",
      "entry-3",
      "entry-2",
    ]);
  });

  it("clear removes all entries for cwd", () => {
    const cwd = path.resolve("/tmp/project-d");
    store.appendProjectMemory(cwd, { kind: "question", content: "Why?" });
    const removed = store.clearProjectMemory(cwd);
    expect(removed).toBe(1);
    expect(store.getProjectMemoryCount(cwd)).toBe(0);
  });
});
