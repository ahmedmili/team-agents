import type { MemoryStore } from "../memory/store.js";
import type { Session } from "./session.js";
import { loadConfig } from "../config/loader.js";
import { AgentRegistry } from "../agents/registry.js";
import { Router } from "./router.js";
import { Orchestrator } from "./orchestrator.js";
import { LlmRegistry } from "../llm/registry.js";

/** REPL runtime — recreated when config/keys change. */
export class ReplRuntime {
  registry!: AgentRegistry;
  router!: Router;
  orchestrator!: Orchestrator;

  constructor(
    public session: Session,
    public store: MemoryStore,
  ) {
    this.reload();
  }

  reload(): void {
    this.session.config = loadConfig(this.session.root);
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
    );
  }
}
