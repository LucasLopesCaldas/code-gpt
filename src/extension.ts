import { log } from 'console';
import { marked } from 'marked';
import OpenAI from 'openai';
import { APIError } from 'openai/error.mjs';
import * as vscode from 'vscode';

let messages: any[] = [
  {
    role: 'system',
    content: 'You are a vscode assistent',
  },
];

let gptTyping: boolean = false;
const textEditor = vscode.window.activeTextEditor;

export function activate(context: vscode.ExtensionContext) {
  const openai = new OpenAI({
    apiKey: context.workspaceState.get('openaiKey') || '',
  });

  messages.push(...JSON.parse(context.workspaceState.get('messages') || '[]'));
  const provider = new CodeGPTViewProvider(
    context.extensionUri,
    messages,
    async (data) => {
      switch (data.type) {
        case 'submitMessage': {
          const userMessage = processUserMessage(data.value || '');
          if (!userMessage) {
            break;
          }
          messages.push({ role: 'user', content: userMessage });
          gptTyping = true;
          provider.setMessages(messages);
          const gptMessage = processGPTMessage(
            (await gpt(userMessage, messages, openai)) || '',
          );
          
          if (!userMessage) {
            break;
          }
          messages.push({
            role: 'assistant',
            content: gptMessage,
          });
          gptTyping = false;
          provider.setMessages(messages);
          context.workspaceState.update('messages', JSON.stringify(messages));
          break;
        }
      }
    },
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('code-gpt.clearGPTMessages', () => {
      context.workspaceState.update('messages', '[]');
      messages = [];

      provider.setMessages(messages);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('code-gpt.setOpenAIKey', async () => {
      const result = await vscode.window.showInputBox({
        value: '',
        placeHolder: 'OpenAI Key',
      });
      context.workspaceState.update('openaiKey', result);
      openai.apiKey = result || '';
    }),
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      CodeGPTViewProvider.viewId,
      provider,
    ),
  );
}

function processUserMessage(message: string) {
  let selectedText = getSelection();

  let resMessage = message.replaceAll('!sel', selectedText);

  return resMessage;
}

function processGPTMessage(message: string) {
  const re = /```[a-z][\s\S]*\n?```/g;

  let code = re.exec(message)?.reduce((value: string, acc: string) => {
    return (acc + value).replaceAll('```', '');
  }, '');

  if (code) {
    replaceSelection(code.substring(code.indexOf('\n') + 1));
  }

  return message;
}

function replaceSelection(text: string) {
  if (textEditor) {
    textEditor.edit(function (editBuilder: vscode.TextEditorEdit) {
      editBuilder.replace(textEditor.selection, text);
    });
  }
}

function getSelection() {
  if (textEditor) {
    return textEditor.document.getText(
      new vscode.Range(textEditor.selection.start, textEditor.selection.end),
    );
  }
  return '';
}

async function gpt(message: string, lastMessages: any[], openai: OpenAI) {
  try {
    const completion = await openai.chat.completions.create({
      messages: [
        ...lastMessages,
        {
          role: 'user',
          content: message,
        },
      ],
      temperature: 1,
      model: 'gpt-3.5-turbo',
    });

    return completion.choices[0].message.content;
  } catch (err) {
    vscode.window.showErrorMessage((err as APIError).message);
  }
}

class CodeGPTViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'code-gpt.chat';

  private view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly lastMessages: any[],
    private onEvent: (data: any) => void,
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,

      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this.getHtml(
      webviewView.webview,
      this.lastMessages,
    );

    webviewView.webview.onDidReceiveMessage(this.onEvent);
  }

  public setMessages(messages: any[]) {
    if (!this.view) {
      return;
    }
    this.view.webview.html = this.getHtml(this.view.webview, messages);
  }

  public messagesToHtml(messages: any[]): string {
    const items = messages
      .filter((value) => value.role !== 'system')
      .map(
        (message) =>
          `<li class="${message.role}-message">${marked.parse(
            message.content,
          )}</li>`,
      );
    return `<ul>
			${items.join('')}
		</ul>`;
  }

  private getHtml(webview: vscode.Webview, messages: any[]): string {
    const scriptUri = webview?.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'),
    );

    const styleVSCodeUri = webview?.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css'),
    );

    return `<!DOCTYPE html>
		<html lang="en">
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<link href="${styleVSCodeUri}" rel="stylesheet" />
		
				<title>CodeGPT</title>
			</head>
			<body>
				${this.messagesToHtml(messages)}
				${gptTyping ? '<span>Typing...</span>' : ''}
				<textarea
					id="gpt-input"
					name="message"
					rows="10"
					cols="30"
					placeholder="Ask ChatGPT"
				></textarea>
				<script src="${scriptUri}"></script>
			</body>
		</html>
		`;
  }
}
