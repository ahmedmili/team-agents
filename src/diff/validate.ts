import type { AgentScope } from "../config/types.js";
import { ScopeViolationError } from "../utils/errors.js";
import { resolveUnderRoot } from "../utils/paths.js";

function matchGlob(filePath: string, pattern: string): boolean {
  const regex = new RegExp(
    "^" +
      pattern
        .replace(/\./g, "\\.")
        .replace(/\*\*/g, "{{GLOBSTAR}}")
        .replace(/\*/g, "[^/]*")
        .replace(/{{GLOBSTAR}}/g, ".*") +
      "$",
  );
  return regex.test(filePath.replace(/\\/g, "/"));
}

export function validatePatchPath(
  root: string,
  filePath: string,
  scope: AgentScope,
  _projectStacks: string[],
): void {
  resolveUnderRoot(root, filePath);

  const posix = filePath.replace(/\\/g, "/");
  const allowed = scope.globs.some((g) => matchGlob(posix, g));
  if (!allowed) {
    throw new ScopeViolationError(
      `Agent ${scope.role} cannot modify ${filePath} (outside allowed globs)`,
    );
  }

  if (!scope.write) {
    throw new ScopeViolationError(
      `Agent ${scope.role} is read-only and cannot propose file patches`,
    );
  }
}

export function validateStacks(
  scope: AgentScope,
  projectStacks: string[],
): void {
  if (scope.stacks.includes("*")) return;
  const ok = projectStacks.some((s) => scope.stacks.includes(s));
  if (!ok) {
    throw new ScopeViolationError(
      `Agent ${scope.role} does not support stacks: ${projectStacks.join(", ")}`,
    );
  }
}
