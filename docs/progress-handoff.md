# Pi VS Code Chat — Progress Handoff

> **Date:** 2026-07-02 (v2 — major RPC + UI overhaul)
> **Status:** Full RPC protocol coverage + professional Copilot-grade UI. Untested end-to-end in Extension Development Host.
> **Session mode:** implement

## v2 Overhaul (same day)

Everything below the line still describes the v1 architecture accurately, with these upgrades:

- **Steering**: prompts sent while streaming are queued via `streamingBehavior: "steer"`; queued chips shown above input; `queue_update` rendered.
- **Slash commands**: `get_commands` (60 commands on this machine — mcp, websearch, subagents, chain, skills…) powers an inline `/` autocomplete dropdown.
- **`@` files**: inline autocomplete dropdown fed by `workspace.findFiles` (no more QuickPick detour).
- **Sessions**: resume via `switch_session` RPC + `get_messages` history reload (no process restart). Session dir encoding fixed (`--Users-…--`, old code produced a triple dash and never found sessions). New sessions now persist (dropped `--no-session`).
- **Stats footer**: `get_session_stats` after each run → context %, cost, tokens.
- **Thinking level**: pill in the input toolbar cycles off→minimal→low→medium→high→xhigh (shown only for reasoning models).
- **Extension UI dialogs**: `select/confirm/input/editor` now rendered as webview modals (v1 forwarded them but never handled them — pi could block forever). `notify` → native VS Code notifications. `set_editor_text` → sets input.
- **Streaming tool output**: `tool_execution_update` → live output in tool cards.
- **Retry/compaction**: `auto_retry_*` and `compaction_*` events → status chips.
- **Edits**: `write`/`multi-edit` tools tracked too (not just `edit`); relative paths resolved against workspace; pinned "changes bar" with Keep all / Undo all.
- **Ask About Selection**: injects code block straight into the chat input (was: clipboard).
- **pi spawn**: `cwd` now set to workspace root (was: inherited, wrong).
- **No CDN**: marked + highlight.js bundled locally (`media/vendor.js`); strict CSP; inline `onclick` replaced with event delegation (v1's Accept/Revert buttons were blocked by CSP).
- **UI**: full redesign — welcome state, right-aligned user bubbles, compact tool rows with per-tool icons, hljs theme from VS Code tokens, code copy buttons, smart auto-scroll (stops when user scrolls up), Esc = abort.

**v2.1 additions:**
- **Interactive status chips** (replaces static text + fake spinners): `pi-rtk` → on/off toggle chip (`/rtk enable|disable`); `caveman` → level dropdown chip (`/caveman <level>`, 8 levels); `pi-agent-team` → condensed chip that opens the team panel. Team panel header gained Init/Result/Stop buttons (`/team-init`, `/team-result`, `/team-stop`) and a close button; panel can be pinned open even with no active agents. New `runCommand` webview message → `pi.prompt()` without a chat bubble (extension commands run immediately even during streaming). Spinner now only shown for genuinely-busy chips (retry/compaction).
- **Drag & drop overhaul**: handles `application/vnd.code.uri-list`, `resourceurls`, `codefiles`, `text/uri-list`, `vscode-remote://` URIs (VS Code explorer/tabs) and OS drops from Finder (`file.path` when Electron exposes it, else image→base64 / text→inline content ≤64KB with binary sniffing). Full-window "Drop files to attach" overlay with dragenter/leave depth tracking.

**Next steps:** F5 smoke test; consider fork/`get_tree` UI; VSIX packaging.

---

## What Was Built

VS Code extension that provides a GitHub Copilot-like chat sidebar powered by the local `pi --mode rpc` binary. User's entire pi ecosystem (extensions, skills, multi-agent, OpenCode tokens) is reused without modification — the extension is purely a UI layer.

## Architecture

```
┌──────────────────────────┐     stdin/stdout     ┌──────────────────────┐
│  VS Code Extension Host   │◄───── JSONL ───────►│  pi --mode rpc       │
│  (child_process.spawn)    │                      │  (child process)     │
│                           │                      │                      │
│  ┌─────────────────────┐  │                      │  - All extensions    │
│  │  WebviewView        │  │                      │  - Skills            │
│  │  (Chat Sidebar)     │  │                      │  - Multi-agent       │
│  │  HTML/CSS/JS        │  │                      │  - OpenCode / etc    │
│  └─────────────────────┘  │                      └──────────────────────┘
└──────────────────────────┘
```

**Key decisions:**
- `pi --mode rpc` child process → zero SDK dependency, full binary reuse
- WebviewView → native VS Code sidebar component with `retainContextWhenHidden`
- All types defined locally (no pi npm dependency) — extension only imports `vscode` + `child_process`
- Edit tracking via file snapshot on `agent_start`, diff via pi's `details.diff`

## Files

```
pi-vscode-chat/
├── package.json                 # Extension manifest: views, commands, menus, config
├── tsconfig.json
├── .vscode/
│   ├── launch.json              # F5 → Extension Development Host
│   └── tasks.json               # compile task
├── src/
│   ├── extension.ts             # activate/deactivate, register commands
│   ├── piRpcClient.ts           # spawn pi, JSONL I/O, event emitter
│   ├── chatSidebarProvider.ts   # WebviewViewProvider, event bridge, model/file dialogs
│   ├── editManager.ts           # File snapshots, edit tracking, revert
│   └── types.ts                 # All shared types (RPC, events, webview messages)
├── media/
│   ├── style.css                # Copilot-inspired dark theme
│   └── main.js                  # Webview frontend (vanilla JS, ~600 lines)
├── out/                         # Compiled JS
└── docs/
    └── plans/
        └── 2026-07-02-pi-vscode-chat-design.md
```

## Feature Inventory

### A — Chat Sidebar ✅ (implemented, untested end-to-end)

| Feature | Implementation |
|---------|---------------|
| Webview sidebar | `ChatSidebarProvider` via `registerWebviewViewProvider` |
| Input box | Textarea + send button, auto-resize |
| Send prompt | `piRpcClient.prompt()` → `{type:"prompt"}` JSONL |
| Streaming text | `text_delta` → webview `handleTextDelta` → append to `.streaming-text` |
| Thinking blocks | `thinking_delta` → collapsible `<details>` + line count |
| Tool cards | `tool_execution_start/end` → styled card with icon + status |
| Model selector | QuickPick from `get_available_models` → `set_model` |
| New session | `new_session` RPC command |
| `@` file reference | Webview `@` trigger → `searchFile` message → `workspace.findFiles` QuickPick → `file://` link |
| Drag & drop | FileReader → base64 attachment chips → sent as `images` in prompt |
| Extension UI dialogs | `extension_ui_request` → webview modals (confirm/select/input/editor) → `extension_ui_response` |
| Abort | `abort` RPC command + UI state management |
| Status indicator | pulsating dot during streaming |
| Send selection | Right-click → copies as markdown code block → focuses pi chat |

### B — File Changes ✅ (implemented, untested)

| Feature | Implementation |
|---------|---------------|
| Snapshot on agent_start | `EditManager.snapshotWorkspace()` reads all open docs |
| Edit tracking | `tool_execution_end` with `details.diff` → `recordEdit()` |
| Accept | `acceptEdit()` — marks status, no-op on file (already applied) |
| Revert | `revertEdit()` → `workspace.fs.writeFile(originalContent)` |
| Diff view | `vscode.diff` via `TextDocumentContentProvider` |
| UI badges | Pending → Accepted ✓ / Reverted ↩ |
| Action buttons | Diff / Accept / Revert per change in webview |

### Settings

| Key | Default | Description |
|-----|---------|-------------|
| `piChat.piPath` | `"pi"` | Path to pi binary |
| `piChat.adapterArgs` | `[]` | Extra CLI args e.g. `["--provider","opencode"]` |
| `piChat.autoSnapshot` | `true` | Snapshot files before edits |

## Communication Protocol

### pi → Extension (stdout JSONL)
- `message_update` with `text_delta`, `thinking_delta/end`
- `tool_execution_start/end` — tool lifecycle
- `agent_start/end` — prompt lifecycle
- `extension_ui_request` — select/confirm/input/editor/notify
- `extension_error` — extension errors forwarded to user

### Extension → pi (stdin JSONL)
- `{"type":"prompt","message":"..."}` — send prompt
- `{"type":"abort"}` — cancel
- `{"type":"set_model","provider":"...","modelId":"..."}` — switch model
- `{"type":"set_thinking_level","level":"..."}` — thinking level
- `{"type":"new_session"}` — fresh session
- `{"type":"extension_ui_response","id":"...","value":"..."}` — UI dialog response

## Edge Cases & Risks

| Issue | Status | Mitigation |
|-------|--------|------------|
| pi binary not in PATH | Warning on activate | Config `piChat.piPath` |
| pi process crashes | Handled | `exit` event → reject pending requests, show error |
| Large thinking blocks | Handled | Max-height 300px + scroll |
| Same file edited multiple times | Snapshot captures first version only | Revert restores pre-agent state, not pre-edit |
| Edit tool doesn't return `details.diff` | Fallback | `EditManager.computeDiff()` LCS-based |
| Webview persistent state | Partial | `vscode.getState/setState` for edits |
| RPC response timeout | 60s | `setTimeout` in `send()` rejects after timeout |
| Concurrent prompts during streaming | Blocked | Send button disabled + `streamingBehavior` check |
| Extension UI dialogs timeout | Partial | RPC protocol supports `timeout` field, not yet wired |

## Known Gaps (pre-production)

1. **No `@` file fuzzy search from webview** → current impl opens VS Code QuickPick, not inline dropdown like Copilot
2. **No message history persistence** → webview messages lost on sidebar close/reload (VS Code `retainContextWhenHidden` covers visibility toggle but not reload)
3. **No thinking level control from UI** → only via settings or RPC directly
4. **No multi-agent panel** → pi's sub-agent orchestration not surfaced in UI
5. **No extension/skill manager UI** → only available via pi CLI
6. **Edit revert uses `workspace.fs.writeFile`** → doesn't go through VS Code's undo stack; unsaved editor changes may conflict
7. **`sendSelection` uses clipboard** → not direct injection into pi chat input
8. **Drag-drop from VS Code explorer** → webview receives `file://` text, not `DataTransferItem` file objects; attachment flow needs refinement
9. **No pi config/restart** → extension settings changes require VS Code window reload
10. **No session list/browser** → `/resume` not available from UI

## Next Steps

1. **Test F5** — open in VS Code, spawn pi, send prompt
2. **Fix drag-drop from explorer** — VS Code webview doesn't get real File objects from native file drag; need alternative via `vscode` API
3. **Add session restore** — `SessionManager.list()` → QuickPick → `switch_session` RPC
4. **Wire abort to webview** — abort button in header already exists, needs proper streaming state management
5. **Persist webview state** — save messages to extension host on visibility change

## Design Rationale

- **Why `pi --mode rpc` instead of SDK?** Full binary reuse. All pi extensions, skills, providers (OpenCode, etc.) work naturally. No version sync issues. Process isolation protects VS Code from pi crashes.
- **Why vanilla JS webview instead of React?** Zero build step. No bundler config. Faster iteration for a personal extension.
- **Why snapshot-based revert instead of git?** Works regardless of git status. Files don't need to be tracked. Simpler for single-file reverts.
- **Why `retainContextWhenHidden`?** Keeps webview alive when switching tabs, avoids re-render cost.
