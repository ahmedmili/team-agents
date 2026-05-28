import { afterEach, describe, expect, it } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { startDashboardServer } from "../src/dashboard/server.js";

describe("dashboard api", () => {
  const handles: Array<{ close: () => Promise<void> }> = [];
  const dirs: string[] = [];

  afterEach(async () => {
    for (const h of handles.splice(0)) {
      await h.close();
    }
    for (const d of dirs.splice(0)) {
      await fs.remove(d);
    }
  });

  it("serves config and history endpoints", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ai-dash-"));
    dirs.push(root);
    const server = await startDashboardServer(root);
    handles.push(server);

    const cfgRes = await fetch(`${server.url}/api/config`);
    expect(cfgRes.status).toBe(200);
    const cfg = (await cfgRes.json()) as { config: { provider: string } };
    expect(cfg.config.provider).toBeTruthy();

    const sessionsRes = await fetch(`${server.url}/api/history/sessions`);
    expect(sessionsRes.status).toBe(200);
    const sessions = (await sessionsRes.json()) as { sessions: unknown[] };
    expect(Array.isArray(sessions.sessions)).toBe(true);

    const memRes = await fetch(`${server.url}/api/memory?limit=10`);
    expect(memRes.status).toBe(200);
    const mem = (await memRes.json()) as { memories: unknown[]; count: number };
    expect(Array.isArray(mem.memories)).toBe(true);
    expect(typeof mem.count).toBe("number");

    const wsRes = await fetch(`${server.url}/api/workspaces`);
    expect(wsRes.status).toBe(200);
    const ws = (await wsRes.json()) as { workspaces: unknown[] };
    expect(Array.isArray(ws.workspaces)).toBe(true);

    const ciRes = await fetch(`${server.url}/api/ci`);
    expect(ciRes.status).toBe(200);
    const ci = (await ciRes.json()) as { runs: unknown[] };
    expect(Array.isArray(ci.runs)).toBe(true);
  });
});
