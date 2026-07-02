import * as vscode from 'vscode';
import { PiRpcClient } from './piRpcClient';
import { ChatSidebarProvider } from './chatSidebarProvider';
import { EditManager } from './editManager';

let piClient: PiRpcClient | undefined;
let editManager: EditManager | undefined;
let sidebarProvider: ChatSidebarProvider | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log('[pi-chat] activating...');

  // ── Read config ──
  const config = vscode.workspace.getConfiguration('piChat');
  const piPath: string = config.get('piPath') || 'pi';
  const extraArgs: string[] = config.get('adapterArgs') || [];

  // ── Init services ──
  editManager = new EditManager();
  piClient = new PiRpcClient(piPath, extraArgs);

  // ── Register sidebar ──
  sidebarProvider = new ChatSidebarProvider(context.extensionUri, piClient, editManager);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('piChat.sidebar', sidebarProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  // ── Register commands ──
  context.subscriptions.push(
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

  // ── Start pi process ──
  try {
    piClient.start();
    console.log('[pi-chat] pi process started');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Pi Chat: Failed to start pi process: ${msg}`);
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
