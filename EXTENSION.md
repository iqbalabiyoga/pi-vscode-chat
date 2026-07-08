# Pi Chat for VS Code — Extension Setup Guide

## Quick Install

### One-click from VS Code

1. Open VS Code command palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Run **Pi: Check Dependencies** to see what's missing
3. Run **Pi: Install Dependencies** to open a terminal with the full install script
4. Follow terminal prompts, then reload VS Code

Or open the **Pi Chat** sidebar — if `pi` binary is not found, a notification pops up with **Install Dependencies** button.

### Terminal script

```bash
bash scripts/install-deps.sh
```

## What gets installed

### Required (extension won't work without these)

| Dependency | Install command | Check |
|---|---|---|
| `pi` binary (`@earendil-works/pi-coding-agent`) | `bun add -g @earendil-works/pi-coding-agent` | `which pi` |
| `bun` (package manager) | `curl -fsSL https://bun.sh/install \| bash` | `which bun` |
| `marked` + `highlight.js` | `bun install` (project root) | `ls node_modules/marked` |

### Recommended pi skills (loaded automatically by pi)

| Package | Description |
|---|---|
| `context-mode` | Session-aware context management with FTS5 knowledge base |
| `pi-superpowers` | Plans, code review, debugging, brainstorming, TDD, verification |
| `pi-subagents` | Multi-agent orchestration with chains, parallel, async workflows |
| `pi-agents-team` | Team-based delegation with orchestrator pattern |
| `pi-caveman` | Token compression (caveman mode) |
| `pi-web-access` | Web search, fetch, content extraction |
| `pi-mcp-adapter` | MCP server connectivity |

```bash
# Install all recommended skills
bun add -g context-mode pi-superpowers pi-subagents pi-agents-team pi-caveman pi-web-access pi-mcp-adapter
```

## How it works

The extension spawns `pi --mode rpc` as a child process and communicates over JSONL (newline-delimited JSON) on stdin/stdout. It doesn't embed pi — it reuses whatever pi ecosystem you have installed (extensions, skills, models, providers like OpenCode).

```
VS Code Extension Host  ◄── JSONL over stdin/stdout ──►  pi --mode rpc (child process)
   WebviewView (sidebar)                                    all extensions/skills/providers
```

## Dependency check flow

```
extension activate
  │
  ├→ checkPiBinary(piPath) ──false──→ showWarningMessage
  │                                     ├→ "Install Dependencies" → runInstall()
  │                                     └→ "Check Dependencies" → runDependencyCheck()
  │
  └→ true → piClient.start()
              ├→ success → Pi Chat ready
              └→ error   → showErrorMessage
```

The `piChat.checkDependencies` command (also in welcome view) runs a full audit:
- pi binary on PATH
- bun & node availability
- `@earendil-works/pi-coding-agent` npm global package
- Each recommended pi skill
- Build deps (`marked`, `highlight.js`)

Missing items appear in a QuickPick with an **Install All** button at top.

## Commands

| Command | Keybinding | Description |
|---|---|---|
| `Pi: Check Dependencies` | — | Audit all dependencies |
| `Pi: Install Dependencies` | — | Open terminal with install script |
| `Pi: New Session` | — | Start fresh conversation |
| `Pi: Select Model` | — | Pick model/providers |
| `Pi: Accept Edit` | — | Keep a pending edit |
| `Pi: Reject Edit` | — | Revert a pending edit |
| `Pi: Abort Current Task` | — | Stop streaming agent |
| `Pi Chat: Ask About Selection` | — | Send selected code to chat |

## Settings

| Setting | Default | Description |
|---|---|---|
| `piChat.piPath` | `"pi"` | Path to pi binary |
| `piChat.adapterArgs` | `[]` | Extra CLI args for `pi --mode rpc` |
| `piChat.autoSnapshot` | `true` | Snapshot files before edits for accept/revert |

## Partial install vs full ecosystem

The extension works with just the `pi` binary. Skills are optional — they add capabilities but pi runs fine without them. The dependency checker lists them separately so you can see what you're missing.

## Troubleshooting

- **"pi not found"** — run `Pi: Install Dependencies` or `bash scripts/install-deps.sh`
- **"Failed to start pi process"** — check `piChat.piPath` setting, ensure pi binary is at that path
- **"No models available"** — pi needs at least one provider configured (e.g. OpenCode, Anthropic, OpenAI)
- **Skills not loading** — verify package is installed globally (`bun pm ls -g`), restart VS Code
