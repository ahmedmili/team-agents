import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "fs-extra";
import { fileURLToPath } from "node:url";
import { Session } from "../src/core/session.js";
import { MemoryStore } from "../src/memory/store.js";
import { AgentRegistry } from "../src/agents/registry.js";
import { LlmRegistry } from "../src/llm/registry.js";
import { Router } from "../src/core/router.js";
import { Orchestrator } from "../src/core/orchestrator.js";
import { parseInput } from "../src/core/parser.js";
import {
  applyPatches,
  getBackupDir,
  rollbackPatches,
} from "../src/diff/apply.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sampleRoot = path.join(__dirname, "../examples/express-sample");

describe("Phase 1 integration (express-sample)", () => {
  let store: MemoryStore;
  let dbPath: string;

  beforeEach(async () => {
    dbPath = path.join(
      sampleRoot,
      `.ai-shell-test-${Date.now()}.db`,
    );
    store = new MemoryStore(dbPath);
  });

  afterEach(async () => {
    store.close();
    await fs.remove(dbPath);
    await fs.remove(path.join(sampleRoot, "src/auth"));
    await fs.remove(path.join(sampleRoot, "src/generated"));
  });

  it("full flow: plan → patch → diff → apply → rollback", async () => {
    const session = await Session.create(sampleRoot, store);
    expect(session.profile.stacks).toContain("express");

    const config = { ...session.config, provider: "mock" as const, keys: {} };
    const registry = new AgentRegistry(new LlmRegistry(config), config);
    const router = new Router(registry);
    const orchestrator = new Orchestrator(session, registry, store);

    const route = router.route(
      parseInput("add JWT authentication"),
      session.profile,
    );
    await orchestrator.handleRoute(route);

    let pending = store.getPatches(session.id, "pending");
    expect(pending.length).toBeGreaterThan(0);

    const backupDir = getBackupDir(session.id);
    await applyPatches(sampleRoot, pending, backupDir);
    for (const p of pending) {
      store.updatePatchStatus(p.id, "applied");
    }

    const target = pending[0]!.filePath;
    expect(fs.existsSync(path.join(sampleRoot, target))).toBe(true);

    const applied = store.getPatches(session.id, "applied");
    await rollbackPatches(sampleRoot, applied);
    for (const p of applied) {
      store.updatePatchStatus(p.id, "rolled_back");
    }
  });

  it("@sara review does not create patches", async () => {
    const session = await Session.create(sampleRoot, store);
    const config = { ...session.config, provider: "mock" as const, keys: {} };
    const registry = new AgentRegistry(new LlmRegistry(config), config);
    const router = new Router(registry);
    const orchestrator = new Orchestrator(session, registry, store);

    const route = router.route(
      parseInput("@sara review architecture"),
      session.profile,
    );
    await orchestrator.handleRoute(route);

    const pending = store.getPatches(session.id, "pending");
    expect(pending.length).toBe(0);
  });
});
