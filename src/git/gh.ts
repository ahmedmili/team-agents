import { spawn } from "node:child_process";

export interface GhRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runGh(
  args: string[],
  cwd: string,
): Promise<GhRunResult> {
  return new Promise((resolve) => {
    const child = spawn("gh", args, {
      cwd,
      shell: process.platform === "win32",
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr?.on("data", (d) => {
      stderr += String(d);
    });
    child.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
    child.on("error", () => {
      resolve({
        stdout: "",
        stderr: "gh CLI not found. Install from https://cli.github.com/",
        exitCode: 127,
      });
    });
  });
}

export async function ghAuthOk(cwd: string): Promise<boolean> {
  const r = await runGh(["auth", "status"], cwd);
  return r.exitCode === 0;
}
