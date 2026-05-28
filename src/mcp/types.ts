export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface McpConfig {
  enabled?: boolean;
  prefetchOnRoute?: boolean;
  servers?: Record<string, McpServerConfig>;
}

export interface McpServerStatus {
  name: string;
  connected: boolean;
  toolCount: number;
  error?: string;
}

export interface McpPrefetchResult {
  source: string;
  label: string;
  content: string;
}

export interface GitHubRef {
  kind: "issue" | "pull";
  owner: string;
  repo: string;
  number: number;
}
