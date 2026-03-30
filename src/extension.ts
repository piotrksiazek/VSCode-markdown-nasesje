import * as vscode from 'vscode';
import * as path from 'path';

let currentPanel: vscode.WebviewPanel | undefined;
let lastMarkdownEditor: vscode.TextEditor | undefined;

export function activate(context: vscode.ExtensionContext) {
  // Track the last active markdown editor
  const trackEditor = (editor: vscode.TextEditor | undefined) => {
    if (editor && editor.document.languageId === 'markdown') {
      lastMarkdownEditor = editor;
    }
  };

  trackEditor(vscode.window.activeTextEditor);

  const disposable = vscode.commands.registerCommand(
    'markdown-nasesje.openPreview',
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active markdown file.');
        return;
      }

      trackEditor(editor);

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
            ...(vscode.workspace.workspaceFolders?.map(f => f.uri) || []),
            vscode.Uri.file('/'),
          ],
        }
      );

      currentPanel.webview.html = getWebviewContent(
        currentPanel.webview,
        context.extensionUri
      );

      sendContent(currentPanel, editor.document);
      buildWzorMap(currentPanel);

      // Watch image files for changes and bust the webview cache
      const imageWatcher = vscode.workspace.createFileSystemWatcher(
        '**/*.{png,jpg,jpeg,gif,svg,webp,bmp}'
      );

      let imageChangeTimeout: ReturnType<typeof setTimeout> | undefined;
      const onImageChange = () => {
        if (imageChangeTimeout) clearTimeout(imageChangeTimeout);
        imageChangeTimeout = setTimeout(() => {
          if (currentPanel) {
            currentPanel.webview.postMessage({
              type: 'imageChanged',
              timestamp: Date.now(),
            });
          }
        }, 300);
      };

      imageWatcher.onDidChange(onImageChange);
      imageWatcher.onDidCreate(onImageChange);

      // Preview → Editor: receive click from webview, select in editor
      currentPanel.webview.onDidReceiveMessage((message) => {
        if (message.type === 'selectSource') {
          // Use lastMarkdownEditor since activeTextEditor is undefined
          // when the webview panel has focus
          const editor = lastMarkdownEditor;
          if (!editor) return;

          const doc = editor.document;
          const startPos = doc.positionAt(message.start);
          const endPos = doc.positionAt(message.end);
          editor.selection = new vscode.Selection(startPos, endPos);
          editor.revealRange(
            new vscode.Range(startPos, endPos),
            vscode.TextEditorRevealType.InCenterIfOutsideViewport
          );
        }
      });

      currentPanel.onDidDispose(() => {
        imageWatcher.dispose();
        currentPanel = undefined;
      });
    }
  );

  // Update preview on document change
  const changeDisposable = vscode.workspace.onDidChangeTextDocument((e) => {
    if (currentPanel && lastMarkdownEditor) {
      if (e.document === lastMarkdownEditor.document) {
        sendContent(currentPanel, e.document);
      }
    }
  });

  // Update preview when switching tabs
  const editorChangeDisposable = vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      trackEditor(editor);
      if (currentPanel && editor && editor.document.languageId === 'markdown') {
        sendContent(currentPanel, editor.document);
        buildWzorMap(currentPanel);
        currentPanel.title = `NaSesje: ${path.basename(editor.document.fileName)}`;
      }
    }
  );

  // Sync selection: editor → preview
  const selectionDisposable = vscode.window.onDidChangeTextEditorSelection(
    (e) => {
      if (
        currentPanel &&
        e.textEditor.document.languageId === 'markdown'
      ) {
        trackEditor(e.textEditor);
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
  const docDirUri = vscode.Uri.joinPath(document.uri, '..');
  const resourceBaseUrl = panel.webview.asWebviewUri(docDirUri).toString();

  panel.webview.postMessage({
    type: 'update',
    content: document.getText(),
    resourceBaseUrl,
    cacheBust: Date.now(),
  });
}

async function buildWzorMap(panel: vscode.WebviewPanel): Promise<void> {
  const files = await vscode.workspace.findFiles('**/wzory/**/wzor.md');
  const map: Record<string, string> = {};
  const timestamp = Date.now();

  for (const mdUri of files) {
    try {
      const raw = await vscode.workspace.fs.readFile(mdUri);
      const text = Buffer.from(raw).toString('utf-8');
      const fmMatch = text.match(/^---\s*\n([\s\S]*?)\n---/);
      if (!fmMatch) continue;
      const idMatch = fmMatch[1].match(/^id:\s*(.+)$/m);
      if (!idMatch) continue;
      const id = idMatch[1].trim();
      const pngUri = vscode.Uri.joinPath(mdUri, '..', 'wzor.png');
      map[id] = panel.webview.asWebviewUri(pngUri).toString() + `?v=${timestamp}`;
    } catch {
      // skip unreadable files
    }
  }

  panel.webview.postMessage({ type: 'wzorMap', map });
}

function getWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js')
  );

  const katexCssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'katex.min.css')
  );

  const hljsCssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'night-owl.css')
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
