import * as vscode from 'vscode';
import * as path from 'path';
import type { EditRecord } from './types';

/**
 * Manages file snapshots and edit tracking for accept/revert.
 * 
 * Flow:
 * 1. On agent_start: snapshot all open workspace files
 * 2. On edit tool result: record the change, store diff
 * 3. User can revert → restore from snapshot
 * 4. User can accept → mark as accepted
 */
export class EditManager {
  private snapshots = new Map<string, string>();
  private edits = new Map<string, EditRecord>();
  private onDidChangeEdits: vscode.EventEmitter<EditRecord> = new vscode.EventEmitter();

  readonly onDidChange: vscode.Event<EditRecord> = this.onDidChangeEdits.event;

  constructor() {}

  /** Take snapshots of all dirty/visible documents before agent work */
  async snapshotWorkspace(): Promise<void> {
    this.snapshots.clear();

    // Snapshot all open text documents
    for (const doc of vscode.workspace.textDocuments) {
      if (doc.uri.scheme !== 'file') continue;
      if (doc.isUntitled) continue;
      try {
        const content = doc.getText();
        this.snapshots.set(doc.uri.fsPath, content);
      } catch { /* skip */ }
    }

    // Also snapshot files that are in workspace folders but not open
    // (lazy — only snapshot on first edit)
  }

  /** Lazily snapshot a file if not already tracked */
  private async ensureSnapshot(filePath: string): Promise<string | null> {
    if (this.snapshots.has(filePath)) {
      return this.snapshots.get(filePath)!;
    }
    try {
      const uri = vscode.Uri.file(filePath);
      const content = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
      this.snapshots.set(filePath, content);
      return content;
    } catch {
      return null;
    }
  }

  /** Record an edit from tool_execution_end */
  async recordEdit(
    filePath: string,
    newContent: string,
    diff: string,
  ): Promise<EditRecord> {
    const originalContent = await this.ensureSnapshot(filePath);
    if (originalContent === null) {
      throw new Error(`Cannot snapshot file: ${filePath}`);
    }

    const record: EditRecord = {
      id: `edit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      filePath,
      originalContent,
      newContent,
      diff,
      timestamp: Date.now(),
      status: 'pending',
    };

    this.edits.set(record.id, record);
    this.onDidChangeEdits.fire(record);
    return record;
  }

  /** Revert a file to its pre-agent snapshot */
  async revertEdit(editId: string): Promise<boolean> {
    const record = this.edits.get(editId);
    if (!record || record.status !== 'pending') return false;

    try {
      const uri = vscode.Uri.file(record.filePath);
      await vscode.workspace.fs.writeFile(
        uri,
        Buffer.from(record.originalContent, 'utf8'),
      );
      record.status = 'reverted';
      this.onDidChangeEdits.fire(record);
      return true;
    } catch (err) {
      console.error(`[pi] revert failed for ${record.filePath}:`, err);
      return false;
    }
  }

  /** Mark edit as accepted (no-op, edit already applied) */
  acceptEdit(editId: string): void {
    const record = this.edits.get(editId);
    if (!record || record.status !== 'pending') return;
    record.status = 'accepted';
    this.onDidChangeEdits.fire(record);
  }

  /** Get a diff for a recorded edit */
  getEdit(editId: string): EditRecord | undefined {
    return this.edits.get(editId);
  }

  /** Get all pending edits */
  getPendingEdits(): EditRecord[] {
    return Array.from(this.edits.values()).filter(e => e.status === 'pending');
  }

  /** Get all edits */
  getAllEdits(): EditRecord[] {
    return Array.from(this.edits.values());
  }

  /** Clear state (new session) */
  clear(): void {
    this.snapshots.clear();
    this.edits.clear();
  }

  /**
   * Compute a simple unified diff between two strings.
   * Used when pi's edit result doesn't include details.diff.
   */
  static computeDiff(original: string, modified: string): string {
    const origLines = original.split('\n');
    const modLines = modified.split('\n');

    // Simple LCS-based diff for small changes
    // For real use, we'd use diff-match-patch or similar
    // This is a minimal implementation
    const lines: string[] = [];
    let i = 0, j = 0;

    while (i < origLines.length || j < modLines.length) {
      if (i < origLines.length && j < modLines.length && origLines[i] === modLines[j]) {
        lines.push(` ${origLines[i]}`);
        i++; j++;
      } else {
        if (i < origLines.length) {
          lines.push(`-${origLines[i]}`);
          i++;
        }
        if (j < modLines.length) {
          lines.push(`+${modLines[j]}`);
          j++;
        }
      }
    }

    return lines.join('\n');
  }
}
