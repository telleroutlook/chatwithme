import type { Message } from '@chatwithme/shared';

/**
 * Export chat conversation to HTML file
 * @param messages - Array of chat messages
 * @param conversationTitle - Title of the conversation
 */
export const exportChatToHtml = (messages: Message[], conversationTitle: string) => {
  const title = `Chat Export - ${conversationTitle} - ${new Date().toLocaleDateString()}`;

  const messagesHtml = messages
    .map((msg) => {
      const isUser = msg.role === 'user';
      const roleLabel = isUser ? 'You' : 'Assistant';
      const alignClass = isUser ? 'items-end' : 'items-start';
      const bubbleClass = isUser
        ? 'bg-blue-600 text-white rounded-br-none'
        : 'bg-white text-gray-900 border border-gray-200 rounded-bl-none';
      const textClass = isUser ? 'text-white/90' : 'text-gray-800';
      const timeClass = isUser ? 'text-blue-100' : 'text-gray-400';

      // Escape HTML entities for safe display
      const safeText = msg.message
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

      return `
      <div class="flex flex-col w-full mb-6 ${alignClass}">
        <div class="max-w-[92%] px-5 py-4 rounded-2xl text-sm leading-relaxed shadow-sm ${bubbleClass}">
          <div class="markdown-content ${textClass}">${safeText}</div>
          <div class="text-[10px] mt-2 flex items-center justify-end gap-1 ${timeClass}">
            ${new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • ${roleLabel}
          </div>
        </div>
      </div>
    `;
    })
    .join('');

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
  <style>
    body { font-family: 'Inter', sans-serif; background-color: #f8fafc; }

    .markdown-content p { margin-bottom: 0.75em; }
    .markdown-content p:last-child { margin-bottom: 0; }
    .markdown-content a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
    .markdown-content ul { list-style-type: disc; margin-left: 1.2em; margin-bottom: 0.75em; }
    .markdown-content ol { list-style-type: decimal; margin-left: 1.2em; margin-bottom: 0.75em; }
    .markdown-content code {
      font-family: monospace;
      font-size: 0.9em;
      padding: 0.1em 0.3em;
      border-radius: 0.25em;
      background-color: rgba(0,0,0,0.1);
    }
    .markdown-content pre {
      background-color: #1e293b;
      color: #e2e8f0;
      padding: 1em;
      border-radius: 0.5em;
      overflow-x: auto;
      margin: 0.75em 0;
    }
    .markdown-content pre code {
      background-color: transparent;
      padding: 0;
      color: inherit;
    }
    .markdown-content blockquote {
      border-left: 3px solid currentColor;
      padding-left: 1em;
      font-style: italic;
      opacity: 0.8;
    }
    .markdown-content table {
      width: 100%;
      border-collapse: collapse;
      margin: 1em 0;
      font-size: 0.9em;
    }
    .markdown-content th, .markdown-content td {
      border: 1px solid rgba(0,0,0,0.1);
      padding: 0.5em;
      text-align: left;
    }
    .markdown-content th { background-color: rgba(0,0,0,0.05); }

    .bg-blue-600 .markdown-content code { background-color: rgba(255,255,255,0.2); }
    .bg-blue-600 .markdown-content pre { background-color: rgba(0,0,0,0.2); }
    .bg-blue-600 .markdown-content th, .bg-blue-600 .markdown-content td { border-color: rgba(255,255,255,0.2); }
    .bg-blue-600 .markdown-content th { background-color: rgba(255,255,255,0.1); }
  </style>
</head>
<body class="min-h-screen py-8 px-4 sm:px-8">
  <div class="max-w-3xl mx-auto">
    <header class="mb-8 text-center">
      <h1 class="text-2xl font-bold text-gray-900">${conversationTitle}</h1>
      <p class="text-sm text-gray-500 mt-1">${new Date().toLocaleString()}</p>
    </header>

    <div class="flex flex-col gap-2">
      ${messagesHtml}
    </div>

    <footer class="mt-12 text-center text-xs text-gray-400">
      <p>Exported from ChatWithMe</p>
    </footer>
  </div>

  <script>
    document.addEventListener('DOMContentLoaded', () => {
      marked.use({ breaks: true, gfm: true });
      document.querySelectorAll('.markdown-content').forEach(el => {
        const txt = document.createElement('textarea');
        txt.innerHTML = el.innerHTML;
        el.innerHTML = marked.parse(txt.value);
      });
    });
  </script>
</body>
</html>
  `;

  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const datePart = new Date().toISOString().slice(0, 10);
  const safeTitle = makeSafeFileName(conversationTitle);
  triggerDownload(blob, `chat-export-${safeTitle}-${datePart}.html`);
};

/**
 * Create a safe file name from a string
 */
function makeSafeFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Trigger browser download of a blob
 */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
