# Changelog

## 0.2.0 (2026-07-08)

### Major

- **Privacy audit & fix**: environment variable leak fixed — child process now receives only `PATH`, `HOME`, `USER`, `TERM` (not full `process.env`). Added `piChat.extraEnv` setting for opt-in env forwarding.
- **Comprehensive README**: data flow diagram, privacy & data handling disclosure, security recommendations, full dependency tree, troubleshooting table.
- **Extension icon**: custom π + chat bubble icon for Marketplace listing.
- **CHANGELOG, LICENSE** files added per Marketplace recommendations.

### Features

- Streaming chat with real-time markdown + syntax highlighting
- Agent steering (Enter = steer, Esc = abort)
- Slash commands (`/`) with autocomplete
- `@` file search with fuzzy matching
- Edit tracking: Diff / Keep / Undo per edit, Keep all / Undo all batch actions
- Session management: browse, resume previous sessions per workspace
- Live stats: context %, cost, token totals in footer
- Model switching via QuickPick, thinking level cycling
- Extension status chips (rtk toggle, caveman level, agents-team panel)
- Attachments: file picker, image paste, drag & drop
- Theme-native UI (all colors from `--vscode-*` tokens)
- Strict CSP, no CDN assets

### Infrastructure

- Bundled vendor deps: marked + highlight.js via `bun run build:vendor`
- RPC protocol over JSONL stdin/stdout to `pi --mode rpc`
- Process isolation: pi crash never affects VS Code
- Auto-restart on configuration change
- Dependency checker: audits pi binary, bun, node, npm globals, skills, build deps

## 0.1.0 (2026-06-??)

- Initial prototype: basic chat sidebar with pi RPC integration.
