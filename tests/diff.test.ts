import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import {
  applyUnifiedDiff,
  createUnifiedDiff,
} from "../src/diff/apply.js";
import { validatePatchPath } from "../src/diff/validate.js";
import { getAgentScopes } from "../src/config/loader.js";

describe("diff apply", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-shell-test-"));
  });

  afterEach(async () => {
    await fs.remove(tmp);
  });

  it("creates and applies a patch to new file", () => {
    const filePath = "src/hello.ts";
    const newContent = "export const x = 1;\n";
    const diff = createUnifiedDiff(filePath, "", newContent);
    applyUnifiedDiff(tmp, filePath, diff);
    const full = path.join(tmp, "src/hello.ts");
    expect(fs.readFileSync(full, "utf-8")).toBe(newContent);
  });

  it("validates path scope for backend", () => {
    const scope = getAgentScopes().backend;
    expect(() =>
      validatePatchPath(tmp, "src/a.ts", scope, ["express"]),
    ).not.toThrow();
    expect(() =>
      validatePatchPath(tmp, "../../../etc/passwd", scope, ["express"]),
    ).toThrow();
  });
});
