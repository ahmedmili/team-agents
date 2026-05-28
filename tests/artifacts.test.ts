import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listAgentArtifacts } from "../src/core/artifacts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpRoot = path.join(__dirname, "../.tmp-artifacts-test");

describe("listAgentArtifacts", () => {
  const sessionId = "test-session-id";

  beforeEach(() => {
    fs.ensureDirSync(
      path.join(tmpRoot, ".ai-shell", "agents", sessionId),
    );
    fs.writeFileSync(
      path.join(
        tmpRoot,
        ".ai-shell",
        "agents",
        sessionId,
        "2026-01-01T00-00-00-techLead.md",
      ),
      "# test",
    );
  });

  afterEach(() => {
    fs.removeSync(tmpRoot);
  });

  it("lists markdown artifacts newest first", () => {
    const items = listAgentArtifacts(tmpRoot, sessionId);
    expect(items).toHaveLength(1);
    expect(items[0]!.role).toBe("techLead");
    expect(items[0]!.relativePath).toContain(".ai-shell/agents");
  });
});
