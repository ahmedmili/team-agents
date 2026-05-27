import fs from "fs-extra";
import path from "node:path";

export function detectStacks(root: string): string[] {
  const stacks: string[] = [];

  if (fs.existsSync(path.join(root, "nest-cli.json"))) {
    stacks.push("nestjs");
  }
  if (fs.existsSync(path.join(root, "package.json"))) {
    const pkg = fs.readJsonSync(path.join(root, "package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps["@nestjs/core"]) stacks.push("nestjs");
    if (deps["express"]) stacks.push("express");
    if (!stacks.includes("nestjs") && !stacks.includes("express")) {
      stacks.push("node");
    }
  }
  if (fs.existsSync(path.join(root, "composer.json"))) {
    stacks.push("laravel");
  }
  if (fs.existsSync(path.join(root, "pubspec.yaml"))) {
    stacks.push("flutter");
  }

  if (stacks.length === 0) stacks.push("generic");
  return [...new Set(stacks)];
}

export function stackAllowedForAgent(
  agentStacks: string[],
  projectStacks: string[],
): boolean {
  if (agentStacks.includes("*")) return true;
  return projectStacks.some((s) => agentStacks.includes(s));
}
