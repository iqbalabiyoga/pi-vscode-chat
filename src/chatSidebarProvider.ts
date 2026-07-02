import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { PiRpcClient } from './piRpcClient';
import { EditManager } from './editManager';
import type { WebviewMessage, WebviewOutMessage, RpcEvent, ExtensionUiRequest, EditRecord } from './types';

/**
 * WebviewViewProvider for the Pi Chat sidebar.
 * Bridges between pi RPC events and the webview UI.
 */
export class ChatSidebarProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private isStreaming = false;
  private diffContentProvider = new PiOriginalContentProvider();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly pi: PiRpcClient,
    private readonly edits: EditManager,
  ) {
    this.pi.on('event', this.onPiEvent.bind(this));
    this.pi.on('exit', (code: number | null) => {
      this.setStreaming(false);
      this.postMessage({ type: 'error', message: `pi process exited (code=${code}). Check "piChat.piPath" or restart the window.` });
    });
    this.edits.onDidChange(this.onEditChanged.bind(this));
    vscode.workspace.registerTextDocumentContentProvider('pi-original', this.diffContentProvider);
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'media'),
      ],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((msg: WebviewMessage) => {
      this.handleWebviewMessage(msg);
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.sendState();
      }
    });
  }

  /** Insert text into the chat input (used by "Ask About Selection") */
  insertPrompt(text: string): void {
    this.postMessage({ type: 'setInputText', text, append: true });
  }

  /** Start a fresh session (also callable from command palette) */
  async newSession(): Promise<void> {
    await this.pi.newSession();
    this.edits.clear();
    this.postMessage({ type: 'sessionCleared' });
    this.sendState();
    this.sendStats();
  }

  // ── Webview Message Handler ──

  private async handleWebviewMessage(msg: WebviewMessage): Promise<void> {
    switch (msg.type) {
      case 'prompt':
        await this.handlePrompt(msg.text, msg.images, msg.streaming);
        break;
      case 'abort':
        this.pi.abort();
        break;
      case 'revertEdit':
        await this.edits.revertEdit(msg.editId);
        break;
      case 'acceptEdit':
        this.edits.acceptEdit(msg.editId);
        break;
      case 'revertAllEdits':
        for (const rec of this.edits.getPendingEdits()) {
          await this.edits.revertEdit(rec.id);
        }
        break;
      case 'acceptAllEdits':
        for (const rec of this.edits.getPendingEdits()) {
          this.edits.acceptEdit(rec.id);
        }
        break;
      case 'showDiff':
        await this.handleShowDiff(msg.editId);
        break;
      case 'openFile': {
        try {
          const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(msg.path));
          await vscode.window.showTextDocument(doc, { preview: true });
        } catch { /* ignore */ }
        break;
      }
      case 'selectModel':
        await this.handleSelectModel();
        break;
      case 'setThinkingLevel':
        await this.pi.setThinkingLevel(msg.level);
        this.sendState();
        break;
      case 'newSession':
        await this.newSession();
        break;
      case 'reloadExtensions':
        vscode.window.showInformationMessage('Restart pi process to reload extensions: reload the VS Code window.');
        break;
      case 'extensionUiResponse':
        this.pi.sendExtensionUiResponse(msg.id, msg.value, msg.confirmed, msg.cancelled);
        break;
      case 'ready':
        this.sendState();
        this.sendCommands();
        this.sendStats();
        break;
      case 'runCommand':
        // Extension commands (e.g. /rtk, /caveman, /team-*) execute
        // immediately even while the agent is streaming — no chat bubble.
        this.pi.prompt(msg.command).catch(() => {});
        break;
      case 'searchFile':
        await this.handleSearchFile(msg.query);
        break;
      case 'selectFileToAttach':
        await this.handleSelectFileToAttach();
        break;
      case 'getSessions':
        this.handleGetSessions();
        break;
      case 'resumeSession':
        await this.handleResumeSession(msg.filePath);
        break;
    }
  }

  // ── Sessions ──

  private getSessionDir(): string {
    const wsFolder = vscode.workspace.workspaceFolders?.[0];
    if (!wsFolder) return '';
    // pi encodes cwd as --<path with separators replaced by dashes>--
    const encoded = wsFolder.uri.fsPath.replace(/^[/\\]/, '').replace(/[/\\:]/g, '-');
    return path.join(os.homedir(), '.pi', 'agent', 'sessions', `--${encoded}--`);
  }

  private handleGetSessions(): void {
    const sessionDir = this.getSessionDir();
    if (!sessionDir || !fs.existsSync(sessionDir)) {
      this.postMessage({ type: 'sessionsList', sessions: [] });
      return;
    }

    const files = fs.readdirSync(sessionDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => {
        const fullPath = path.join(sessionDir, f);
        const stat = fs.statSync(fullPath);
        return {
          id: f,
          title: this.getSessionTitle(fullPath),
          filePath: fullPath,
          date: stat.mtime.toLocaleString(),
          mtime: stat.mtime.getTime(),
        };
      })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 50);

    this.postMessage({ type: 'sessionsList', sessions: files });
  }

  private getSessionTitle(filePath: string): string {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      let name: string | undefined;
      for (const line of lines) {
        if (!line.trim()) continue;
        let obj: any;
        try { obj = JSON.parse(line); } catch { continue; }
        if (obj.type === 'session' && obj.name) name = obj.name;
        if (obj.type === 'message' && obj.message?.role === 'user') {
          const text = Array.isArray(obj.message.content)
            ? obj.message.content.map((c: any) => c.text || '').join('')
            : String(obj.message.content);
          const t = (name || text).trim();
          return t.slice(0, 60) + (t.length > 60 ? '…' : '');
        }
      }
      if (name) return name;
    } catch { /* ignore */ }
    return path.basename(filePath, '.jsonl');
  }

  private async handleResumeSession(filePath: string): Promise<void> {
    // Prefer in-process switch; fall back to restart if pi is not running
    let ok = false;
    if (this.pi.isRunning) {
      ok = await this.pi.switchSession(filePath).catch(() => false);
    }
    if (!ok) {
      this.pi.stop();
      this.pi.start(filePath);
    }
    this.edits.clear();
    // Load history through RPC (respects branches/compaction)
    const messages = await this.pi.getMessages().catch(() => []);
    this.postMessage({ type: 'loadHistory', messages });
    this.sendState();
    this.sendStats();
  }

  // ── Files ──

  private async handleSelectFileToAttach(): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: true,
      openLabel: 'Attach File',
    });

    if (uris && uris.length > 0) {
      for (const uri of uris) {
        this.postMessage({
          type: 'addFileAttachment',
          name: path.basename(uri.fsPath),
          path: uri.fsPath,
        });
      }
    }
  }

  /** Inline fuzzy file search — results rendered as a dropdown inside the webview */
  private async handleSearchFile(query: string): Promise<void> {
    const glob = query ? `**/*${query}*` : '**/*';
    const files = await vscode.workspace.findFiles(glob, '**/{node_modules,.git,out,dist}/**', 12);
    const results = files.map(uri => ({
      label: vscode.workspace.asRelativePath(uri),
      path: uri.fsPath,
    })).sort((a, b) => a.label.length - b.label.length);
    this.postMessage({ type: 'fileResults', query, results });
  }

  // ── Prompting ──

  private async handlePrompt(text: string, images?: { data: string; mime: string }[], streaming?: boolean): Promise<void> {
    const isCommand = text.startsWith('/');
    this.postMessage({ type: 'userMessage', text, queued: !!streaming && !isCommand });

    if (!streaming) {
      this.setStreaming(true);
      await this.edits.snapshotWorkspace();
    }

    const behavior = streaming && !isCommand ? 'steer' : undefined;
    const result = await this.pi.prompt(text, images, behavior).catch((err) => ({ success: false, error: String(err) }));
    if (!result.success) {
      this.postMessage({ type: 'error', message: result.error || 'Failed to send prompt to pi' });
      if (!streaming) this.setStreaming(false);
    }
  }

  private async handleShowDiff(editId: string): Promise<void> {
    const record = this.edits.getEdit(editId);
    if (!record) return;

    const uri = vscode.Uri.file(record.filePath);
    const originalUri = uri.with({ scheme: 'pi-original', query: editId });
    this.diffContentProvider.set(originalUri, record.originalContent);

    await vscode.commands.executeCommand(
      'vscode.diff',
      originalUri,
      uri,
      `${path.basename(record.filePath)} (Pi changes)`,
    );
  }

  private async handleSelectModel(): Promise<void> {
    const models = await this.pi.getModels();
    if (models.length === 0) {
      vscode.window.showErrorMessage('No models available. Check pi configuration.');
      return;
    }

    const items = models.map((m: any) => ({
      label: m.name || m.id,
      description: `${m.provider}/${m.id}`,
      detail: [
        m.reasoning ? '$(sparkle) reasoning' : undefined,
        m.contextWindow ? `${Math.round(m.contextWindow / 1000)}k context` : undefined,
        m.cost ? `$${m.cost.input}/${m.cost.output} per MTok` : undefined,
      ].filter(Boolean).join('  ·  '),
      provider: m.provider,
      modelId: m.id,
    }));

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select model for pi',
      matchOnDescription: true,
    });

    if (picked) {
      await this.pi.setModel(picked.provider, picked.modelId);
      this.sendState();
    }
  }

  // ── pi Event Handler ──

  private onPiEvent(event: RpcEvent): void {
    switch (event.type) {
      case 'agent_start':
        this.setStreaming(true);
        this.postMessage({ type: 'agentStart' });
        this.edits.snapshotWorkspace().catch(() => {});
        break;

      case 'agent_end':
        this.setStreaming(false);
        this.postMessage({ type: 'agentEnd' });
        this.sendStats();
        break;

      case 'message_update':
        this.handleMessageUpdate(event);
        break;

      case 'tool_execution_start':
        this.handleToolStart(event);
        break;

      case 'tool_execution_update': {
        const partial = (event as any).partialResult;
        const outputText = (partial?.content || [])
          .map((c: any) => c.text || '')
          .join('');
        if (outputText) {
          this.postMessage({ type: 'toolUpdate', toolCallId: (event as any).toolCallId, output: outputText });
        }
        break;
      }

      case 'tool_execution_end':
        this.handleToolEnd(event);
        break;

      case 'queue_update':
        this.postMessage({ type: 'queueUpdate', steering: event.steering || [], followUp: event.followUp || [] });
        break;

      case 'auto_retry_start':
        this.postMessage({
          type: 'retryStatus',
          text: `Transient error — retrying (${event.attempt}/${event.maxAttempts}) in ${Math.round(event.delayMs / 1000)}s…`,
        });
        break;

      case 'auto_retry_end':
        this.postMessage({ type: 'retryStatus', text: null });
        if (!event.success && event.finalError) {
          this.postMessage({ type: 'error', message: event.finalError });
        }
        break;

      case 'compaction_start':
        this.postMessage({ type: 'compactionStatus', text: 'Compacting conversation context…' });
        break;

      case 'compaction_end':
        this.postMessage({ type: 'compactionStatus', text: null });
        this.sendStats();
        break;

      case 'extension_ui_request':
        this.handleExtensionUi(event as ExtensionUiRequest);
        break;

      case 'extension_error':
        this.postMessage({ type: 'error', message: event.error || 'Extension error' });
        break;
    }
  }

  private handleMessageUpdate(event: any): void {
    const msgEvent = event.assistantMessageEvent;
    if (!msgEvent) return;

    switch (msgEvent.type) {
      case 'text_delta':
        this.postMessage({ type: 'textDelta', messageId: 'current', delta: msgEvent.delta });
        break;
      case 'thinking_delta':
        this.postMessage({
          type: 'thinkingDelta',
          messageId: 'current',
          blockIndex: msgEvent.contentIndex ?? 0,
          delta: msgEvent.delta,
        });
        break;
      case 'thinking_end':
        this.postMessage({
          type: 'thinkingEnd',
          messageId: 'current',
          blockIndex: msgEvent.contentIndex ?? 0,
          content: msgEvent.thinking,
        });
        break;
    }
  }

  private handleToolStart(event: any): void {
    this.postMessage({
      type: 'toolStart',
      messageId: 'current',
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      args: JSON.stringify(event.args ?? {}, null, 2),
    });
  }

  private async handleToolEnd(event: any): Promise<void> {
    const diff = event.result?.details?.diff || event.result?.details?.patch;

    // If this was an edit-like tool, record it for accept/revert
    const editTools = new Set(['edit', 'write', 'multi-edit']);
    if (editTools.has(event.toolName) && !event.isError) {
      const filePath = event.args?.path || event.args?.file_path;
      if (filePath) {
        const absPath = path.isAbsolute(filePath)
          ? filePath
          : path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', filePath);
        try {
          const uri = vscode.Uri.file(absPath);
          const newContent = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
          await this.edits.recordEdit(absPath, newContent, diff || '');
        } catch (err) {
          console.warn('[pi] could not record edit:', err);
        }
      }
    }

    let outputText = '';
    if (event.result?.content) {
      outputText = event.result.content
        .map((c: any) => c.text || '')
        .join('');
    }

    this.postMessage({
      type: 'toolEnd',
      messageId: 'current',
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      isError: event.isError,
      diff,
      output: outputText.slice(0, 20000),
    });
  }

  private handleExtensionUi(request: ExtensionUiRequest): void {
    // Notifications map cleanly onto native VS Code notifications
    if (request.method === 'notify') {
      const fn = request.notifyType === 'error'
        ? vscode.window.showErrorMessage
        : request.notifyType === 'warning'
          ? vscode.window.showWarningMessage
          : vscode.window.showInformationMessage;
      fn(`Pi: ${request.message}`);
      return;
    }
    if ((request as any).method === 'set_editor_text') {
      this.postMessage({ type: 'setInputText', text: (request as any).text || '' });
      return;
    }
    if (request.method === 'setTitle') return; // no terminal title in a webview

    this.postMessage({
      type: 'extensionUiRequest',
      id: request.id,
      method: request.method,
      data: request,
    });
  }

  private onEditChanged(record: EditRecord): void {
    if (record.status === 'pending') {
      this.postMessage({
        type: 'editRecorded',
        filePath: record.filePath,
        editId: record.id,
        diff: record.diff,
      });
    } else if (record.status === 'reverted') {
      this.postMessage({ type: 'editReverted', filePath: record.filePath, editId: record.id });
    } else if (record.status === 'accepted') {
      this.postMessage({ type: 'editAccepted', filePath: record.filePath, editId: record.id });
    }
    this.postMessage({
      type: 'editsSummary',
      pending: this.edits.getPendingEdits().map(e => ({ editId: e.id, filePath: e.filePath })),
    });
  }

  // ── State ──

  private setStreaming(streaming: boolean): void {
    this.isStreaming = streaming;
    this.sendState();
  }

  private async sendState(): Promise<void> {
    const state = await this.pi.getState().catch(() => null);
    this.postMessage({
      type: 'init',
      model: state?.model ? `${state.model.provider}/${state.model.id}` : 'unknown',
      modelReasoning: !!state?.model?.reasoning,
      thinkingLevel: state?.thinkingLevel || 'off',
      state: this.isStreaming || state?.isStreaming ? 'streaming' : 'idle',
      sessionName: state?.sessionName,
    });
  }

  private async sendCommands(): Promise<void> {
    const commands = await this.pi.getCommands().catch(() => []);
    this.postMessage({ type: 'commands', commands });
  }

  private async sendStats(): Promise<void> {
    const stats = await this.pi.getSessionStats().catch(() => null);
    this.postMessage({ type: 'stats', stats });
  }

  private postMessage(msg: WebviewOutMessage): void {
    this._view?.webview.postMessage(msg);
  }

  // ── HTML ──

  private getHtml(webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'style.css'),
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'main.js'),
    );
    const vendorUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'vendor.js'),
    );

    const nonce = getNonce();

    return /* html */`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data: https:; font-src ${webview.cspSource};">
  <link rel="stylesheet" href="${styleUri}">
  <title>Pi Chat</title>
</head>
<body>
  <div id="app">
    <div id="sessions-panel" class="hidden">
      <div id="sessions-panel-header">
        <span>Chat history</span>
        <button id="btn-close-sessions" title="Close" aria-label="Close">✕</button>
      </div>
      <div id="sessions-list"></div>
    </div>

    <div id="team-monitor" class="hidden">
      <div id="team-monitor-header">
        <span>Agent team</span>
        <span id="team-active-count" class="badge">0 active</span>
        <span class="team-actions">
          <button class="team-action" data-cmd="/team-init" title="Rewrite/initialize the team for this project">Init</button>
          <button class="team-action" data-cmd="/team-result" title="Show the latest team result">Result</button>
          <button class="team-action danger" data-cmd="/team-stop" title="Stop all workers">Stop</button>
          <button id="btn-close-team" title="Close panel">✕</button>
        </span>
      </div>
      <div id="team-grid"></div>
    </div>

    <div id="messages" aria-live="polite"></div>

    <div id="dialog-overlay" class="hidden"></div>

    <div id="bottom">
      <div id="status-bar" class="hidden"></div>
      <div id="widgets-container" class="hidden"></div>
      <div id="queue-bar" class="hidden"></div>
      <div id="changes-bar" class="hidden"></div>

      <div id="input-area">
        <div id="autocomplete" class="hidden"></div>
        <div id="input-container">
          <div id="attachment-list"></div>
          <textarea id="input" rows="1" placeholder="Ask Pi — @ for files, / for commands"></textarea>
          <div id="input-toolbar">
            <div class="left-actions">
              <button id="btn-attach" class="icon-button" title="Attach file">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M12.5 4.5v6a4.5 4.5 0 0 1-9 0v-7a3 3 0 0 1 6 0v7a1.5 1.5 0 0 1-3 0v-6"/></svg>
              </button>
              <button id="btn-model" class="pill" title="Change model"><span id="model-name">…</span><svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 6l4 4 4-4"/></svg></button>
              <button id="btn-thinking" class="pill hidden" title="Thinking level"><svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a5 5 0 0 0-3 9v2.5A1.5 1.5 0 0 0 6.5 14h3a1.5 1.5 0 0 0 1.5-1.5V10a5 5 0 0 0-3-9zM6.5 15.3h3v.2a.5.5 0 0 1-.5.5H7a.5.5 0 0 1-.5-.5v-.2z"/></svg><span id="thinking-level">off</span></button>
            </div>
            <div class="right-actions">
              <button id="btn-send" class="icon-button send" title="Send (Enter)" disabled aria-label="Send">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1.72 1.05a.5.5 0 0 0-.71.55l1.4 4.85a.5.5 0 0 0 .4.35l5.69.96c.26.05.26.43 0 .48l-5.69.96a.5.5 0 0 0-.4.35l-1.4 4.85a.5.5 0 0 0 .71.55l13.32-6.69a.5.5 0 0 0 0-.9L1.72 1.05z"/></svg>
              </button>
              <button id="btn-abort" class="icon-button stop hidden" title="Stop (Esc)" aria-label="Stop">
                <svg width="14" height="14" viewBox="0 0 16 16"><rect x="3.5" y="3.5" width="9" height="9" rx="1.5" fill="currentColor"/></svg>
              </button>
            </div>
          </div>
        </div>
        <div id="footer-bar">
          <div id="footer-left">
            <button id="btn-history" class="footer-link" title="Chat history">History</button>
            <button id="btn-new" class="footer-link" title="New chat">New chat</button>
          </div>
          <div id="footer-stats" title="Session usage"></div>
        </div>
      </div>
    </div>
  </div>

  <script nonce="${nonce}" src="${vendorUri}"></script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 64; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}

/** Serves original file contents for the pi diff view, keyed by URI. */
class PiOriginalContentProvider implements vscode.TextDocumentContentProvider {
  private contents = new Map<string, string>();

  set(uri: vscode.Uri, content: string): void {
    this.contents.set(uri.toString(), content);
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? '';
  }
}
