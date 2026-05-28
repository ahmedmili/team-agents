📌 AI Shell — Multi-Agent Engineering CLI
🧠 Overview

AI Shell is a local-first, CLI-based AI engineering assistant that operates directly inside your codebase.

It simulates a real software engineering team composed of AI agents (Tech Lead, Backend Dev, QA, Architect, etc.) that collaborate to:

Design software architecture
Implement features
Review code
Generate safe patches (diff-based edits)
Debug issues
Maintain project context

Instead of using a traditional UI or SaaS platform, AI Shell runs directly in your terminal and integrates with any project.

🚀 Vision

This project evolves into a local AI software engineering system:

A persistent AI development environment where you “enter your project” and interact with an AI engineering team like a real company.

Inspired by:

Cursor AI editor
GitHub Copilot Workspace
Multi-agent systems (LangGraph / AutoGen style)
MCP (Model Context Protocol) tool ecosystems
💡 Core Idea

Instead of:

ai-team ask "add auth system"

You enter an interactive shell:

ai connect

Then work naturally:

add JWT authentication system
@karim implement refresh token logic
@sara review architecture
🧩 Key Concepts
1. Persistent AI Shell (REPL Mode)

After running:

ai connect

You enter a persistent session:

AI-TEAM (my-project) >

Inside this shell you can:

Write natural instructions
Assign tasks to agents using @agent
Run system commands (/diff, /apply, /status)
Collaborate in real time with AI agents
2. Multi-Agent System

Each agent has a role and scope:

Core Agents
TechLeadAgent → orchestrates tasks, makes decisions
BackendAgent → API, services, DB logic
QAAgent → testing, validation, edge cases
ArchitectAgent → system design & scalability review
Example
add payment system

→ TechLeadAgent breaks into tasks
→ BackendAgent implements
→ QAAgent validates
→ ArchitectAgent reviews design

3. @ Agent Routing

You can directly address agents:

@karim implement Stripe webhook handler
@sara review this architecture
Rules:
Agents only operate within allowed project scope
Stack-aware restrictions (e.g. no Flutter agent touching NestJS repo)
Invalid routing is escalated to TechLeadAgent
4. Safe Code Editing (Cursor-style)

Agents NEVER directly modify files.

They generate:

➜ Diff/Patch output
--- app/services/auth.service.ts
+++ app/services/auth.service.ts

+ createRefreshToken()
+ validateJWT()

Then user can:

/apply

or reject changes.

5. Project Awareness

AI Shell analyzes the current repository:

folder structure
frameworks used (NestJS, Laravel, React, etc.)
architecture patterns
dependencies
existing services

This ensures agents behave project-aware, not generic.

6. Command System

Inside the shell:

Core commands
ai connect      # start session (from shell)
/connect        # refresh repo scan inside REPL
/diff           # show pending changes
/apply          # apply approved patches
/reject         # reject pending patches
/rollback       # revert applied changes
/status         # session, tasks, patches, memory
/artifacts      # agent report files (.md)
/sessions       # recent projects (multi-project)
/agents         # list agents
Natural mode
add login system
Agent mode
@karim build API
@sara review design
🏗️ Architecture Overview
CLI (ai connect)
        ↓
REPL Engine
        ↓
Message Parser (@agent + commands)
        ↓
Router / Orchestrator
        ↓
Agents (TechLead, Backend, QA, Architect)
        ↓
LLM Layer
        ↓
Patch Generator (diff system)
        ↓
User Review (approve/reject)
        ↓
File System Writer
📁 Project Structure
ai-shell/
├── bin/                 # CLI entry point
├── src/
│   ├── cli/             # REPL + commands
│   ├── core/            # orchestrator + router
│   ├── agents/          # AI agents
│   ├── repo/            # codebase scanner/indexer
│   ├── diff/            # patch generation & apply
│   ├── memory/          # project memory system
│   ├── llm/             # AI model integration
│   ├── tools/           # filesystem/git tools
│   ├── git/             # git integration
│   ├── config/          # agent + project config
│   └── utils/
├── templates/
├── tests/
└── package.json
📦 Tech Stack
Core
Node.js (TypeScript)
Commander.js (CLI)
Inquirer.js (interactive shell)
AI Layer
OpenAI / Anthropic APIs
Zod (structured outputs)
File System
fs-extra
glob
chokidar
Diff System
diff
diff-match-patch
Git
simple-git
Memory (initial)
JSON / SQLite (lightweight local storage)
🧠 Design Principles
1. Safety First
No direct file writes
All changes go through diff approval
2. Project Awareness

