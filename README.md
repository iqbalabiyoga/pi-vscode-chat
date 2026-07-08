# Pi Chat for VS Code

**Pi Chat** brings your local [pi coding agent](https://github.com/badlogic/pi-mono) into VS Code as a Copilot-style chat sidebar — with **all** pi extensions, skills, providers (OpenCode, Anthropic, OpenAI, etc.) and multi-agent tooling working out of the box.

> ⚡ The extension is a **UI + RPC bridge layer** — it spawns the real `pi` binary (`pi --mode rpc`) as a child process and talks JSONL over stdin/stdout. It embeds no agent SDK. Everything you have configured in `~/.pi/` works automatically. Process isolation means a pi crash never takes down VS Code.

---

## Features

- **Streaming chat** — real-time markdown rendering, syntax-highlighted code blocks, copy buttons, collapsible thinking (reasoning) blocks.
- **Steering** — keep typing while the agent runs. Enter queues a steering message, Esc aborts.
- **Slash commands** — `/` autocompletes every pi command, skill, prompt template on your machine (rtk, caveman, team-init, etc.).
- **`@` file search** — inline fuzzy file search: `@` + filename to reference workspace files.
- **Edit tracking** — every agent file edit gets Diff / Keep / Undo. A "Keep all / Undo all" changes bar lets you batch-accept or batch-revert edits from the current session.
- **Session management** — browse and resume previous pi sessions per workspace. History loads through pi's RPC protocol (respects branches, compaction).
- **Live stats** — context usage %, session cost, token totals in the footer.
- **Model & thinking level** — QuickPick to switch models; cycle reasoning effort (off → minimal → low → medium → high → xhigh) from the toolbar.
- **Extension status chips** — pi extensions surface as interactive chips: toggle rtk on/off, change caveman compression level, open the agents-team panel (Init / Result / Stop).
- **Attachments** — VS Code file picker, image paste from clipboard, drag & drop from Explorer or Finder.
- **Theme-native UI** — every color derives from VS Code theme tokens. Light, dark, and high-contrast all work. No CDN assets. Strict Content Security Policy.

---

## Requirements

### Required

| Dependency | Minimum version | Notes |
|---|---|---|
| **VS Code** | `^1.98.0` | Latest stable or Insiders |
| **pi binary** | Latest | `bun add -g @earendil-works/pi-coding-agent` |
| **bun** | Latest | Package manager: `curl -fsSL https://bun.sh/install \| bash` |
| **marked** + **highlight.js** | — | Bundled at build time (`bun run build:vendor`); not a runtime install |

### Provider (pick one)

pi needs at least one AI provider configured. Common options:

- **[OpenCode](https://github.com/badlogic/opencode)** (default) — use `piChat.adapterArgs: ["--provider","opencode","--model","opencode-zen"]`
- **Anthropic** — `ANTHROPIC_API_KEY` env var
- **OpenAI** — `OPENAI_API_KEY` env var
- **any pi-compatible provider** — per your `~/.pi/config`

### Recommended (optional — add capabilities)

| Package | What it adds | Install |
|---|---|---|
| `context-mode` | Session-aware FTS5 knowledge base, auto-indexing | `bun add -g context-mode` |
| `pi-superpowers` | Plans, code review, TDD, debugging, brainstorming | `bun add -g pi-superpowers` |
| `pi-subagents` | Multi-agent chains, parallel, async workflows | `bun add -g pi-subagents` |
| `pi-agents-team` | Team-based delegation (orchestrator + workers) | `bun add -g pi-agents-team` |
| `pi-caveman` | Token compression (caveman speak mode) | `bun add -g pi-caveman` |
| `pi-web-access` | Web search, fetch, content extraction | `bun add -g pi-web-access` |
| `pi-mcp-adapter` | Connect MCP servers | `bun add -g pi-mcp-adapter` |

```bash
# Install all recommended skills in one command:
bun add -g context-mode pi-superpowers pi-subagents pi-agents-team pi-caveman pi-web-access pi-mcp-adapter
```

---

## Installation

### From VS Code Marketplace (recommended)

1. Open VS Code
2. Go to Extensions (`Cmd+Shift+X` / `Ctrl+Shift+X`)
3. Search **"Pi Chat"**
4. Click **Install**

### From VSIX

```bash
git clone https://github.com/iqbalabiyoga/pi-vscode-chat
cd pi-vscode-chat
bun install
bun run compile
bunx @vscode/vsce package --no-dependencies
code --install-extension pi-vscode-chat-*.vsix
```

---

## Quick Setup

1. Click the **Pi Chat** icon in the activity bar (comment-discussion icon).
2. If the `pi` binary is missing, a notification offers **Install Dependencies** — click it and follow terminal prompts.
3. Check everything is ready: run **Pi: Check Dependencies** from the command palette.
4. Start chatting!

### Settings

| Setting | Default | Description |
|---|---|---|
| `piChat.piPath` | `"pi"` | Path to pi binary (absolute path, or name found on PATH) |
| `piChat.adapterArgs` | `[]` | Extra CLI args after `--mode rpc`. Example: `["--provider","opencode","--model","opencode-zen"]` |
| `piChat.autoSnapshot` | `true` | Snapshot files before edits, enabling accept/revert |
| `piChat.extraEnv` | `{}` | Extra environment variables passed to pi process. **Security:** by default only `PATH`, `HOME`, `USER`, `TERM` are forwarded. Use this to pass API keys: `{ "ANTHROPIC_API_KEY": "sk-ant-..." }` |

> ⚠️ Changing `piPath` or `adapterArgs` requires a window reload to restart the pi child process.

---

## Commands

| Command | Keybinding | Description |
|---|---|---|
| `Pi: Check Dependencies` | — | Audit all required and optional dependencies |
| `Pi: Install Dependencies` | — | Open terminal with install script |
| `Pi: New Session` | — | Start a fresh conversation |
| `Pi: Select Model` | — | Pick model/provider from available options |
| `Pi: Accept Edit` | — | Keep a pending edit |
| `Pi: Reject Edit` | — | Revert a pending edit |
| `Pi: Abort Current Task` | — | Stop the currently running agent |
| `Pi Chat: Ask About Selection` | Editor context menu | Send selected code to chat with file path and line numbers |

---

## Privacy & Data Handling

Understanding how data flows through Pi Chat is important — especially since the extension connects to AI providers.

### Data flow

```
Your code / files / images
    │
    ▼
VS Code Extension Host ◄────────────►  pi --mode rpc (child process)
    │                                        │
    │                                   [your local machine]
    │                                        │
    ▼                                        ▼
Webview (sidebar UI)                  AI provider (OpenCode,
(no network access,                     Anthropic, OpenAI, etc.)
 only local webview)                    │
                                        ▼
                                  External API servers
```

### What data is sent to AI providers

Everything you type, attach, or that pi reads during execution is sent through pi to whichever AI provider you've configured (OpenCode, Anthropic, OpenAI, Gemini, etc.):

- **Chat messages** — your prompts, questions, code requests
- **Attached files** — files selected via file picker, or dropped/ pasted into the chat
- **Source code** — pi's `read`, `grep`, `find`, `ls` tools read workspace files. pi passes relevant excerpts to the AI provider
- **Images** — pasted from clipboard or dropped into the webview (converted to base64)
- **Workspace structure** — file paths, directory names, project scaffolding

### What stays local

- **Edit snapshots** — file snapshots for accept/revert are stored in extension memory only
- **Session list** — session files are read from `~/.pi/agent/sessions/*.jsonl` and their titles displayed; the raw session files are never sent externally
- **VS Code state** — the webview's rendered message HTML is persisted via `vscode.setState()` (VS Code's Extension Storage); this stays on disk locally unless you use Settings Sync

### Disk storage

- **Session files** (`~/.pi/agent/sessions/--<workspace>--/*.jsonl`) contain full conversation history in plaintext JSONL. Anyone with filesystem access can read them
- **VS Code Extension Storage** persists the last rendered chat UI state; this is local unless VS Code Settings Sync is enabled
- No telemetry, no analytics, no usage reporting

### Security recommendations

1. **Do not paste API keys, passwords, or tokens into chat prompts** — they will be sent to the AI provider
2. **Review your provider's data policy** — pi sends code to whatever provider you configure (OpenCode is self-hosted; Anthropic/OpenAI have their own data usage policies)
3. **Use `piChat.extraEnv` for credentials** — pass API keys through env vars instead of in prompts
4. **Clear sessions** regularly — `Pi: New Session` starts fresh; old sessions remain on disk under `~/.pi/agent/sessions/`
5. **Be mindful of drag & drop** — files dropped from Finder are automatically read and their contents may be sent to the AI provider
6. **Check `piChat.piPath`** — only install pi from trusted sources (`@earendil-works/pi-coding-agent` on npm)

*See [Security & Privacy](#privacy--data-handling) section for full details.*

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│  VS Code Extension Host                          │
│  ┌──────────────────────┐  ┌──────────────────┐  │
│  │  PiRpcClient          │  │  EditManager      │  │
│  │  ─ child process mgr  │  │  ─ snapshot/revert│  │
│  │  ─ JSONL stdin/stdout │  │  ─ diff tracking  │  │
│  └──────────┬───────────┘  └──────────────────┘  │
│             │                                     │
│  ┌──────────▼───────────┐                        │
│  │  ChatSidebarProvider   │                      │
│  │  ─ WebviewViewProvider│                      │
│  │  ─ event bridge       │                       │
│  │  ─ message routing    │                       │
│  └──────────┬───────────┘                        │
│             │ postMessage / onDidReceiveMessage   │
└─────────────┼────────────────────────────────────┘
              │
              ▼
┌────────────────────────────┐
│  Webview (sidebar)          │
│  ─ vanilla JS, no framework │
│  ─ marked + highlight.js    │
│  ─ CSP: local scripts only  │
│  ─ all colors from theme    │
└────────────────────────────┘
              ▲
              │ JSONL over stdin/stdout
              │
┌─────────────────────────────┐
│  pi --mode rpc (child)       │
│  ─ all extensions & skills   │
│  ─ configured AI provider    │
│  ─ multi-agent, subagents    │
│  ─ sessions, filesystem, etc │
└─────────────────────────────┘
```

### Key design decisions

- **No agent SDK embedded** — the extension is pure UI + RPC bridge. Everything pi-related comes from the real binary
- **Process isolation** — a pi crash cannot take down VS Code (separate OS process)
- **Sessions persist by default** — the child process writes session files to `~/.pi/agent/sessions/`; history loads through RPC, respecting branches and compaction
- **CSP-locked webview** — no inline scripts, no CDN, `default-src 'none'`. All webview assets (CSS, JS, vendor bundle) ship with the extension
- **Minimal env exposure** — only `PATH`, `HOME`, `USER`, `TERM` are forwarded to the child process by default (not the full `process.env`); opt-in via `piChat.extraEnv`

---

## Development

```bash
bun install                    # Install build deps (marked, highlight.js, TypeScript)
bun run compile                # Full build: vendor + extension + type check
bun run build                  # Extension bundle only (fast iteration)
bun run build:vendor           # Vendor bundle only (marked + hljs)
bun run watch                  # tsc -watch for type checking only
```

Press **F5** to launch the Extension Development Host (`.vscode/launch.json` runs `npm: compile` first).

### Project structure

```
src/
├── extension.ts              # Activation, command registration, dependency check
├── piRpcClient.ts            # Child process manager, JSONL protocol
├── chatSidebarProvider.ts    # WebviewViewProvider, event bridge
├── editManager.ts            # File snapshots, accept/revert tracking
├── types.ts                  # All message shapes (RPC, webview, events)
media/
├── main.js                   # Webview frontend (vanilla JS)
├── style.css                 # Theme-native styles (--vscode-* tokens)
├── vendor-entry.js           # Entry point for vendor bundle
├── vendor.js                 # Bundled marked + highlight.js (built)
```

### READ THIS

- The `out/extension.js` entry point is produced by **bun build**, not `tsc`. `tsc` only type-checks. If changes don't take effect, rebuild the bun bundle.
- All message shapes across all three boundaries (RPC ↔ extension host ↔ webview) are defined in `src/types.ts` — single source of truth.
- The webview has zero npm dependencies at runtime — all JS ships with the extension. No CDN. Strict CSP.
- Colors come from `--vscode-*` CSS variables. No hard-coded palette.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "pi not found" | pi binary not on PATH | Run **Pi: Install Dependencies** or `bun add -g @earendil-works/pi-coding-agent`. Check `piChat.piPath` setting |
| "Failed to start pi process" | Wrong path or permission | Verify `piChat.piPath` points to a valid binary. Check VS Code Developer Tools console for details |
| "No models available" | No AI provider configured | pi needs at least one provider. Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in `piChat.extraEnv`, or use OpenCode |
| Skills not loading | Global install missing | `bun pm ls -g` to check; `bun add -g <name>` to install. Restart VS Code |
| Webview blank / not loading | Vendor bundle issue | Rebuild: `bun run build:vendor`. Check Extension Host logs |
| Chat history missing after reload | State cleared | Sessions are persisted in `~/.pi/agent/sessions/` — click **History** button to resume one |
| "Compacting conversation" | Context window full | Normal — pi compacts the conversation to fit. The agent pauses briefly |
| Extension commands not found | Extension not activated | Open the Pi Chat sidebar to activate, or run any Pi command from the palette |

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

## Publishing Lifecycle

### Prerequisites

1. **Install `@vscode/vsce`** — the VS Code Extension Manager CLI:

   ```bash
   bun add -g @vscode/vsce
   ```

2. **Create a publisher** on the [Visual Studio Marketplace management page](https://marketplace.visualstudio.com/manage).

3. **Get a Personal Access Token (PAT)** from Azure DevOps (`Marketplace` → `Manage` → `Personal Access Tokens`). Scope: `Marketplace (publish)`.

4. **Verify publisher**:

   ```bash
   vsce login iqbalabiyoga
   # paste your PAT when prompted
   ```

### Packaging

```bash
bun run compile              # full build first
vsce package --no-dependencies
# Produces: pi-vscode-chat-<version>.vsix
```

Check the package contents:

```bash
vsce ls
```

### Publishing

```bash
# First-time publish
vsce publish --no-dependencies
```

### Version updates

`vsce` auto-increments the version for you:

```bash
vsce publish patch           # 0.2.0 → 0.2.1
vsce publish minor           # 0.2.0 → 0.3.0
vsce publish major           # 0.2.0 → 1.0.0
vsce publish 0.5.0           # explicit version
```

Each command:

1. Bumps the `version` field in `package.json`
2. Creates a git commit + tag (format: `v<version>`)
3. Builds and uploads the `.vsix` to Marketplace

Use `-m "custom message %s"` to override the commit message (where `%s` is the version).

### Pre-release versions

```bash
vsce publish --pre-release patch
```

Best practice: use even minor for release (`0.2.x`), odd minor for pre-release (`0.3.x`). Only `major.minor.patch` is supported — no semver pre-release tags.

### After publishing

- Extension appears on [Marketplace](https://marketplace.visualstudio.com/items?itemName=iqbalabiyoga.pi-vscode-chat) within minutes
- Users install directly from VS Code Extensions view (`Cmd+Shift+X`)
- Updates are delivered automatically (VS Code checks periodically)

### CI/CD automation

For automated publishing (GitHub Actions, etc.), Microsoft recommends [workload identity federation](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace) instead of long-lived PATs.

### Required files for Marketplace

| File | Status | Purpose |
|---|---|---|
| `README.md` | ✅ Done | Extension description page |
| `LICENSE` | ✅ Done | License info (MIT) |
| `CHANGELOG.md` | ✅ Done | Version history |
| `icon.png` (≥128×128) | ✅ Done | Extension icon |
| `package.json#galleryBanner` | ✅ Done | Banner color (`#4f46e5`) |
| `package.json#icon` | ✅ Done | Path to icon |

---

*Built with pi — the open-source coding agent for your terminal, now in your editor.*
