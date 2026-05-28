import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { AiShellConfig } from "../config/types.js";
import { resolveMcpEnv } from "./env.js";
import { stringifyToolResult } from "./context.js";
import type { McpServerConfig, McpServerStatus } from "./types.js";

interface ConnectedServer {
  client: Client;
  transport: StdioClientTransport;
  tools: string[];
}

export class McpManager {
  private connections = new Map<string, ConnectedServer>();
  lastPrefetchError: string | null = null;

  constructor(
    private config: AiShellConfig,
    private projectRoot: string,
  ) {}

  isEnabled(): boolean {
    return Boolean(
      this.config.mcp?.enabled &&
        Object.keys(this.config.mcp.servers ?? {}).length > 0,
    );
  }

  getServerNames(): string[] {
    return Object.keys(this.config.mcp?.servers ?? {});
  }

  async connectServer(name: string): Promise<void> {
    if (this.connections.has(name)) return;

    const spec = this.config.mcp?.servers?.[name];
    if (!spec) throw new Error(`Unknown MCP server: ${name}`);

    const transport = new StdioClientTransport({
      command: spec.command,
      args: spec.args,
      env: resolveMcpEnv(spec.env, this.config.keys),
      cwd: spec.cwd ?? this.projectRoot,
      stderr: "pipe",
    });

    const client = new Client(
      { name: "ai-shell", version: "0.1.0" },
      { capabilities: {} },
    );

    await client.connect(transport);
    const listed = await client.listTools();
    const tools = (listed.tools ?? []).map((t) => t.name);

    this.connections.set(name, { client, transport, tools });
  }

  async ensureConnected(name: string): Promise<ConnectedServer> {
    await this.connectServer(name);
    const conn = this.connections.get(name);
    if (!conn) throw new Error(`Failed to connect MCP server: ${name}`);
    return conn;
  }

  async listTools(serverName: string): Promise<string[]> {
    const conn = await this.ensureConnected(serverName);
    return conn.tools;
  }

  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    const conn = await this.ensureConnected(serverName);
    if (!conn.tools.includes(toolName)) {
      throw new Error(`Tool ${toolName} not available on ${serverName}`);
    }
    const result = await conn.client.callTool({
      name: toolName,
      arguments: args,
    });
    return stringifyToolResult(result);
  }

  findTool(serverName: string, ...candidates: string[]): string | null {
    const conn = this.connections.get(serverName);
    if (!conn) return null;
    for (const c of candidates) {
      if (conn.tools.includes(c)) return c;
    }
    const lower = candidates.map((c) => c.toLowerCase());
    return (
      conn.tools.find((t) => lower.some((c) => t.toLowerCase() === c)) ?? null
    );
  }

  async getStatuses(): Promise<McpServerStatus[]> {
    const names = this.getServerNames();
    const statuses: McpServerStatus[] = [];

    for (const name of names) {
      try {
        await this.connectServer(name);
        const conn = this.connections.get(name)!;
        statuses.push({
          name,
          connected: true,
          toolCount: conn.tools.length,
        });
      } catch (err) {
        statuses.push({
          name,
          connected: false,
          toolCount: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return statuses;
  }

  async close(): Promise<void> {
    for (const [, conn] of this.connections) {
      try {
        await conn.client.close();
      } catch {
        // ignore
      }
      try {
        await conn.transport.close();
      } catch {
        // ignore
      }
    }
    this.connections.clear();
  }
}

export function resolveMcpServers(
  servers: Record<string, McpServerConfig> | undefined,
  keys: AiShellConfig["keys"],
): Record<string, McpServerConfig> | undefined {
  if (!servers) return undefined;
  const out: Record<string, McpServerConfig> = {};
  for (const [name, spec] of Object.entries(servers)) {
    out[name] = {
      ...spec,
      env: resolveMcpEnv(spec.env, keys),
    };
  }
  return out;
}