Agents understand repo context before acting.

3. Scoped Agents

Agents only operate within:

allowed frameworks
allowed file types
project rules
4. Deterministic Workflow

Flow always follows:

Plan → Review → Diff → Apply
⚙️ Example Workflow
ai connect

Inside shell:

add Stripe subscriptions

System:

TechLead creates plan
BackendAgent implements code
QAAgent validates logic
Diff is generated

Then:

/apply
🔮 Future Extensions

This system is designed to evolve into:

Phase 1
CLI AI engineering assistant
diff-based editing system
Phase 2
@agent communication system
project memory engine
multi-project support
Phase 3
MCP tool integration (GitHub, Jira, etc.)
autonomous PR creation
CI/CD automation
Phase 4
full AI engineering organization simulation
💡 Key Insight

This project is NOT just a chatbot CLI.

It is:

A controlled AI engineering environment where agents collaborate safely to modify real software projects.

🧭 Getting Started
npm install
npm run build
npm link

Then inside any project:

ai connect
🧠 Author Vision

This system is designed to evolve into a local AI software factory, where developers interact with a persistent AI engineering team directly from the terminal.

---

## Phase 1 — Technical Specification

### Non-goals (Phase 1)

- No MCP integrations (GitHub, Jira, etc.)
- No autonomous git push or PR creation
- No cloud UI or SaaS dashboard
- No local Ollama / offline models
- No custom user-defined agents (fixed four roles + Tech Lead)

### Keys and provider configuration

Keys are stored in `.ai-shell.json` and can be managed through CLI commands.

| Key | Required | Description |
|-----|----------|-------------|
| `keys.openai` | No | OpenAI API key |
| `keys.anthropic` | No | Anthropic (Claude) API key |
| `keys.huggingface` | No | Hugging Face token (`hf_...`) |
| `keys.openrouter` | No | OpenRouter API key (`or_...`) |
| `adapterConfig.puter` | No | Experimental Puter proxy adapter settings |

Provider resolution:

1. Use `agentProviders.<role>` when set
2. Otherwise use global `provider`
3. Fallback to Hugging Face/OpenRouter/Puter if available, then OpenAI/Anthropic, else `mock`

### Session lifecycle

1. **connect** — Detect project root (git root or cwd), load `.ai-shell.json`, scan repo, restore or create SQLite session.
2. **active** — REPL accepts natural language, `@agent` messages, and slash commands.
3. **disconnect** — `/exit` or Ctrl+C: persist session, pending patches, and messages; no file writes.
4. **crash recovery** — On next `ai connect`, resume last session for same `cwd` if within 7 days.

### Example `.ai-shell.json`

```json
{
  "projectName": "my-api",
  "provider": "openai",
  "keys": {
    "openai": "sk-...",
    "anthropic": "sk-ant-...",
    "huggingface": "hf_...",
    "openrouter": "or-..."
  },
  "models": {
    "openai": {
      "techLead": "gpt-4o-mini",
      "backend": "gpt-4o-mini",
      "qa": "gpt-4o-mini",
      "architect": "gpt-4o-mini"
    },
    "anthropic": {
      "techLead": "claude-3-5-haiku-20241022",
      "backend": "claude-3-5-haiku-20241022",
      "qa": "claude-3-5-haiku-20241022",
      "architect": "claude-3-5-haiku-20241022"
    },
    "huggingface": {
      "techLead": "Qwen/Qwen2.5-7B-Instruct",
      "backend": "Qwen/Qwen2.5-7B-Instruct",
      "qa": "HuggingFaceH4/zephyr-7b-beta",
      "architect": "Qwen/Qwen2.5-7B-Instruct"
    },
    "openrouter": {
      "techLead": "openai/gpt-4o-mini",
      "backend": "anthropic/claude-sonnet-4-6",
      "qa": "google/gemini-2.0-flash-lite",
      "architect": "anthropic/claude-sonnet-4-6"
    },
    "puter": {
      "techLead": "openai/gpt-5.4-nano",
      "backend": "anthropic/claude-sonnet-4-6",
      "qa": "openai/gpt-5.4-nano",
      "architect": "anthropic/claude-sonnet-4-6"
    }
  },
  "adapterConfig": {
    "openrouter": {
      "enabled": true,
      "baseUrl": "https://openrouter.ai/api/v1"
    },
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
    "alex": "qa",
    "lead": "techLead"
  },
  "maxSteps": 5
}
```

