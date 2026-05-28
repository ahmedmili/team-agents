import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "fs-extra";
import os from "node:os";
import {
  registerWorkspace,
  listWorkspaces,
  getLastActiveWorkspace,
  setLastActive,
} from "../src/config/workspaces.js";

describe("workspaces registry", () => {
  let tempFile: string;

  beforeEach(() => {
    tempFile = path.join(
      os.tmpdir(),
      `ai-shell-workspaces-${Date.now()}.json`,
    );
    process.env.AI_SHELL_WORKSPACES_PATH = tempFile;
  });

  afterEach(() => {
    delete process.env.AI_SHELL_WORKSPACES_PATH;
    fs.removeSync(tempFile);
  });

  it("registers and lists workspaces", () => {
    const cwdA = path.resolve("/tmp/ws-a");
    const cwdB = path.resolve("/tmp/ws-b");

    registerWorkspace(cwdA, "project-a");
    registerWorkspace(cwdB, "project-b");

    const list = listWorkspaces();
    expect(list).toHaveLength(2);
    expect(list.map((w) => w.name).sort()).toEqual(["project-a", "project-b"]);
  });

  it("tracks last active workspace", () => {
    const cwdA = path.resolve("/tmp/ws-last-a");
    const cwdB = path.resolve("/tmp/ws-last-b");

    registerWorkspace(cwdA, "a");
    registerWorkspace(cwdB, "b");

    expect(getLastActiveWorkspace()).toBe(cwdB.replace(/\\/g, "/"));

    setLastActive(cwdA);
    expect(getLastActiveWorkspace()).toBe(cwdA.replace(/\\/g, "/"));
  });
});
