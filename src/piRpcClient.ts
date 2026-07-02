import { spawn, ChildProcess } from 'child_process';
import { StringDecoder } from 'string_decoder';
import { EventEmitter } from 'events';
import * as vscode from 'vscode';
import type { RpcCommand, RpcResponse, RpcEvent, ExtensionUiRequest, PiCommandInfo, SessionStats } from './types';

/**
 * Manages a pi --mode rpc child process.
 * Sends JSONL commands to stdin, parses JSONL events from stdout.
 */
export class PiRpcClient extends EventEmitter {
  private proc: ChildProcess | null = null;
  private buffer = '';
  private decoder = new StringDecoder('utf8');
  private requestId = 0;
  private pendingRequests = new Map<string, { resolve: (v: RpcResponse) => void; reject: (e: Error) => void }>();
  private _isRunning = false;
  private restartTimeout: ReturnType<typeof setTimeout> | null = null;

  get isRunning() { return this._isRunning; }

  constructor(
    private readonly piPath: string,
    private readonly extraArgs: string[],
  ) {
    super();
  }

  /** Spawn pi --mode rpc. Sessions persist by default so they can be resumed. */
  start(sessionPath?: string): void {
    if (this.proc) return;

    const args = ['--mode', 'rpc'];
    if (sessionPath) {
      args.push('--session', sessionPath);
    }
    args.push(...this.extraArgs);

    this.proc = spawn(this.piPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      env: { ...process.env },
    });

    this._isRunning = true;

    // stdout: parse JSONL events
    this.proc.stdout!.on('data', (chunk: Buffer) => {
      this.buffer += typeof chunk === 'string' ? chunk : this.decoder.write(chunk);
      this.processLines();
    });

