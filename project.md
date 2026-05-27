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
/connect        # start session
/diff           # show pending changes
/apply          # apply approved patches
/status         # show active tasks
/agents         # list agents
/rollback       # revert changes
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

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | One of OpenAI/Anthropic | OpenAI API key |
| `ANTHROPIC_API_KEY` | One of OpenAI/Anthropic | Anthropic API key |
| `AI_SHELL_PROVIDER` | No | `openai` or `anthropic` (default: auto-detect) |
| `AI_SHELL_MODEL` | No | Default model override |
| `AI_SHELL_MODEL_TECH_LEAD` | No | Per-role model override |
| `AI_SHELL_MODEL_BACKEND` | No | Per-role model override |
| `AI_SHELL_MAX_STEPS` | No | Max orchestrator steps per message (default: 5) |

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
  "models": {
    "techLead": "gpt-4o",
    "backend": "gpt-4o",
    "qa": "gpt-4o-mini",
    "architect": "gpt-4o-mini"
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