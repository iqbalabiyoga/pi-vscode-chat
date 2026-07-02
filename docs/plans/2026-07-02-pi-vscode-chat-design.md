# Pi VS Code Chat — Design Document

**Date:** 2026-07-02
**Status:** Approved v0 scope

## Vision

VS Code extension chat sidebar yang semirip mungkin dengan GitHub Copilot Chat bawaan, tapi ditenagai oleh binary `pi` coding agent lokal — lengkap dengan seluruh extension, skill, multi-agent, dan OpenCode gratis.

## Priority (v0)

1. **A: Chat Sidebar** — Input prompt, streaming response, collapsible thinking blocks
2. **B: File Changes Diff** — Track edits, show diff, accept/reject per change

## Architecture

```
┌──────────────────────────┐     stdin/stdout     ┌──────────────────────┐
│  VS Code Extension Host   │◄───── JSONL ───────►│  pi --mode rpc       │
│  (Node.js child_process)  │                      │  (child process)     │
│                           │                      │                      │
│  ┌─────────────────────┐  │                      │  - All extensions    │
│  │  WebviewView        │  │                      │  - Skills            │
│  │  (Chat Sidebar)     │  │                      │  - Multi-agent       │
│  │  HTML/CSS/JS        │  │                      │  - OpenCode / any    │
│  └─────────────────────┘  │                      └──────────────────────┘
└──────────────────────────┘
```

**Key decisions:**
- `pi --mode rpc` as child process → full binary reuse, no SDK embed needed
- WebviewView for sidebar → native VS Code component, persistent
- Pi loads ALL installed extensions/skills naturally — nothing to configure
- VS Code extension only handles UI, file snapshot/revert, and RPC bridge

## Communication Protocol

### pi → Extension (stdout)
- JSONL events per [RPC protocol](https://github.com/earendil-works/pi-coding-agent/blob/main/docs/rpc.md)
- Key events: `message_update`, `tool_execution_start/end`, `agent_start/end`, `turn_start/end`, `extension_ui_request`

### Extension → pi (stdin)
- JSONL commands: `prompt`, `abort`, `set_model`, `set_thinking_level`, etc.
- `extension_ui_response` for user dialogs

## A. Chat Sidebar — Webview Layout

```
┌─────────────────────────────┐
│  ⚡ Pi · claude-sonnet   ⚙️  │  ← header: model, thinking level, menu
├─────────────────────────────┤
│                             │
│  ┌─── User ────────────┐   │
│  │ ref file.ts          │   │  ← file chips with path
│  │ "Refactor this..."   │   │
│  └──────────────────────┘   │
│                             │
│  ┌─── Assistant ───────┐   │
│  │ ▼ Thinking (3 blks)  │   │  ← collapsible, expandable
│  │  ... reasoning ...   │   │
│  │                      │   │
│  │ Let me check...      │   │  ← streaming text (append)
│  │                      │   │
│  │ 🔍 read file.ts      │   │  ← tool card (icon + arg)
│  │ 📝 edit file.ts     │   │  ← tool card + diff badge
│  │   [diff] [revert]    │   │  ← action buttons
│  └──────────────────────┘   │
│                             │
├─────────────────────────────┤
│ @file  📎             ➡️  │  ← input: @ trigger, drag-drop
└─────────────────────────────┘
```

### File Reference
- `@` → `vscode.window.showQuickPick` file picker → insert as markdown link `[path](file://abs-path)`
- Drag from VS Code explorer → `webview.onDidDrop` → resolve `Uri` → show attachment chip
- Images attached as base64, sent via RPC `"images": [...]`
- Text files attached as `@` path reference in prompt

### Streaming Render
- `thinking_delta` → append to collapsible `<details>` → auto-expand if first thinking block
- `text_delta` → append to assistant message div via `insertAdjacentHTML`
- `tool_execution_start` → create tool card (icon, name, args preview)
- `tool_execution_end` → update card with result status (✓ success / ✗ error)

### Extension UI Requests
- `extension_ui_request.select/confirm/input/editor` → render as modal dialog in webview
- Response sent back via `extension_ui_response` JSONL to pi stdin

## B. File Changes — Diff & Accept/Reject

### Edit Snapshot Flow

1. Pi agent calls `edit` tool
2. Tool executes normally (file changed on disk)
3. Extension receives `tool_execution_end` with `result.details.diff` / `result.details.patch`
4. EditTracker records: file path, original content (snapshot taken before run), new content, diff
5. Chat UI shows tool card with `[diff] [revert]` buttons
6. User clicks:
   - **diff** → `vscode.commands.executeCommand('vscode.diff', ...)` opens VS Code diff editor
   - **revert** → write original content back via `workspace.fs.writeFile`

### Snapshot Strategy
- On `agent_start`: traverse workspace open files, snapshot to Map<Uri, string>
- Each `edit` result: record against snapshot
- Revert: restore from snapshot (works across multiple edits to same file — only first snapshot matters)

### Accept/Reject UX
- Tool card shows status badge: `pending` → `accepted` ✓ or `reverted` ↩️
- Revert is destructive per-file (resets to pre-agent state)
- Accept is implicit when user does nothing (edits already applied)

## Project Structure

```
pi-vscode-chat/
├── package.json             # Extension manifest
├── tsconfig.json            # TypeScript config
├── docs/plans/              # Design docs
├── src/
│   ├── extension.ts         # Activation, commands, lifecycle
│   ├── piRpcClient.ts       # pi child process, JSONL I/O, event bus
│   ├── chatSidebarProvider.ts # WebviewViewProvider for sidebar
│   ├── editManager.ts       # Snapshot, diff tracking, revert
│   └── types.ts             # Shared types
└── media/
    ├── style.css            # Webview styles (Copilot-like)
    └── main.js              # Webview frontend JS
```

## Implementation Plan

### Phase 1 — Skeleton
1. `package.json` + `tsconfig.json`
2. `extension.ts` — register commands, views
3. `piRpcClient.ts` — spawn pi, JSONL parse, emit events
4. `chatSidebarProvider.ts` — create webview, basic HTML scaffold

### Phase 2 — Chat UI
5. Webview HTML: message list, input box, file reference @-completion
6. Event → render pipeline (text_delta, thinking, tool cards)
7. Send prompt via RPC, handle response

### Phase 3 — File Changes
8. `editManager.ts` — snapshot on agent_start, track edits
9. Tool card diff badge + revert button
10. `vscode.diff` integration

### Phase 4 — Polish
11. Model selector in header
12. Session management (new, resume)
13. Abort button
14. Error recovery

## Future (post-v0)
- Multi-agent panel (monitor sub-agents)
- Extension/skill manager in sidebar
- Context-mode integration
- Custom pi extension for edit preview (block-then-approve)
