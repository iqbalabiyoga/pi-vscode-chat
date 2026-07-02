# Pi Chat for VS Code

A GitHub Copilot-style chat sidebar powered by your local [pi coding agent](https://github.com/badlogic/pi-mono) — with **all** of its extensions, skills, providers, and multi-agent tooling working out of the box.

The extension embeds no agent SDK. It spawns the real `pi` binary as a child process (`pi --mode rpc`) and talks JSONL over stdin/stdout, so everything you have configured in `~/.pi` (OpenCode models, MCP adapters, subagents, rtk, caveman, agents-team, custom skills…) just works. Process isolation means a pi crash can never take down VS Code.

## Features

- **Streaming chat** — markdown rendering, syntax-highlighted code blocks with copy buttons, collapsible thinking blocks.
- **Steering** — keep typing while the agent runs; Enter queues a steering message, Esc aborts.
- **Slash commands** — `/` autocompletes every pi command, skill, and prompt template on your machine.
- **`@` file references** — inline fuzzy file search over the workspace.
- **Edit tracking** — every agent file edit gets Diff / Keep / Undo actions, plus a "Keep all / Undo all" changes bar. Revert restores the pre-agent snapshot.
- **Sessions** — browse and resume previous pi sessions for the workspace; history loads through the RPC protocol.
- **Live stats** — context usage, session cost, and token totals in the footer.
- **Model & thinking level** — switch models via QuickPick; cycle reasoning effort from the input toolbar.
- **Extension status chips** — pi extensions surface as interactive chips: toggle rtk, change caveman level, open the agent-team panel (Init / Result / Stop).
- **Attachments** — file picker, image paste, and drag & drop from the VS Code explorer or Finder.
- **Theme-native UI** — every color comes from VS Code theme tokens; light, dark, and high-contrast all work. No CDN assets, strict CSP.

## Requirements

- The `pi` binary on your `PATH` (or set `piChat.piPath`), e.g. `bun add -g @earendil-works/pi-coding-agent`
- VS Code ≥ 1.98

## Install

```bash
bun run compile
bunx @vscode/vsce package --no-dependencies
code --install-extension pi-vscode-chat-*.vsix
```

Then open the **Pi Chat** icon in the activity bar.

## Settings

| Setting | Default | Description |
|---|---|---|
| `piChat.piPath` | `"pi"` | Path to the pi binary |
| `piChat.adapterArgs` | `[]` | Extra CLI args after `--mode rpc`, e.g. `["--provider","opencode"]` |
| `piChat.autoSnapshot` | `true` | Snapshot files before edits to enable accept/revert |

Changing `piPath`/`adapterArgs` prompts for a window reload.

## Development

```bash
bun install
bun run compile   # vendor bundle + extension bundle + type check
```

Press **F5** to launch the Extension Development Host. Architecture notes live in [docs/](docs/).
