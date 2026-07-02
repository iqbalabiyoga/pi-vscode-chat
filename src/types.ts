import * as vscode from 'vscode';

// ── RPC Message Types ──

export type RpcCommand = Record<string, any> & { type: string; id?: string };

export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export interface RpcImage {
  type: 'image';
  data: string;
  mimeType: string;
}

export interface RpcResponse {
  type: 'response';
  command: string;
  success: boolean;
  error?: string;
  data?: any;
  id?: string;
}

// ── RPC Events (from pi stdout) ──

export type RpcEvent =
  | AgentStartEvent
  | AgentEndEvent
  | TurnStartEvent
  | TurnEndEvent
  | MessageStartEvent
  | MessageUpdateEvent
  | MessageEndEvent
  | ToolExecStartEvent
  | ToolExecUpdateEvent
  | ToolExecEndEvent
  | QueueUpdateEvent
  | CompactionStartEvent
  | CompactionEndEvent
  | AutoRetryStartEvent
  | AutoRetryEndEvent
  | ExtensionUiRequest
  | ExtensionErrorEvent;

export interface AutoRetryStartEvent {
  type: 'auto_retry_start';
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  errorMessage?: string;
}
export interface AutoRetryEndEvent {
  type: 'auto_retry_end';
  success: boolean;
  attempt: number;
  finalError?: string;
}

// ── pi command metadata (get_commands) ──

export interface PiCommandInfo {
  name: string;
  description?: string;
  source: 'extension' | 'prompt' | 'skill';
  location?: 'user' | 'project' | 'path';
  path?: string;
}

// ── Session stats (get_session_stats) ──

export interface SessionStats {
  sessionFile?: string;
  sessionId?: string;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  totalMessages: number;
  tokens?: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
  cost?: number;
  contextUsage?: { tokens: number | null; contextWindow: number; percent: number | null };
}

export interface AgentStartEvent { type: 'agent_start' }
export interface AgentEndEvent { type: 'agent_end'; messages: any[] }
export interface TurnStartEvent { type: 'turn_start'; turnIndex?: number; timestamp?: number }
export interface TurnEndEvent { type: 'turn_end'; message?: any; toolResults?: any[]; turnIndex?: number }
export interface MessageStartEvent { type: 'message_start'; message: any }
export interface MessageUpdateEvent {
  type: 'message_update';
  message: any;
  assistantMessageEvent: AssistantMessageEvent;
}
export interface MessageEndEvent { type: 'message_end'; message: any }
export interface ToolExecStartEvent {
  type: 'tool_execution_start';
  toolCallId: string;
  toolName: string;
  args: Record<string, any>;
}
export interface ToolExecUpdateEvent {
  type: 'tool_execution_update';
  toolCallId: string;
  toolName: string;
  args: Record<string, any>;
  partialResult: any;
}
export interface ToolExecEndEvent {
  type: 'tool_execution_end';
  toolCallId: string;
  toolName: string;
  result?: { content?: any[]; details?: any };
  isError: boolean;
}
export interface ExtensionErrorEvent { type: 'extension_error'; extensionPath?: string; event?: string; error?: string }

export interface QueueUpdateEvent {
  type: 'queue_update';
  steering: string[];
  followUp: string[];
}
export interface CompactionStartEvent { type: 'compaction_start'; reason: string }
export interface CompactionEndEvent {
  type: 'compaction_end';
  reason: string;
  result?: any;
  aborted: boolean;
}

export type AssistantMessageEvent =
  | { type: 'start' }
  | { type: 'text_start'; contentIndex: number }
  | { type: 'text_delta'; contentIndex: number; delta: string }
  | { type: 'text_end'; contentIndex: number; content: string }
  | { type: 'thinking_start'; contentIndex: number }
  | { type: 'thinking_delta'; contentIndex: number; delta: string }
  | { type: 'thinking_end'; contentIndex: number; thinking: string }
  | { type: 'toolcall_start'; contentIndex: number }
  | { type: 'toolcall_delta'; contentIndex: number; delta: string }
  | { type: 'toolcall_end'; contentIndex: number; toolCall: any }
  | { type: 'done'; reason: string }
  | { type: 'error'; reason: string };

// ── Extension UI Request (pi → extension) ──

