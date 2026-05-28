# AI Shell (team-agents)

Local-first, multi-agent engineering CLI. Enter a project with `ai connect` and work with a simulated team (Tech Lead, Backend, QA, Architect). All code changes are proposed as diffs and applied only after `/apply`.

## Requirements

- Node.js 20+
- API/provider config in **`.ai-shell.json`** via `ai config` or REPL commands
- Providers: OpenAI, Anthropic, Hugging Face, OpenRouter, experimental Puter proxy, and Mock fallback

## Install

```bash
npm install
npm run build
npm link
```

## Quick start

From any project directory:

```bash
ai connect
```

Inside the shell:

```
add JWT authentication
@karim implement refresh token logic
@sara review architecture
/diff
/apply all
/reject all
/rollback all
/status
/memory
/artifacts preview
/sessions
/workspaces
/switch ../other-project
/board
/mcp
/pr --dry-run
/ci
/agents
/exit
```

## Configuration

Copy [`.ai-shell.json.example`](.ai-shell.json.example) to your project as `.ai-shell.json`:

```json
{
  "projectName": "my-api",
  "provider": "openai",
  "keys": {
    "openai": "sk-your-key-here",
    "anthropic": "sk-ant-your-key-here",
    "huggingface": "hf-your-token-here",
    "openrouter": "or-your-key-here"
  },
  "models": {
    "openai": {
      "techLead": "gpt-4o-mini",
      "backend": "gpt-4o-mini"
    },
    "anthropic": {
      "techLead": "claude-3-5-haiku-20241022",
      "backend": "claude-3-5-haiku-20241022"
    },
    "huggingface": {
      "techLead": "Qwen/Qwen2.5-7B-Instruct",
      "backend": "Qwen/Qwen2.5-7B-Instruct"
    },
    "openrouter": {
      "techLead": "openai/gpt-4o-mini",
      "backend": "anthropic/claude-sonnet-4-6"
    }
  },
  "adapterConfig": {
    "openrouter": { "enabled": true, "baseUrl": "https://openrouter.ai/api/v1" },
    "puter": {
      "enabled": false,
      "mode": "disabled",
      "endpoint": "",
      "sessionToken": ""
    }
  },
  "agentProviders": {
    "techLead": "openai",
    "backend": "anthropic"
  },
  "agents": {
    "karim": "backend",
    "sara": "architect",
    "alex": "qa"
  }
}
```

### API keys (two ways)

**Option 1 — Edit `.ai-shell.json`** in your project root:

```json
"keys": {
  "openai": "sk-...",
  "anthropic": "sk-ant-...",
  "huggingface": "hf-...",
  "openrouter": "or-..."
},
"provider": "openai"
```

**Option 2 — CLI** (writes the same file):

```bash
ai config init
ai config set-key openai sk-your-key-here
ai config set-key huggingface hf-your-token-here
ai config set-key openrouter or-your-key-here
ai config set-provider openai
ai config set-agent backend anthropic
ai config keys
ai config providers
```

Inside `ai connect`:

```
/setkey openai sk-your-key-here
/setkey huggingface hf-your-token-here
/setkey openrouter or-your-key-here
/setprovider openai
/use anthropic
/setagent backend huggingface
/keys
/providers
/dashboard
/metrics
/history messages
/memory
/memory clear
```

```bash
ai memory
ai memory --clear
```

Do not commit real keys to git. Add `.ai-shell.json` to `.gitignore` if it contains secrets.

### Provider matrix

- **Native**: `openai`, `anthropic`, `huggingface`, `mock`
- **Experimental adapters**: `openrouter`, `puter`
  - `openrouter` needs `keys.openrouter`
  - `puter` needs `adapterConfig.puter` with `enabled=true`, `mode=proxy`, `endpoint`, and `sessionToken`

Fallback order when selected provider is unavailable: `huggingface` -> `openrouter` -> `puter` -> `openai` -> `anthropic` -> `mock`.

## Dashboard and observability

Launch web dashboard:

```bash
ai dashboard
```

Pages:
- `/settings` for provider/key/agent-provider configuration
- `/history` for sessions/messages/patches
- `/observability` for runtime metrics and health

Terminal observability:

```bash
ai metrics
ai history --type sessions
ai history --type messages
ai history --type patches
```

## Example project

Dogfood against the included Express sample:

```bash
cd examples/express-sample
ai connect
```

Try:

```
add JWT authentication
/diff
/apply all
```

## Development

```bash
npm run dev -- connect          # run via tsx without build
npm test
npm run build
```

Session data is stored in `~/.ai-shell/memory.db`.

## Architecture

See [project.md](project.md) for vision, agent schemas, and Phase 1 scope.

## Phase 1 features

- Persistent REPL (`ai connect`)
- Multi-agent orchestration (Tech Lead hub-and-spoke)
- `@agent` routing with stack scope checks
- Diff-gated file writes (`/diff`, `/apply`, `/reject`, `/rollback`)
- Per-agent Markdown reports (`.ai-shell/agents/<session-id>/`) — `/artifacts`
- Default backend → qa → architect pipeline when Tech Lead returns no tasks
- Plan task lifecycle (`pending` / `done`) persisted in SQLite
- Project memory engine (repo-scoped, cross-session) — `/memory`, `ai memory`
- Session memory summary injected into later prompts
- Multi-project workspaces — `/switch`, `/workspaces`, `ai switch`, `ai workspaces`; `ai connect` resumes last active project
- Agent handoffs in orchestrated flows — `/board` for plan + handoff log
- MCP GitHub context prefetch — `/mcp`, `ai mcp status` (enable in `.ai-shell.json`)
- PR workflow after `/apply` — `/pr`, `ai pr create` (requires `gh`)
- CI visibility — `/ci`, `ai ci`, dashboard `GET /api/ci`
- `/sessions` for SQLite session history across projects
- Repo scanner and stack detection
- SQLite session memory (7-day resume)
- OpenAI, Anthropic, Hugging Face, OpenRouter, experimental Puter proxy, and mock providers
- Local dashboard (`ai dashboard`) and provider telemetry (`/metrics`)
