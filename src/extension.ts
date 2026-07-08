import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as cp from 'child_process';
import { PiRpcClient } from './piRpcClient';
import { ChatSidebarProvider } from './chatSidebarProvider';
import { EditManager } from './editManager';

let piClient: PiRpcClient | undefined;
let editManager: EditManager | undefined;
let sidebarProvider: ChatSidebarProvider | undefined;

export async function activate(context: vscode.ExtensionContext) {
  console.log('[pi-chat] activating...');

  // ── Read config ──
  const config = vscode.workspace.getConfiguration('piChat');
  const piPath: string = config.get('piPath') || 'pi';
  const extraArgs: string[] = config.get('adapterArgs') || [];
  const extraEnv: Record<string, string> = config.get('extraEnv') || {};

  // ── Init services ──
  editManager = new EditManager();
  piClient = new PiRpcClient(piPath, extraArgs);
  piClient.setExtraEnv(extraEnv);

  // ── Register sidebar ──
  sidebarProvider = new ChatSidebarProvider(context.extensionUri, piClient, editManager);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('piChat.sidebar', sidebarProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  // ── Register commands ──
  context.subscriptions.push(
    // Dependency check — standalone, no pi process needed
    vscode.commands.registerCommand('piChat.checkDependencies', () => {
      runDependencyCheck(context);
    }),

    // One-click install
    vscode.commands.registerCommand('piChat.installDependencies', () => {
      runInstall(context);
    }),

    vscode.commands.registerCommand('piChat.newSession', async () => {
      await sidebarProvider?.newSession();
    }),

    vscode.commands.registerCommand('piChat.selectModel', async () => {
      const models = await piClient?.getModels() || [];
      if (models.length === 0) {
        vscode.window.showErrorMessage('No models available');
        return;
      }
      const items = models.map((m: any) => ({
        label: m.name || m.id,
        description: `${m.provider}/${m.id}`,
        provider: m.provider,
        modelId: m.id,
      }));
      const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select model' });
      if (picked) {
        await piClient?.setModel(picked.provider, picked.modelId);
        vscode.window.showInformationMessage(`Pi: Switched to ${picked.label}`);
      }
    }),

    vscode.commands.registerCommand('piChat.acceptEdit', (editId?: string) => {
      if (editId) editManager?.acceptEdit(editId);
    }),

    vscode.commands.registerCommand('piChat.rejectEdit', async (editId?: string) => {
      if (editId) await editManager?.revertEdit(editId);
    }),

    vscode.commands.registerCommand('piChat.abort', () => {
      piClient?.abort();
    }),

    // ── Send selected text straight into the chat input ──
    vscode.commands.registerTextEditorCommand('piChat.sendSelection', async (editor) => {
      const selection = editor.selection;
      const text = editor.document.getText(selection);
      if (!text) {
        vscode.window.showInformationMessage('No text selected');
        return;
      }
      const filePath = vscode.workspace.asRelativePath(editor.document.uri);
      const startLine = selection.start.line + 1;
      const endLine = selection.end.line + 1;
      const prompt = `\`${filePath}:${startLine}-${endLine}\`\n\`\`\`${editor.document.languageId}\n${text}\n\`\`\`\n`;
      await vscode.commands.executeCommand('workbench.view.extension.pi-chat');
      // Give the webview a moment to resolve if it was closed
      setTimeout(() => sidebarProvider?.insertPrompt(prompt), 150);
    }),
  );

  // ── Restart pi when config changes ──
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration('piChat.piPath') || e.affectsConfiguration('piChat.adapterArgs')) {
        const choice = await vscode.window.showInformationMessage(
          'Pi Chat settings changed. Reload window to apply?', 'Reload',
        );
        if (choice === 'Reload') {
          vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
      }
    }),
  );

  // ── Check pi binary before starting ──
  const piOk = checkPiBinary(piPath);
  if (!piOk) {
    const action = await vscode.window.showWarningMessage(
      'Pi Chat: pi binary not found. Install dependencies to get started.',
      'Install Dependencies', 'Check Dependencies',
    );
    if (action === 'Install Dependencies') {
      runInstall(context);
    } else if (action === 'Check Dependencies') {
      runDependencyCheck(context);
    }
  } else {
    // ── Start pi process ──
    try {
      piClient.start();
      console.log('[pi-chat] pi process started');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Pi Chat: Failed to start pi process: ${msg}`);
    }
  }

  // ── Status bar ──
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.text = '$(comment-discussion) Pi';
  statusBar.tooltip = 'Open Pi Chat';
  statusBar.command = 'workbench.view.extension.pi-chat';
  statusBar.show();
  context.subscriptions.push(statusBar);
}

export function deactivate() {
  console.log('[pi-chat] deactivating...');
  piClient?.stop();
}

// ── Dependency check helpers ──

function checkPiBinary(piPath: string): boolean {
  if (path.isAbsolute(piPath)) {
    return fs.existsSync(piPath);
  }
  // Search PATH
  const paths = (process.env.PATH || '').split(path.delimiter);
  for (const dir of paths) {
    const full = path.join(dir, piPath);
    if (fs.existsSync(full)) return true;
    // Windows .exe
    if (process.platform === 'win32' && fs.existsSync(full + '.exe')) return true;
  }
  return false;
}

interface DepCheckItem {
  name: string;
  description: string;
  ok: boolean;
  action?: string;
}

function runDependencyCheck(context: vscode.ExtensionContext): void {
  const items: DepCheckItem[] = [];
  const config = vscode.workspace.getConfiguration('piChat');
  const piPath: string = config.get('piPath') || 'pi';

  // 1. pi binary
  const piOk = checkPiBinary(piPath);
  items.push({
    name: 'pi binary',
    description: piOk ? 'Found at ' + findPiPath(piPath) : 'Not found on PATH',
    ok: piOk,
    action: piOk ? undefined : 'bun add -g @earendil-works/pi-coding-agent',
  });

  // 2. bun
  const bunOk = checkBinaryOnPath('bun');
  items.push({
    name: 'bun',
    description: bunOk ? 'Found' : 'Not found (package manager for pi)',
    ok: bunOk,
    action: bunOk ? undefined : 'curl -fsSL https://bun.sh/install | bash',
  });

  // 3. node
  const nodeOk = checkBinaryOnPath('node');
  items.push({
    name: 'node',
    description: nodeOk ? 'Found' : 'Not found',
    ok: nodeOk,
  });

  // 4. pi npm global package
  const piNpmOk = checkNpmGlobal('@earendil-works/pi-coding-agent');
  items.push({
    name: '@earendil-works/pi-coding-agent (npm global)',
    description: piNpmOk ? 'Installed globally' : 'Not installed globally',
    ok: piNpmOk,
    action: piNpmOk ? undefined : 'bun add -g @earendil-works/pi-coding-agent',
  });

  // 5. Key pi skills
  const piSkills = [
    { name: 'context-mode', desc: 'Session-aware context management' },
    { name: 'pi-superpowers', desc: 'Plans, review, debugging superpowers' },
    { name: 'pi-subagents', desc: 'Multi-agent orchestration' },
    { name: 'pi-agents-team', desc: 'Team-based delegation' },
    { name: 'pi-caveman', desc: 'Token compression' },
    { name: 'pi-web-access', desc: 'Web research' },
    { name: 'pi-mcp-adapter', desc: 'MCP server connectivity' },
  ];

  const skillDirs = [
    path.join(os.homedir(), '.pi', 'agent', 'npm', 'node_modules'),
    path.join(os.homedir(), '.pi', 'agent', 'extensions'),
    path.join(os.homedir(), '.agents', 'skills'),
  ];

  for (const skill of piSkills) {
    const found = checkPiSkill(skill.name, skillDirs);
    items.push({
      name: skill.name,
      description: found ? 'Installed' : 'Not installed — ' + skill.desc,
      ok: found,
      action: found ? undefined : `bun add -g ${skill.name}`,
    });
  }

  // 6. Project build deps
  const projDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || context.extensionPath;
  const markdownOk = fs.existsSync(path.join(projDir, 'node_modules', 'marked'));
  items.push({
    name: 'marked (build dep)',
    description: markdownOk ? 'Installed' : 'Not installed — run bun install',
    ok: markdownOk,
    action: markdownOk ? undefined : 'bun install',
  });

  const hljsOk = fs.existsSync(path.join(projDir, 'node_modules', 'highlight.js'));
  items.push({
    name: 'highlight.js (build dep)',
    description: hljsOk ? 'Installed' : 'Not installed — run bun install',
    ok: hljsOk,
    action: hljsOk ? undefined : 'bun install',
  });

  // ── Show results ──
  const missing = items.filter(i => !i.ok);
  const okCount = items.filter(i => i.ok).length;
  const total = items.length;

  if (missing.length === 0) {
    vscode.window.showInformationMessage(
      `Pi Chat: All ${total} dependencies OK. Ready to use.`,
      'Open Pi Chat',
    ).then(a => {
      if (a === 'Open Pi Chat') {
        vscode.commands.executeCommand('workbench.view.extension.pi-chat');
      }
    });
    return;
  }

  // Show QuickPick with status + install option
  const quickItems: vscode.QuickPickItem[] = missing.map(i => ({
    label: `${i.ok ? '✓' : '✗'} ${i.name}`,
    description: i.description,
    detail: i.action ? `Run: ${i.action}` : undefined,
  }));

  quickItems.unshift({
    label: `$(package) Install All (${missing.length} missing)`,
    description: 'Run install script for all missing dependencies',
    alwaysShow: true,
  });

  vscode.window.showQuickPick(quickItems, {
    placeHolder: `Pi Chat: ${missing.length}/${total} dependencies missing. Select action.`,
  }).then(selected => {
    if (!selected) return;
    if (selected.label.startsWith('$(package) Install All')) {
      runInstall(context);
    }
  });
}

function runInstall(context: vscode.ExtensionContext): void {
  const scriptPath = path.join(context.extensionPath, 'scripts', 'install-deps.sh');

  if (!fs.existsSync(scriptPath)) {
    // Fallback: run commands inline
    runInstallInline();
    return;
  }

  const terminal = vscode.window.createTerminal({
    name: 'Pi Chat Install',
    message: 'Installing Pi Chat dependencies...',
  });
  terminal.show();
  terminal.sendText(`bash "${scriptPath}"`);
  void vscode.window.showInformationMessage(
    'Pi Chat: Installing dependencies in terminal. Follow the prompts.',
  );
}

/** Fallback inline install when script is not available */
function runInstallInline(): void {
  const terminal = vscode.window.createTerminal({
    name: 'Pi Chat Install',
    message: 'Installing Pi Chat dependencies...',
  });
  terminal.show();
  terminal.sendText('# Pi Chat — Installing dependencies');
  terminal.sendText('which bun || curl -fsSL https://bun.sh/install | bash');
  terminal.sendText('bun add -g @earendil-works/pi-coding-agent');
  terminal.sendText('bun add -g context-mode pi-superpowers pi-subagents pi-agents-team pi-caveman pi-web-access pi-mcp-adapter 2>/dev/null; echo "Skills installed (some may not be found — that\'s fine)"');
  terminal.sendText('echo "---"; echo "Pi Chat install complete. Reload VS Code window."');
}

function findPiPath(piPath: string): string {
  if (path.isAbsolute(piPath) && fs.existsSync(piPath)) return piPath;
  const paths = (process.env.PATH || '').split(path.delimiter);
  for (const dir of paths) {
    const full = path.join(dir, piPath);
    if (fs.existsSync(full)) return full;
    if (process.platform === 'win32' && fs.existsSync(full + '.exe')) return full + '.exe';
  }
  return '(not found)';
}

function checkBinaryOnPath(name: string): boolean {
  const paths = (process.env.PATH || '').split(path.delimiter);
  const isWin = process.platform === 'win32';
  for (const dir of paths) {
    const full = path.join(dir, name);
    if (fs.existsSync(full)) return true;
    if (isWin && fs.existsSync(full + '.exe')) return true;
    if (isWin && fs.existsSync(full + '.cmd')) return true;
  }
  return false;
}

function checkNpmGlobal(pkg: string): boolean {
  try {
    const result = cp.execSync('bun pm ls -g 2>/dev/null || npm ls -g --depth=0 2>/dev/null', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
    });
    return result.includes(pkg);
  } catch {
    return false;
  }
}

function checkPiSkill(name: string, dirs: string[]): boolean {
  for (const dir of dirs) {
    const full = path.join(dir, name);
    if (fs.existsSync(full) && fs.statSync(full).isDirectory()) return true;
  }
  // Also check npm global
  return checkNpmGlobal(name);
}
