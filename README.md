# AI Shell (team-agents)

Local-first, multi-agent engineering CLI. Enter a project with `ai connect` and work with a simulated team (Tech Lead, Backend, QA, Architect). All code changes are proposed as diffs and applied only after `/apply`.

## Requirements

- Node.js 20+
- Optional: `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` for live models (defaults to **mock** provider when unset)

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
/rollback all
/status
/agents
/exit
```

## Configuration

Copy [`.ai-shell.json.example`](.ai-shell.json.example) to your project as `.ai-shell.json`:

```json
{
  "projectName": "my-api",
  "provider": "mock",
  "models": {
    "techLead": "gpt-4o-mini",
    "backend": "gpt-4o-mini"
  },
  "agents": {
    "karim": "backend",
    "sara": "architect",
    "alex": "qa"
  }
}
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `AI_SHELL_PROVIDER` | `openai`, `anthropic`, or `mock` |
| `AI_SHELL_MODEL` | Default model |
| `AI_SHELL_MAX_STEPS` | Orchestrator steps per message (default: 5) |

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
- Diff-gated file writes (`/diff`, `/apply`, `/rollback`)
- Repo scanner and stack detection
- SQLite session memory (7-day resume)
- OpenAI, Anthropic, and mock LLM providers