export type ExtensionUiRequest =
  | { type: 'extension_ui_request'; id: string; method: 'select'; title: string; options: string[]; timeout?: number }
  | { type: 'extension_ui_request'; id: string; method: 'confirm'; title: string; message: string; timeout?: number }
  | { type: 'extension_ui_request'; id: string; method: 'input'; title: string; placeholder?: string }
  | { type: 'extension_ui_request'; id: string; method: 'editor'; title: string; prefill?: string }
  | { type: 'extension_ui_request'; id: string; method: 'notify'; message: string; notifyType?: 'info' | 'warning' | 'error' }
  | { type: 'extension_ui_request'; id: string; method: 'setStatus'; statusKey: string; statusText?: string }
  | { type: 'extension_ui_request'; id: string; method: 'setWidget'; widgetKey: string; widgetLines?: string[]; widgetPlacement?: string }
  | { type: 'extension_ui_request'; id: string; method: 'setTitle'; title: string };

// ── Webview Messages (extension ↔ webview) ──

export type WebviewMessage =
  | { type: 'prompt'; text: string; images?: { data: string; mime: string }[]; streaming?: boolean }
  | { type: 'abort' }
  | { type: 'revertEdit'; editId: string }
  | { type: 'acceptEdit'; editId: string }
  | { type: 'revertAllEdits' }
  | { type: 'acceptAllEdits' }
  | { type: 'showDiff'; editId: string }
  | { type: 'openFile'; path: string }
  | { type: 'selectModel' }
  | { type: 'setThinkingLevel'; level: string }
  | { type: 'newSession' }
  | { type: 'reloadExtensions' }
  | { type: 'ready' }
  | { type: 'runCommand'; command: string }
  | { type: 'searchFile'; query: string }
  | { type: 'selectFileToAttach' }
  | { type: 'getSessions' }
  | { type: 'resumeSession'; filePath: string }
  | { type: 'extensionUiResponse'; id: string; value?: string; confirmed?: boolean; cancelled?: boolean };

export type WebviewOutMessage =
  | { type: 'init'; model: string; modelReasoning: boolean; thinkingLevel: string; state: 'idle' | 'streaming'; sessionName?: string }
  | { type: 'commands'; commands: PiCommandInfo[] }
  | { type: 'stats'; stats: SessionStats | null }
  | { type: 'addFileAttachment'; name: string; path: string }
  | { type: 'loadHistory'; messages: any[] }
  | { type: 'sessionsList'; sessions: any[] }
  | { type: 'agentStart' }
  | { type: 'agentEnd' }
  | { type: 'textDelta'; messageId: string; delta: string }
  | { type: 'thinkingDelta'; messageId: string; blockIndex: number; delta: string }
  | { type: 'thinkingEnd'; messageId: string; blockIndex: number; content: string }
  | { type: 'toolStart'; messageId: string; toolCallId: string; toolName: string; args: string }
  | { type: 'toolUpdate'; toolCallId: string; output: string }
  | { type: 'toolEnd'; messageId: string; toolCallId: string; toolName: string; isError: boolean; diff?: string; output?: string }
  | { type: 'userMessage'; text: string; files?: string[]; queued?: boolean }
  | { type: 'fileResults'; query: string; results: { label: string; path: string }[] }
  | { type: 'setInputText'; text: string; append?: boolean }
  | { type: 'editRecorded'; filePath: string; editId: string; diff: string }
  | { type: 'editReverted'; filePath: string; editId: string }
  | { type: 'editAccepted'; filePath: string; editId: string }
  | { type: 'editsSummary'; pending: { editId: string; filePath: string }[] }
  | { type: 'queueUpdate'; steering: string[]; followUp: string[] }
  | { type: 'retryStatus'; text: string | null }
  | { type: 'compactionStatus'; text: string | null }
  | { type: 'sessionCleared' }
  | { type: 'extensionUiRequest'; id: string; method: string; data: any }
  | { type: 'stateChange'; state: 'idle' | 'streaming' }
  | { type: 'error'; message: string };

// ── Edit Tracking ──

export interface EditRecord {
  id: string;
  filePath: string;
  originalContent: string;
  newContent: string;
  diff: string;
  timestamp: number;
  status: 'pending' | 'accepted' | 'reverted';
}