    // stderr: log for debugging
    this.proc.stderr!.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) console.warn('[pi stderr]', text);
    });

    this.proc.on('exit', (code, signal) => {
      console.warn(`[pi] exited code=${code} signal=${signal}`);
      this._isRunning = false;
      this.proc = null;
      this.emit('exit', code, signal);
      // Reject pending requests
      for (const [id, { reject }] of this.pendingRequests) {
        reject(new Error(`pi process exited (code=${code})`));
      }
      this.pendingRequests.clear();
    });

    this.proc.on('error', (err) => {
      console.error('[pi] spawn error:', err);
      this._isRunning = false;
      this.emit('error', err);
    });
  }

  /** Stop pi process */
  stop(): void {
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    if (this.proc && !this.proc.killed) {
      this.proc.kill('SIGTERM');
      setTimeout(() => {
        if (this.proc && !this.proc.killed) this.proc.kill('SIGKILL');
      }, 3000);
    }
    this._isRunning = false;
    this.proc = null;
  }

  /** Send a command and await response */
  async send(command: Omit<RpcCommand, 'id'> & { id?: string }): Promise<RpcResponse> {
    if (!this.proc || !this._isRunning) {
      return { type: 'response', command: command.type, success: false, error: 'pi not running' };
    }

    const id = command.id || `req-${++this.requestId}`;
    const cmd = { ...command, id } as RpcCommand;
    const line = JSON.stringify(cmd) + '\n';

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`RPC command ${cmd.type} timed out`));
      }, 60000);

      this.pendingRequests.set(id, {
        resolve: (resp) => { clearTimeout(timeout); resolve(resp); },
        reject: (err) => { clearTimeout(timeout); reject(err); },
      });

      try {
        this.proc!.stdin!.write(line);
      } catch (err) {
        this.pendingRequests.delete(id);
        clearTimeout(timeout);
        reject(err);
      }
    });
  }

  /** Send prompt (fire-and-forget, response = accepted).
   *  If the agent is streaming, pass streamingBehavior to queue the message. */
  async prompt(
    message: string,
    images?: { data: string; mime: string }[],
    streamingBehavior?: 'steer' | 'followUp',
  ): Promise<{ success: boolean; error?: string }> {
    const cmd: any = { type: 'prompt', message };
    if (streamingBehavior) cmd.streamingBehavior = streamingBehavior;
    if (images && images.length > 0) {
      cmd.images = images.map(img => ({
        type: 'image',
        data: img.data,
        mimeType: img.mime,
      }));
    }
    const resp = await this.send(cmd);
    return { success: resp.success, error: resp.error };
  }

  /** Queue a steering message while the agent is running */
  async steer(message: string, images?: { data: string; mime: string }[]): Promise<boolean> {
    const cmd: any = { type: 'steer', message };
    if (images && images.length > 0) {
      cmd.images = images.map(img => ({ type: 'image', data: img.data, mimeType: img.mime }));
    }
    const resp = await this.send(cmd);
    return resp.success;
  }

  /** Abort current agent execution */
  abort(): void {
    this.send({ type: 'abort' }).catch(() => {});
  }

  /** Get available models */
  async getModels(): Promise<any[]> {
    const resp = await this.send({ type: 'get_available_models' });
    if (resp.success && resp.data?.models) return resp.data.models;
    return [];
  }

  /** Get current state */
  async getState(): Promise<any> {
    const resp = await this.send({ type: 'get_state' });
    if (resp.success && resp.data) return resp.data;
    return null;
  }

  /** Set model */
  async setModel(provider: string, modelId: string): Promise<boolean> {
    const resp = await this.send({ type: 'set_model', provider, modelId });
    return resp.success;
  }

  /** Set thinking level */
  async setThinkingLevel(level: string): Promise<boolean> {
    const resp = await this.send({ type: 'set_thinking_level', level: level as any });
    return resp.success;
  }

  /** New session */
  async newSession(): Promise<boolean> {
    const resp = await this.send({ type: 'new_session' });
    return resp.success;
  }

  /** Switch to another session file (no process restart needed) */
  async switchSession(sessionPath: string): Promise<boolean> {
    const resp = await this.send({ type: 'switch_session', sessionPath });
    return resp.success;
  }

  /** Get all messages in the active conversation */
  async getMessages(): Promise<any[]> {
    const resp = await this.send({ type: 'get_messages' });
    if (resp.success && resp.data?.messages) return resp.data.messages;
    return [];
  }

  /** Get available commands (extensions, prompt templates, skills) */
  async getCommands(): Promise<PiCommandInfo[]> {
    const resp = await this.send({ type: 'get_commands' });
    if (resp.success && resp.data?.commands) return resp.data.commands;
    return [];
  }

  /** Get token usage / cost / context stats */
  async getSessionStats(): Promise<SessionStats | null> {
    const resp = await this.send({ type: 'get_session_stats' });
    if (resp.success && resp.data) return resp.data as SessionStats;
    return null;
  }

  /** Send extension UI response */
  sendExtensionUiResponse(id: string, value?: string, confirmed?: boolean, cancelled?: boolean): void {
    if (!this.proc || !this._isRunning) return;
    const resp: any = { type: 'extension_ui_response', id };
    if (cancelled) resp.cancelled = true;
    else if (confirmed !== undefined) resp.confirmed = confirmed;
    else if (value !== undefined) resp.value = value;
    this.proc.stdin!.write(JSON.stringify(resp) + '\n');
  }

  // ── Private ──

  private processLines(): void {
    while (true) {
      const nlIdx = this.buffer.indexOf('\n');
      if (nlIdx === -1) break;
      let line = this.buffer.slice(0, nlIdx);
      this.buffer = this.buffer.slice(nlIdx + 1);
      // Strip trailing \r
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (!line) continue;
      this.parseLine(line);
    }
  }

  private parseLine(line: string): void {
    try {
      const msg = JSON.parse(line);

      // Response to a command
      if (msg.type === 'response') {
        const pending = this.pendingRequests.get(msg.id);
        if (pending) {
          this.pendingRequests.delete(msg.id);
          pending.resolve(msg as RpcResponse);
        }
        return;
      }

      // Event
      this.emit('event', msg as RpcEvent);

      // Also emit typed events for convenience
      this.emit(msg.type, msg);
    } catch (err) {
      console.warn('[pi] failed to parse line:', line.slice(0, 200), err);
    }
  }
}