### Agent output schemas (Zod / JSON)

**PlanOutput** (Tech Lead):

```json
{
  "summary": "string",
  "tasks": [{ "id": "string", "agent": "backend|qa|architect", "description": "string", "status": "pending|done" }],
  "questions": ["string"]
}
```

**PatchOutput** (Backend only):

```json
{
  "summary": "string",
  "patches": [{
    "filePath": "relative/path.ts",
    "unifiedDiff": "string (unified diff hunk)",
    "description": "string"
  }]
}
```

**ReviewOutput** (QA / Architect — read-only):

```json
{
  "summary": "string",
  "findings": [{ "severity": "info|warn|error", "message": "string", "filePath": "string?" }],
  "approved": true
}
```

**AgentOutput** (union wrapper):

```json
{
  "agentId": "techLead|backend|qa|architect",
  "type": "plan|patch|review|message",
  "data": "PlanOutput | PatchOutput | ReviewOutput | { summary: string }"
}
```

### Patch record (persisted)

```json
{
  "id": "uuid",
  "sessionId": "uuid",
  "agentId": "backend",
  "filePath": "src/auth.ts",
  "unifiedDiff": "string",
  "status": "pending|applied|rejected|rolled_back",
  "createdAt": "ISO-8601",
  "backupPath": "string?"
}
```

### Phase 1 completion checklist

| Feature | Status |
|---------|--------|
| Persistent REPL (`ai connect`) | Done |
| Four agents + Tech Lead orchestration | Done |
| `@agent` routing + stack escalation | Done |
| Diff-gated edits (`/diff`, `/apply`, `/rollback`, `/reject`) | Done |
| Repo scanner + project profile | Done |
| SQLite sessions (7-day resume) | Done |
| `.ai-shell.json` keys + per-role providers | Done |
| Providers: OpenAI, Anthropic, HF, OpenRouter, Puter, mock | Done |
| Structured outputs (Zod) + schema hints in prompts | Done |
| Default task pipeline when plan is empty | Done |
| Plan task `done` status + SQLite `session_state` | Done |
| Session memory summary (Phase 2 starter) | Done |
| Agent Markdown artifacts | Done |
| Local dashboard + provider telemetry | Done (beyond original Phase 1 non-goals) |
| MCP / autonomous PR / custom agents / Ollama | Not started (non-goals) |

### Agent artifacts

Each agent run writes a report under:

`.ai-shell/agents/<session-id>/<timestamp>-<role>.md`

In the REPL:

- `/artifacts` — list files for the current session
- `/artifacts preview` — show the latest artifact body

### Session memory (Phase 2 starter)

After an orchestrated flow, a short **session memory summary** is stored in SQLite (`session_state.memory_summary`) and injected into later agent prompts. View with `/status`.

### REPL commands (extended)

| Command | Description |
|---------|-------------|
| `/connect` | Refresh repo scan (start session with `ai connect`) |
| `/reject [id\|all]` | Mark pending patches as rejected |
| `/artifacts [preview]` | List or preview agent `.md` reports |
| `/sessions` | List recent projects; switch with `ai connect -C <path>` |
| `/dashboard`, `/metrics`, `/history` | Observability |

### Local dashboard (not cloud SaaS)

Phase 1 non-goals exclude a **hosted** UI. A **local** dashboard is available:

```bash
ai dashboard
```

Provider call metrics are stored in `provider_events` and exposed via `/metrics` and the dashboard observability page.