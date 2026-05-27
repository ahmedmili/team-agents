import { describe, it, expect, afterEach } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { MemoryStore } from "../src/memory/store.js";

describe("MemoryStore", () => {
  let dbPath: string;
  let store: MemoryStore;

  afterEach(() => {
    store?.close();
    if (dbPath) fs.removeSync(dbPath);
  });

  it("creates and resumes session", () => {
    dbPath = path.join(os.tmpdir(), `ai-shell-mem-${Date.now()}.db`);
    store = new MemoryStore(dbPath);
    const s1 = store.getOrCreateSession("/proj/a", "proj-a");
    store.saveMessage(s1.id, "user", "hello");
    const s2 = store.getOrCreateSession("/proj/a", "proj-a");
    expect(s2.id).toBe(s1.id);
    expect(store.getMessages(s2.id).length).toBe(1);
  });
});
