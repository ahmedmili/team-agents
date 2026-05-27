export type ParsedInput =
  | { kind: "command"; command: string; args: string[] }
  | { kind: "agent"; alias: string; message: string }
  | { kind: "natural"; message: string };

export function parseInput(line: string): ParsedInput {
  const trimmed = line.trim();
  if (!trimmed) return { kind: "natural", message: "" };

  if (trimmed.startsWith("/")) {
    const parts = trimmed.slice(1).split(/\s+/);
    const command = (parts[0] ?? "").toLowerCase();
    const args = parts.slice(1);
    return { kind: "command", command, args };
  }

  const agentMatch = trimmed.match(/^@(\w+)\s+(.+)$/s);
  if (agentMatch) {
    return {
      kind: "agent",
      alias: agentMatch[1]!.toLowerCase(),
      message: agentMatch[2]!.trim(),
    };
  }

  return { kind: "natural", message: trimmed };
}
