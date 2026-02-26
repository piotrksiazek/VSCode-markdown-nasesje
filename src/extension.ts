import * as vscode from 'vscode';
import * as path from 'path';

let currentPanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    'markdown-nasesje.openPreview',
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active markdown file.');
        return;
      }

      if (currentPanel) {
        currentPanel.reveal(vscode.ViewColumn.Beside);
        sendContent(currentPanel, editor.document);
        return;
      }

      currentPanel = vscode.window.createWebviewPanel(
        'markdownNasesje',
        'NaSesje Preview',
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.joinPath(context.extensionUri, 'dist'),
            vscode.Uri.joinPath(context.extensionUri, 'node_modules', 'katex', 'dist'),
            vscode.Uri.joinPath(context.extensionUri, 'node_modules', 'highlight.js', 'styles'),
          ],
        }
      );

      currentPanel.webview.html = getWebviewContent(
        currentPanel.webview,
        context.extensionUri
      );

      sendContent(currentPanel, editor.document);

      currentPanel.onDidDispose(() => {
        currentPanel = undefined;
      });
    }
  );

  // Update preview on document change
  const changeDisposable = vscode.workspace.onDidChangeTextDocument((e) => {
    if (currentPanel && vscode.window.activeTextEditor) {
      if (e.document === vscode.window.activeTextEditor.document) {
        sendContent(currentPanel, e.document);
      }
    }
  });

  // Update preview when switching tabs
  const editorChangeDisposable = vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      if (currentPanel && editor && editor.document.languageId === 'markdown') {
        sendContent(currentPanel, editor.document);
        currentPanel.title = `NaSesje: ${path.basename(editor.document.fileName)}`;
      }
    }
  );

  // Sync selection: editor → preview
  const selectionDisposable = vscode.window.onDidChangeTextEditorSelection(
    (e) => {
      if (
        currentPanel &&
        e.textEditor === vscode.window.activeTextEditor &&
        e.textEditor.document.languageId === 'markdown'
      ) {
        const doc = e.textEditor.document;
        const sel = e.selections[0];
        currentPanel.webview.postMessage({
          type: 'selection',
          start: doc.offsetAt(sel.start),
          end: doc.offsetAt(sel.end),
        });
      }
    }
  );

  context.subscriptions.push(
    disposable,
    changeDisposable,
    editorChangeDisposable,
    selectionDisposable
  );
}

function sendContent(panel: vscode.WebviewPanel, document: vscode.TextDocument) {
  panel.webview.postMessage({
    type: 'update',
    content: document.getText(),
  });
}

function getWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js')
  );

  const katexCssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'node_modules', 'katex', 'dist', 'katex.min.css')
  );

  const hljsCssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'node_modules', 'highlight.js', 'styles', 'night-owl.css')
  );

  const webviewCssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview.css')
  );

  const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https: data:;">
  <link rel="stylesheet" href="${katexCssUri}">
  <link rel="stylesheet" href="${hljsCssUri}">
  <link rel="stylesheet" href="${webviewCssUri}">
  <title>NaSesje Preview</title>
</head>
<body>
  <div id="preview"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function deactivate() {}
