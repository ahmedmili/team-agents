import type { MemoryStore } from "../memory/store.js";
import type { Session } from "./session.js";
import { loadConfig } from "../config/loader.js";
import { AgentRegistry } from "../agents/registry.js";
import { Router } from "./router.js";
import { Orchestrator } from "./orchestrator.js";
import { LlmRegistry } from "../llm/registry.js";
import { McpManager } from "../mcp/client.js";

/** REPL runtime — recreated when config/keys change. */
export class ReplRuntime {
  registry!: AgentRegistry;
  router!: Router;
  orchestrator!: Orchestrator;
  mcpManager: McpManager | null = null;

  constructor(
    public session: Session,
    public store: MemoryStore,
  ) {
    this.reload();
  }

  async close(): Promise<void> {
    if (this.mcpManager) {
      await this.mcpManager.close();
      this.mcpManager = null;
    }
  }

  reload(): void {
    const previous = this.mcpManager;
    this.mcpManager = null;
    void previous?.close();

    this.session.config = loadConfig(this.session.root);
    this.mcpManager = this.session.config.mcp?.enabled
      ? new McpManager(this.session.config, this.session.root)
      : null;
    const llmRegistry = new LlmRegistry(this.session.config, (event) => {
      this.store.saveProviderEvent({
        session_id: this.session.id,
        provider: event.provider,
        role: event.role,
        model: event.model,
        status: event.status,
        latency_ms: event.latencyMs,
        error_message: event.errorMessage ?? null,
      });
    });
    this.registry = new AgentRegistry(llmRegistry, this.session.config);
    this.router = new Router(this.registry);
    this.orchestrator = new Orchestrator(
      this.session,
      this.registry,
      this.store,
      this.mcpManager,
    );
  }
}
