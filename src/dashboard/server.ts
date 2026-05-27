import http from "node:http";
import path from "node:path";
import { loadConfig } from "../config/loader.js";
import {
  ensureConfigFile,
  readConfigFile,
  setAgentProvider,
  setApiKey,
  setProvider,
  writeConfigFile,
} from "../config/store.js";
import { MemoryStore } from "../memory/store.js";
import type { LlmProviderName } from "../config/types.js";
import type { AgentRole } from "../schemas/index.js";

export interface DashboardServerHandle {
  url: string;
  close: () => Promise<void>;
}

export async function startDashboardServer(projectRoot: string): Promise<DashboardServerHandle> {
  ensureConfigFile(projectRoot);
  const store = new MemoryStore();

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method === "GET" && url.pathname === "/") {
        return sendHtml(res, renderHomePage());
      }
      if (req.method === "GET" && url.pathname === "/settings") {
        return sendHtml(res, renderSettingsPage());
      }
      if (req.method === "GET" && url.pathname === "/history") {
        return sendHtml(res, renderHistoryPage());
      }
      if (req.method === "GET" && url.pathname === "/observability") {
        return sendHtml(res, renderObservabilityPage());
      }

      if (req.method === "GET" && url.pathname === "/api/config") {
        return sendJson(res, 200, { config: loadConfig(projectRoot) });
      }
      if (req.method === "POST" && url.pathname === "/api/config/provider") {
        const body = await readBody(req);
        const provider = String(body.provider ?? "") as LlmProviderName;
        const config = setProvider(projectRoot, provider);
        return sendJson(res, 200, { ok: true, config });
      }
      if (req.method === "POST" && url.pathname === "/api/config/key") {
        const body = await readBody(req);
        const provider = String(body.provider ?? "") as LlmProviderName;
        const key = String(body.key ?? "");
        const config = setApiKey(projectRoot, provider, key);
        return sendJson(res, 200, { ok: true, config });
      }
      if (req.method === "POST" && url.pathname === "/api/config/agent-provider") {
        const body = await readBody(req);
        const role = String(body.role ?? "") as AgentRole;
        const provider = String(body.provider ?? "clear") as LlmProviderName | "clear";
        const config = setAgentProvider(projectRoot, role, provider);
        return sendJson(res, 200, { ok: true, config });
      }
      if (req.method === "POST" && url.pathname === "/api/config/adapter") {
        const body = await readBody(req);
        const raw = readConfigFile(projectRoot);
        const updated = {
          ...raw,
          adapterConfig: {
            ...(raw.adapterConfig ?? {}),
            ...(body.adapterConfig ?? {}),
          },
        };
        writeConfigFile(projectRoot, updated);
        return sendJson(res, 200, { ok: true, config: loadConfig(projectRoot) });
      }
      if (req.method === "GET" && url.pathname === "/api/history/sessions") {
        return sendJson(res, 200, { sessions: store.getRecentSessions(100) });
      }
      if (req.method === "GET" && url.pathname === "/api/history/messages") {
        return sendJson(res, 200, { messages: store.getRecentMessages(200) });
      }
      if (req.method === "GET" && url.pathname === "/api/history/patches") {
        return sendJson(res, 200, { patches: store.getRecentPatches(200) });
      }
      if (req.method === "GET" && url.pathname === "/api/health/runtime") {
        const sessions = store.getRecentSessions(1);
        const latest = sessions[0];
        const metrics = latest ? store.getProviderMetrics(latest.id) : [];
        return sendJson(res, 200, {
          uptimeSec: Math.round(process.uptime()),
          projectRoot,
          latestSessionId: latest?.id ?? null,
          metrics,
        });
      }

      sendJson(res, 404, { error: "Not found" });
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  const port = await listen(server);
  return {
    url: `http://127.0.0.1:${port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      store.close();
    },
  };
}

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") return reject(new Error("No address"));
      resolve(addr.port);
    });
  });
}

async function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf-8");
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendHtml(res: http.ServerResponse, html: string): void {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

function layout(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${title}</title><style>
body{font-family:Arial,sans-serif;margin:0;background:#0f172a;color:#e2e8f0}
header{padding:12px 16px;background:#111827;display:flex;gap:12px}
a{color:#93c5fd;text-decoration:none}
main{padding:16px}
pre{background:#111827;padding:12px;border-radius:8px;overflow:auto}
button,input,select{padding:8px;border-radius:6px;border:1px solid #374151;background:#1f2937;color:#e5e7eb}
.row{display:flex;gap:8px;align-items:center;margin-bottom:8px}
</style></head><body><header>
<a href="/">Home</a><a href="/settings">Settings</a><a href="/history">History</a><a href="/observability">Observability</a>
</header><main>${body}</main></body></html>`;
}

function renderHomePage(): string {
  return layout(
    "AI Shell Dashboard",
    `<h1>AI Shell Dashboard</h1><p>Use the top navigation to manage settings, inspect history, and observe runtime metrics.</p>`,
  );
}

function renderSettingsPage(): string {
  return layout(
    "Settings",
    `<h1>Settings</h1>
<div class="row"><button onclick="loadConfig()">Refresh</button></div>
<pre id="cfg"></pre>
<div class="row"><select id="provider">
<option>openai</option><option>anthropic</option><option>huggingface</option><option>openrouter</option><option>puter</option><option>mock</option>
</select><button onclick="setProvider()">Set Provider</button></div>
<div class="row"><input id="kprov" placeholder="provider"/><input id="kval" placeholder="api key"/><button onclick="setKey()">Set Key</button></div>
<div class="row"><input id="arole" placeholder="role"/><input id="aprov" placeholder="provider or clear"/><button onclick="setAgent()">Set Agent Provider</button></div>
<script>
async function loadConfig(){const r=await fetch('/api/config');const d=await r.json();document.getElementById('cfg').textContent=JSON.stringify(d.config,null,2)}
async function setProvider(){const provider=document.getElementById('provider').value;await fetch('/api/config/provider',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({provider})});loadConfig()}
async function setKey(){const provider=document.getElementById('kprov').value;const key=document.getElementById('kval').value;await fetch('/api/config/key',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({provider,key})});loadConfig()}
async function setAgent(){const role=document.getElementById('arole').value;const provider=document.getElementById('aprov').value;await fetch('/api/config/agent-provider',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role,provider})});loadConfig()}
loadConfig();
</script>`,
  );
}

function renderHistoryPage(): string {
  return layout(
    "History",
    `<h1>History</h1><div class="row"><button onclick="loadAll()">Refresh</button></div>
<h3>Sessions</h3><pre id="sessions"></pre>
<h3>Messages</h3><pre id="messages"></pre>
<h3>Patches</h3><pre id="patches"></pre>
<script>
async function loadAll(){
  const s=await (await fetch('/api/history/sessions')).json();
  const m=await (await fetch('/api/history/messages')).json();
  const p=await (await fetch('/api/history/patches')).json();
  document.getElementById('sessions').textContent=JSON.stringify(s.sessions,null,2);
  document.getElementById('messages').textContent=JSON.stringify(m.messages,null,2);
  document.getElementById('patches').textContent=JSON.stringify(p.patches,null,2);
}
loadAll();
</script>`,
  );
}

function renderObservabilityPage(): string {
  return layout(
    "Observability",
    `<h1>Observability</h1><div class="row"><button onclick="loadHealth()">Refresh</button></div><pre id="health"></pre>
<script>
async function loadHealth(){const h=await (await fetch('/api/health/runtime')).json();document.getElementById('health').textContent=JSON.stringify(h,null,2)}
loadHealth();
</script>`,
  );
}
